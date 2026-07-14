import { ApiError, IdempotencyConflictError } from './errors.js';
import { render } from './render.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Slice B09 — Envío transaccional individual.
 *
 * Dispara un email individual: valida el destinatario, resuelve el contenido
 * (plantilla o inline), garantiza idempotencia por tenant, crea el registro
 * `message` con estado `queued` y encola el job de envío.
 *
 * @param {{ store: object, queue: object }} deps
 * @param {{ apiKey: object, body: object }} input - apiKey autenticada + payload
 * @returns {{ message: object, deduplicated: boolean }}
 */
export function sendTransactionalEmail({ store, queue }, { apiKey, body }) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'invalid_request', 'cuerpo de la petición requerido');
  }

  const to = body.to;
  if (!to || typeof to !== 'string' || !EMAIL_RE.test(to)) {
    throw new ApiError(400, 'invalid_request', 'destinatario "to" inválido o ausente');
  }

  const hasTemplate = body.template_id != null && body.template_id !== '';
  const hasInline =
    body.subject != null && (body.html != null || body.text != null);

  if (!hasTemplate && !hasInline) {
    throw new ApiError(
      400,
      'invalid_request',
      'debe indicar "template_id" o contenido inline ("subject" + "html"/"text")'
    );
  }
  if (hasTemplate && (body.subject != null || body.html != null || body.text != null)) {
    throw new ApiError(
      400,
      'invalid_request',
      'no combine "template_id" con contenido inline'
    );
  }

  const idempotencyKey =
    body.idempotency_key != null && body.idempotency_key !== ''
      ? String(body.idempotency_key)
      : null;

  // Idempotencia: si ya existe un message con esa key para el tenant, se
  // devuelve el existente sin volver a encolar (no genera duplicados).
  if (idempotencyKey) {
    const existing = store.findMessageByIdempotencyKey(apiKey.tenant_id, idempotencyKey);
    if (existing) {
      return { message: existing, deduplicated: true };
    }
  }

  const vars =
    body.variables && typeof body.variables === 'object' ? body.variables : {};

  let subject;
  let html;
  let text;
  let templateId = null;

  if (hasTemplate) {
    const tpl = store.findTemplate(apiKey.tenant_id, body.template_id);
    if (!tpl) {
      throw new ApiError(404, 'not_found', 'plantilla no encontrada');
    }
    subject = render(tpl.subject, vars);
    html = render(tpl.body_html, vars);
    text = render(tpl.body_text, vars);
    templateId = tpl.id;
  } else {
    subject = render(body.subject, vars);
    html = body.html != null ? render(body.html, vars) : null;
    text = body.text != null ? render(body.text, vars) : null;
  }

  let message;
  try {
    message = store.createMessage({
      tenant_id: apiKey.tenant_id,
      to_email: to,
      template_id: templateId,
      subject,
      status: 'queued',
      idempotency_key: idempotencyKey,
    });
  } catch (err) {
    // Carrera contra el índice único de idempotencia: devolvemos el existente.
    if (err instanceof IdempotencyConflictError) {
      const existing = store.findMessageByIdempotencyKey(apiKey.tenant_id, idempotencyKey);
      return { message: existing, deduplicated: true };
    }
    throw err;
  }

  queue.enqueue('send-email', {
    message_id: message.id,
    tenant_id: apiKey.tenant_id,
    to_email: message.to_email,
    subject,
    html,
    text,
    template_id: templateId,
  });

  return { message, deduplicated: false };
}
