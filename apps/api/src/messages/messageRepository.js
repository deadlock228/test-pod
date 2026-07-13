/**
 * Repositorio de mensajes y sus eventos.
 *
 * Define la interfaz que consume {@link module:messages/messageService}.
 * Una implementación real contra PostgreSQL debe cumplir el mismo contrato
 * (filtrando SIEMPRE por `tenant_id` para respetar el aislamiento multi-tenant):
 *
 *   - findMessages({ tenantId, status, campaignId, offset, limit })
 *       -> Promise<{ rows: Message[], total: number }>
 *   - findMessageById({ tenantId, id }) -> Promise<Message|null>
 *   - findEventsByMessageId({ tenantId, messageId }) -> Promise<EmailEvent[]>
 *
 * Se incluye una implementación en memoria para tests y desarrollo local.
 */

/** @typedef {import('./messageService.js').Message} Message */

/**
 * Repositorio en memoria. Útil para tests unitarios sin base de datos.
 */
export class InMemoryMessageRepository {
  /**
   * @param {{ messages?: object[], events?: object[] }} [seed]
   */
  constructor({ messages = [], events = [] } = {}) {
    this.messages = messages;
    this.events = events;
  }

  /**
   * Lista mensajes de un tenant aplicando filtros y paginación.
   * Ordena por `created_at` descendente (los más recientes primero).
   */
  async findMessages({ tenantId, status = null, campaignId = null, offset = 0, limit = 20 }) {
    let rows = this.messages.filter((m) => m.tenant_id === tenantId);

    if (status) {
      rows = rows.filter((m) => m.status === status);
    }
    if (campaignId) {
      rows = rows.filter((m) => m.campaign_id === campaignId);
    }

    rows = rows
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = rows.length;
    const paged = rows.slice(offset, offset + limit);
    return { rows: paged, total };
  }

  /**
   * Busca un mensaje por id dentro del tenant. Devuelve null si no existe
   * o si pertenece a otro tenant.
   */
  async findMessageById({ tenantId, id }) {
    return this.messages.find((m) => m.tenant_id === tenantId && m.id === id) || null;
  }

  /**
   * Devuelve los eventos de un mensaje, ordenados por `occurred_at` ascendente.
   */
  async findEventsByMessageId({ tenantId, messageId }) {
    return this.events
      .filter((e) => e.tenant_id === tenantId && e.message_id === messageId)
      .slice()
      .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  }
}
