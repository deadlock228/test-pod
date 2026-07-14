/**
 * Worker de envío de emails.
 *
 * Consume jobs de la cola y, por cada uno:
 *   1. Respeta el rate limit por tenant (si no hay cupo, reencola con delay).
 *   2. Llama al proveedor de email (adaptador con método async `send(message)`).
 *   3. Actualiza el estado del message: queued -> sent | failed.
 *   4. Ante fallos transitorios, reintenta con backoff exponencial hasta
 *      `maxAttempts`; ante fallos permanentes, marca `failed` de inmediato.
 *
 * Todas las dependencias se inyectan para poder testear de forma determinista.
 */

import { computeBackoff } from './backoff.js';
import { MessageStatus } from './messageStore.js';
import { isTransient } from './errors.js';

export class SendWorker {
  /**
   * @param {{
   *   queue: { enqueue: Function, dequeue: Function, size?: Function },
   *   store: { create: Function, get: Function, update: Function },
   *   provider: { send: (message: any) => Promise<{ providerMessageId?: string } | void> },
   *   rateLimiter?: { tryRemove: (t: string) => boolean, msUntilAvailable: (t: string) => number },
   *   maxAttempts?: number,
   *   backoff?: import('./backoff.js').BackoffOptions,
   *   now?: () => number,
   *   logger?: (event: any) => void,
   * }} deps
   */
  constructor({
    queue,
    store,
    provider,
    rateLimiter = null,
    maxAttempts = 5,
    backoff = {},
    now = () => Date.now(),
    logger = () => {},
  }) {
    if (!queue) throw new Error('queue is required');
    if (!store) throw new Error('store is required');
    if (!provider || typeof provider.send !== 'function') {
      throw new Error('provider with async send() is required');
    }
    this.queue = queue;
    this.store = store;
    this.provider = provider;
    this.rateLimiter = rateLimiter;
    this.maxAttempts = maxAttempts;
    this.backoff = backoff;
    this.now = now;
    this.logger = logger;
    this._running = false;
  }

  /**
   * Crea el message (estado `queued`) y lo encola para su envío.
   * @param {{ id: string, tenantId: string, [k: string]: any }} message
   */
  enqueueMessage(message) {
    const record = this.store.create(message);
    this.queue.enqueue({ messageId: record.id, tenantId: record.tenantId, attempt: 0 });
    this.logger({ type: 'enqueued', messageId: record.id, tenantId: record.tenantId });
    return record;
  }

  /**
   * Procesa (a lo sumo) un job de la cola.
   * @returns {Promise<{ status: string, [k: string]: any }>}
   */
  async processNext() {
    const job = this.queue.dequeue();
    if (!job) return { status: 'idle' };

    const { messageId, tenantId } = job.payload;
    const attempt = (job.payload.attempt || 0) + 1;

    // 1) Rate limit por tenant.
    if (this.rateLimiter && !this.rateLimiter.tryRemove(tenantId)) {
      const delayMs = this.rateLimiter.msUntilAvailable(tenantId);
      // Reencola sin consumir intento: el envío no falló, sólo se pospone.
      this.queue.enqueue({ ...job.payload }, { delayMs });
      this.logger({ type: 'rate_limited', messageId, tenantId, delayMs });
      return { status: 'rate_limited', messageId, tenantId, delayMs };
    }

    const message = this.store.get(messageId);
    if (!message) {
      this.logger({ type: 'message_missing', messageId });
      return { status: 'skipped', messageId, reason: 'message_not_found' };
    }

    // 2) Envío vía proveedor.
    try {
      const result = await this.provider.send(message);
      this.store.update(messageId, {
        status: MessageStatus.SENT,
        providerMessageId: (result && result.providerMessageId) || null,
        error: null,
        attempts: attempt,
      });
      this.logger({ type: 'sent', messageId, tenantId, attempt });
      return { status: 'sent', messageId, tenantId, attempt };
    } catch (err) {
      const transient = isTransient(err);
      const errorMsg = (err && err.message) || String(err);

      // 3) Reintento con backoff si es transitorio y quedan intentos.
      if (transient && attempt < this.maxAttempts) {
        const delayMs = computeBackoff(attempt, this.backoff);
        this.queue.enqueue({ messageId, tenantId, attempt }, { delayMs });
        this.store.update(messageId, {
          status: MessageStatus.QUEUED,
          attempts: attempt,
          error: errorMsg,
        });
        this.logger({ type: 'retry', messageId, tenantId, attempt, delayMs, error: errorMsg });
        return { status: 'retry', messageId, tenantId, attempt, delayMs };
      }

      // 4) Fallo permanente o agotados los intentos.
      this.store.update(messageId, {
        status: MessageStatus.FAILED,
        attempts: attempt,
        error: errorMsg,
      });
      this.logger({ type: 'failed', messageId, tenantId, attempt, transient, error: errorMsg });
      return { status: 'failed', messageId, tenantId, attempt, error: errorMsg };
    }
  }

  /**
   * Loop de ejecución continuo. Procesa jobs hasta que se llame a stop().
   * Cuando la cola está vacía, espera `idleMs` antes de volver a chequear.
   * @param {{ idleMs?: number, sleep?: (ms: number) => Promise<void> }} [opts]
   */
  async run({ idleMs = 100, sleep = defaultSleep } = {}) {
    this._running = true;
    while (this._running) {
      const res = await this.processNext();
      if (res.status === 'idle') {
        await sleep(idleMs);
      }
    }
  }

  stop() {
    this._running = false;
  }
}

/** @param {number} ms */
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
