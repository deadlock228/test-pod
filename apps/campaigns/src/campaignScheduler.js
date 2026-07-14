// Programación de envíos de campañas (B12).
//
// Responsabilidades:
//  - schedule(): fijar `scheduled_at` en una campaña y pasarla a estado `scheduled`.
//  - cancel(): cancelar una campaña programada ANTES del envío (vuelve a `draft`).
//  - dispatchDue(): enviar automáticamente las campañas cuya hora ya llegó.
//
// El envío real se delega a un `sender` (adaptador de cola/worker, ver arquitectura).
// El reloj se inyecta vía `now` para hacer el comportamiento determinista y testeable.

import { CampaignStatus, toMillis } from './campaignRepository.js';
import { InvalidScheduleError, InvalidStateError } from './errors.js';

export class CampaignScheduler {
  #repo;
  #sender;
  #clock;

  /**
   * @param {object} deps
   * @param {import('./campaignRepository.js').CampaignRepository} deps.repository
   * @param {(campaign: object) => (void|Promise<void>)} [deps.sender] encola/envía la campaña
   * @param {() => (number|Date)} [deps.clock] fuente de tiempo actual
   */
  constructor({ repository, sender, clock } = {}) {
    if (!repository) throw new Error('CampaignScheduler requiere un repository');
    this.#repo = repository;
    this.#sender = sender ?? (() => {});
    this.#clock = clock ?? (() => Date.now());
  }

  #now(override) {
    return override != null ? toMillis(override) : toMillis(this.#clock());
  }

  /**
   * Fija `scheduled_at` en una campaña para envío futuro.
   * Solo se puede programar una campaña en estado `draft` o re-programar una `scheduled`.
   * La fecha debe ser estrictamente futura respecto al "ahora".
   *
   * @returns {object} la campaña actualizada (copia)
   */
  schedule(campaignId, scheduledAt, { now } = {}) {
    if (scheduledAt == null) {
      throw new InvalidScheduleError('scheduled_at es obligatorio para programar');
    }
    let scheduledMs;
    try {
      scheduledMs = toMillis(scheduledAt);
    } catch (err) {
      throw new InvalidScheduleError(`scheduled_at inválido: ${err.message}`);
    }

    const campaign = this.#repo.getById(campaignId);

    if (![CampaignStatus.DRAFT, CampaignStatus.SCHEDULED].includes(campaign.status)) {
      throw new InvalidStateError(
        `No se puede programar una campaña en estado '${campaign.status}'`,
      );
    }

    const nowMs = this.#now(now);
    if (scheduledMs <= nowMs) {
      throw new InvalidScheduleError('scheduled_at debe ser una fecha/hora futura');
    }

    campaign.scheduled_at = new Date(scheduledMs).toISOString();
    campaign.status = CampaignStatus.SCHEDULED;
    campaign.sent_at = null;
    campaign.error = null;
    return { ...campaign };
  }

  /**
   * Cancela una campaña programada antes de su envío.
   * Vuelve al estado `draft` y limpia `scheduled_at`.
   * Falla si la campaña ya salió de `scheduled` (sending/sent/failed).
   *
   * @returns {object} la campaña actualizada (copia)
   */
  cancel(campaignId) {
    const campaign = this.#repo.getById(campaignId);
    if (campaign.status !== CampaignStatus.SCHEDULED) {
      throw new InvalidStateError(
        `Solo se puede cancelar una campaña programada; estado actual: '${campaign.status}'`,
      );
    }
    campaign.scheduled_at = null;
    campaign.status = CampaignStatus.DRAFT;
    return { ...campaign };
  }

  /**
   * Envía automáticamente todas las campañas cuya hora programada ya llegó.
   * Idempotente por estado: al pasar a `sending`/`sent` no vuelven a dispararse.
   *
   * @returns {Promise<object[]>} resultado por campaña procesada
   */
  async dispatchDue({ now, tenant_id } = {}) {
    const nowMs = this.#now(now);
    const due = this.#repo.findDueScheduled(nowMs, { tenant_id });
    const results = [];

    for (const campaign of due) {
      campaign.status = CampaignStatus.SENDING;
      try {
        await this.#sender({ ...campaign });
        campaign.status = CampaignStatus.SENT;
        campaign.sent_at = new Date(nowMs).toISOString();
        campaign.error = null;
        results.push({ id: campaign.id, status: campaign.status, error: null });
      } catch (err) {
        campaign.status = CampaignStatus.FAILED;
        campaign.error = err?.message ?? String(err);
        results.push({ id: campaign.id, status: campaign.status, error: campaign.error });
      }
    }
    return results;
  }
}
