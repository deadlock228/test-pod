/**
 * Servicio de historial y detalle de mensajes (B16).
 *
 * Reglas de negocio:
 *  - Todas las consultas se aíslan por `tenantId` (multi-tenant).
 *  - El listado admite filtros por estado (`status`) y campaña (`campaignId`).
 *  - El listado es paginado (page / pageSize) y devuelve metadatos de paginación.
 *  - El detalle de un mensaje incluye sus eventos de tracking.
 */

/**
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} tenant_id
 * @property {string|null} campaign_id
 * @property {string|null} contact_id
 * @property {string} to_email
 * @property {string} subject
 * @property {string} status
 * @property {string} [provider_message_id]
 * @property {string} created_at
 */

/** Estados válidos de un mensaje (ver docs/modelo-datos.md). */
export const MESSAGE_STATUSES = ['queued', 'sent', 'delivered', 'bounced', 'failed'];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Error de validación de entrada (mapea a HTTP 400). */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

/**
 * Normaliza y acota los parámetros de paginación.
 * @param {{ page?: number|string, pageSize?: number|string }} params
 * @returns {{ page: number, pageSize: number }}
 */
export function normalizePagination(params = {}) {
  let page = Number.parseInt(params.page, 10);
  let pageSize = Number.parseInt(params.pageSize, 10);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  return { page, pageSize };
}

/**
 * Crea el servicio de mensajes sobre un repositorio dado.
 * @param {import('./messageRepository.js').InMemoryMessageRepository} repository
 */
export function createMessageService(repository) {
  /**
   * Lista los mensajes del tenant con filtros y paginación.
   * @param {string} tenantId
   * @param {{ status?: string, campaignId?: string, page?: number|string, pageSize?: number|string }} [params]
   */
  async function listMessages(tenantId, params = {}) {
    if (!tenantId) throw new ValidationError('tenantId es requerido');

    const status = params.status ?? null;
    const campaignId = params.campaignId ?? null;

    if (status !== null && !MESSAGE_STATUSES.includes(status)) {
      throw new ValidationError(
        `status inválido: "${status}". Valores permitidos: ${MESSAGE_STATUSES.join(', ')}`,
      );
    }

    const { page, pageSize } = normalizePagination(params);
    const offset = (page - 1) * pageSize;

    const { rows, total } = await repository.findMessages({
      tenantId,
      status,
      campaignId,
      offset,
      limit: pageSize,
    });

    return {
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Devuelve el detalle de un mensaje con sus eventos, o null si no existe
   * en el tenant.
   * @param {string} tenantId
   * @param {string} id
   */
  async function getMessage(tenantId, id) {
    if (!tenantId) throw new ValidationError('tenantId es requerido');
    if (!id) throw new ValidationError('id es requerido');

    const message = await repository.findMessageById({ tenantId, id });
    if (!message) return null;

    const events = await repository.findEventsByMessageId({ tenantId, messageId: id });
    return { ...message, events };
  }

  return { listMessages, getMessage };
}
