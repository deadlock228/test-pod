/**
 * Store de mensajes en memoria.
 *
 * Modela el subconjunto de la entidad `message` (ver docs/modelo-datos.md) que
 * el worker necesita para actualizar el estado del envío. En producción esto se
 * respalda en PostgreSQL; la interfaz (create/get/update) se mantiene igual.
 */

/** Estados relevantes para el ciclo de envío. */
export const MessageStatus = Object.freeze({
  QUEUED: 'queued',
  SENT: 'sent',
  FAILED: 'failed',
});

export class InMemoryMessageStore {
  constructor() {
    /** @type {Map<string, any>} */
    this._messages = new Map();
  }

  /**
   * Crea un message. Nace en estado `queued`.
   * @param {{ id: string, tenantId: string, toEmail?: string, subject?: string, [k: string]: any }} msg
   */
  create(msg) {
    if (!msg || !msg.id) throw new Error('message.id is required');
    if (!msg.tenantId) throw new Error('message.tenantId is required');
    const record = {
      status: MessageStatus.QUEUED,
      providerMessageId: null,
      error: null,
      attempts: 0,
      ...msg,
    };
    this._messages.set(record.id, record);
    return record;
  }

  /** @param {string} id */
  get(id) {
    return this._messages.get(id);
  }

  /**
   * Aplica un patch parcial sobre el message y lo devuelve.
   * @param {string} id
   * @param {Partial<Record<string, any>>} patch
   */
  update(id, patch) {
    const m = this._messages.get(id);
    if (!m) throw new Error(`message not found: ${id}`);
    Object.assign(m, patch);
    return m;
  }

  /** Todos los messages (para inspección/tests). */
  all() {
    return [...this._messages.values()];
  }
}
