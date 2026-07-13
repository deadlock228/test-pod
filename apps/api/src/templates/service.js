import { randomUUID } from "node:crypto";
import { InMemoryTemplateStore } from "./store.js";
import { renderTemplate } from "./render.js";

/**
 * Error de validación de negocio. El controlador HTTP lo mapea a 400.
 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.code = "VALIDATION_ERROR";
  }
}

/**
 * Error de recurso inexistente. El controlador HTTP lo mapea a 404.
 */
export class NotFoundError extends Error {
  constructor(message = "template not found") {
    super(message);
    this.name = "NotFoundError";
    this.code = "NOT_FOUND";
  }
}

function requireTenant(tenantId) {
  if (!tenantId || typeof tenantId !== "string") {
    throw new ValidationError("tenantId is required");
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value : "";
}

/**
 * Valida y normaliza el payload de creación/edición.
 * - `name` y `subject` son obligatorios.
 * - Debe existir al menos un cuerpo (`body_html` o `body_text`).
 */
function validateInput(input, { partial = false, current = null } = {}) {
  if (input == null || typeof input !== "object") {
    throw new ValidationError("template payload is required");
  }

  const merged = {
    name: input.name ?? current?.name,
    subject: input.subject ?? current?.subject,
    body_html: input.body_html ?? current?.body_html ?? "",
    body_text: input.body_text ?? current?.body_text ?? "",
  };

  if (!partial || input.name !== undefined) {
    if (!merged.name || !normalizeString(merged.name).trim()) {
      throw new ValidationError("name is required");
    }
  }
  if (!partial || input.subject !== undefined) {
    if (!merged.subject || !normalizeString(merged.subject).trim()) {
      throw new ValidationError("subject is required");
    }
  }

  const hasBody =
    normalizeString(merged.body_html).trim() !== "" ||
    normalizeString(merged.body_text).trim() !== "";
  if (!hasBody) {
    throw new ValidationError("body_html or body_text is required");
  }

  return {
    name: normalizeString(merged.name).trim(),
    subject: normalizeString(merged.subject),
    body_html: normalizeString(merged.body_html),
    body_text: normalizeString(merged.body_text),
  };
}

/**
 * Servicio de plantillas de email (B06).
 * Ofrece CRUD aislado por tenant y previsualización con variables.
 */
export class TemplateService {
  constructor(store = new InMemoryTemplateStore(), { now = () => new Date() } = {}) {
    this.store = store;
    this._now = now;
  }

  /** Crea una plantilla para el tenant. */
  create(tenantId, input) {
    requireTenant(tenantId);
    const data = validateInput(input);
    const timestamp = this._now().toISOString();
    const template = {
      id: randomUUID(),
      tenant_id: tenantId,
      name: data.name,
      subject: data.subject,
      body_html: data.body_html,
      body_text: data.body_text,
      created_at: timestamp,
      updated_at: timestamp,
    };
    return this.store.insert(template);
  }

  /** Obtiene una plantilla del tenant o lanza NotFoundError. */
  get(tenantId, id) {
    requireTenant(tenantId);
    const template = this.store.findById(tenantId, id);
    if (!template) throw new NotFoundError();
    return template;
  }

  /** Lista las plantillas del tenant. */
  list(tenantId) {
    requireTenant(tenantId);
    return this.store.list(tenantId);
  }

  /** Edita una plantilla existente del tenant (patch parcial). */
  update(tenantId, id, patch) {
    requireTenant(tenantId);
    const current = this.store.findById(tenantId, id);
    if (!current) throw new NotFoundError();
    const data = validateInput(patch, { partial: true, current });
    const updated = {
      ...current,
      ...data,
      id: current.id,
      tenant_id: current.tenant_id,
      created_at: current.created_at,
      updated_at: this._now().toISOString(),
    };
    return this.store.update(tenantId, id, updated);
  }

  /** Elimina una plantilla del tenant. Lanza NotFoundError si no existe. */
  delete(tenantId, id) {
    requireTenant(tenantId);
    const existed = this.store.remove(tenantId, id);
    if (!existed) throw new NotFoundError();
    return { id, deleted: true };
  }

  /**
   * Previsualiza una plantilla renderizando subject/body con variables.
   * No persiste nada; devuelve el resultado renderizado.
   */
  preview(tenantId, id, variables = {}) {
    const template = this.get(tenantId, id);
    return {
      id: template.id,
      ...renderTemplate(template, variables),
    };
  }

  /**
   * Previsualiza un payload de plantilla sin necesidad de guardarla antes
   * (útil para el editor de la SPA mientras se escribe).
   */
  previewDraft(input, variables = {}) {
    const data = validateInput(input);
    return renderTemplate(data, variables);
  }
}
