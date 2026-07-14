import { TemplateService, ValidationError, NotFoundError } from "./service.js";

/**
 * Controlador REST framework-agnóstico para plantillas.
 *
 * Cada método recibe un `ctx` con `{ tenantId, params, body }` y devuelve
 * `{ status, body }`. Así puede montarse sobre Express/Fastify/http nativo sin
 * acoplar el dominio a un framework concreto.
 *
 * Rutas cubiertas:
 *   POST   /templates              -> create
 *   GET    /templates              -> list
 *   GET    /templates/:id          -> get
 *   PUT    /templates/:id          -> update
 *   DELETE /templates/:id          -> delete
 *   POST   /templates/:id/preview  -> preview
 *   POST   /templates/preview      -> previewDraft
 */
export class TemplateController {
  constructor(service = new TemplateService()) {
    this.service = service;
  }

  _run(fn) {
    try {
      return fn();
    } catch (err) {
      if (err instanceof ValidationError) {
        return { status: 400, body: { error: err.code, message: err.message } };
      }
      if (err instanceof NotFoundError) {
        return { status: 404, body: { error: err.code, message: err.message } };
      }
      throw err;
    }
  }

  create(ctx) {
    return this._run(() => ({
      status: 201,
      body: this.service.create(ctx.tenantId, ctx.body),
    }));
  }

  list(ctx) {
    return this._run(() => ({
      status: 200,
      body: this.service.list(ctx.tenantId),
    }));
  }

  get(ctx) {
    return this._run(() => ({
      status: 200,
      body: this.service.get(ctx.tenantId, ctx.params.id),
    }));
  }

  update(ctx) {
    return this._run(() => ({
      status: 200,
      body: this.service.update(ctx.tenantId, ctx.params.id, ctx.body),
    }));
  }

  delete(ctx) {
    return this._run(() => ({
      status: 200,
      body: this.service.delete(ctx.tenantId, ctx.params.id),
    }));
  }

  preview(ctx) {
    return this._run(() => ({
      status: 200,
      body: this.service.preview(ctx.tenantId, ctx.params.id, ctx.body?.variables ?? {}),
    }));
  }

  previewDraft(ctx) {
    return this._run(() => ({
      status: 200,
      body: this.service.previewDraft(ctx.body?.template ?? ctx.body, ctx.body?.variables ?? {}),
    }));
  }
}
