// Repositorio en memoria de campañas.
//
// Refleja la entidad `campaign` del modelo de datos (docs/modelo-datos.md):
//   id, tenant_id, name, template_id, list_id, status, scheduled_at, sent_at.
// Mantiene el aislamiento multi-tenant filtrando por `tenant_id` en las consultas.

import { CampaignNotFoundError } from './errors.js';

export const CampaignStatus = Object.freeze({
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
});

export class CampaignRepository {
  #byId = new Map();

  /**
   * Inserta una campaña. Aplica valores por defecto coherentes con el modelo.
   */
  save(campaign) {
    if (!campaign || !campaign.id) {
      throw new Error('La campaña requiere un id');
    }
    const stored = {
      id: campaign.id,
      tenant_id: campaign.tenant_id ?? null,
      name: campaign.name ?? null,
      template_id: campaign.template_id ?? null,
      list_id: campaign.list_id ?? null,
      status: campaign.status ?? CampaignStatus.DRAFT,
      scheduled_at: campaign.scheduled_at ?? null,
      sent_at: campaign.sent_at ?? null,
      error: campaign.error ?? null,
    };
    this.#byId.set(stored.id, stored);
    return { ...stored };
  }

  findById(id) {
    const found = this.#byId.get(id);
    return found ? { ...found } : null;
  }

  getById(id) {
    const found = this.#byId.get(id);
    if (!found) throw new CampaignNotFoundError(id);
    return found; // referencia interna para mutación controlada por el service
  }

  /**
   * Devuelve las campañas programadas cuya hora ya llegó (scheduled_at <= now).
   * Ordenadas por scheduled_at ascendente para enviar en orden.
   */
  findDueScheduled(now, { tenant_id } = {}) {
    const nowMs = toMillis(now);
    const due = [];
    for (const c of this.#byId.values()) {
      if (c.status !== CampaignStatus.SCHEDULED) continue;
      if (c.scheduled_at == null) continue;
      if (tenant_id != null && c.tenant_id !== tenant_id) continue;
      if (toMillis(c.scheduled_at) <= nowMs) due.push(c);
    }
    due.sort((a, b) => toMillis(a.scheduled_at) - toMillis(b.scheduled_at));
    return due;
  }
}

export function toMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) throw new TypeError(`Fecha inválida: ${value}`);
    return ms;
  }
  throw new TypeError(`Tipo de fecha no soportado: ${typeof value}`);
}
