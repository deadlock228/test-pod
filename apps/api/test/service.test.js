import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TemplateService,
  ValidationError,
  NotFoundError,
} from "../src/templates/service.js";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

function validInput(overrides = {}) {
  return {
    name: "Bienvenida",
    subject: "Hola {{nombre}}",
    body_html: "<p>Hola {{nombre}}</p>",
    body_text: "Hola {{nombre}}",
    ...overrides,
  };
}

// --- Criterio: crear plantillas del tenant ---
test("create guarda name, subject, body_html y body_text", () => {
  const svc = new TemplateService();
  const tpl = svc.create(TENANT_A, validInput());
  assert.ok(tpl.id, "debe asignar id");
  assert.equal(tpl.tenant_id, TENANT_A);
  assert.equal(tpl.name, "Bienvenida");
  assert.equal(tpl.subject, "Hola {{nombre}}");
  assert.equal(tpl.body_html, "<p>Hola {{nombre}}</p>");
  assert.equal(tpl.body_text, "Hola {{nombre}}");
  assert.ok(tpl.created_at && tpl.updated_at);
});

test("create y get respetan el aislamiento por tenant", () => {
  const svc = new TemplateService();
  const tplA = svc.create(TENANT_A, validInput());
  // Otro tenant no puede ver la plantilla ajena
  assert.throws(() => svc.get(TENANT_B, tplA.id), NotFoundError);
  assert.equal(svc.list(TENANT_B).length, 0);
  assert.equal(svc.list(TENANT_A).length, 1);
});

test("create valida campos obligatorios", () => {
  const svc = new TemplateService();
  assert.throws(() => svc.create(TENANT_A, validInput({ name: "" })), ValidationError);
  assert.throws(() => svc.create(TENANT_A, validInput({ subject: "" })), ValidationError);
  assert.throws(
    () => svc.create(TENANT_A, validInput({ body_html: "", body_text: "" })),
    ValidationError,
  );
  assert.throws(() => svc.create("", validInput()), ValidationError);
});

test("create acepta solo body_text (fallback) sin body_html", () => {
  const svc = new TemplateService();
  const tpl = svc.create(TENANT_A, validInput({ body_html: "" }));
  assert.equal(tpl.body_html, "");
  assert.equal(tpl.body_text, "Hola {{nombre}}");
});

// --- Criterio: editar plantillas ---
test("update modifica subject y cuerpos manteniendo id/tenant", () => {
  const svc = new TemplateService();
  const tpl = svc.create(TENANT_A, validInput());
  const updated = svc.update(TENANT_A, tpl.id, {
    subject: "Nuevo subject",
    body_text: "Nuevo texto",
  });
  assert.equal(updated.id, tpl.id);
  assert.equal(updated.tenant_id, TENANT_A);
  assert.equal(updated.subject, "Nuevo subject");
  assert.equal(updated.body_text, "Nuevo texto");
  // no tocado
  assert.equal(updated.name, "Bienvenida");
  assert.equal(updated.created_at, tpl.created_at);
});

test("update falla si la plantilla no existe o es de otro tenant", () => {
  const svc = new TemplateService();
  const tpl = svc.create(TENANT_A, validInput());
  assert.throws(() => svc.update(TENANT_A, "inexistente", { subject: "x" }), NotFoundError);
  assert.throws(() => svc.update(TENANT_B, tpl.id, { subject: "x" }), NotFoundError);
});

// --- Criterio: eliminar plantillas ---
test("delete elimina la plantilla del tenant", () => {
  const svc = new TemplateService();
  const tpl = svc.create(TENANT_A, validInput());
  const res = svc.delete(TENANT_A, tpl.id);
  assert.deepEqual(res, { id: tpl.id, deleted: true });
  assert.throws(() => svc.get(TENANT_A, tpl.id), NotFoundError);
  assert.equal(svc.list(TENANT_A).length, 0);
});

test("delete falla si no existe o pertenece a otro tenant", () => {
  const svc = new TemplateService();
  const tpl = svc.create(TENANT_A, validInput());
  assert.throws(() => svc.delete(TENANT_B, tpl.id), NotFoundError);
  assert.throws(() => svc.delete(TENANT_A, "inexistente"), NotFoundError);
});

// --- Criterio: previsualizar plantilla ---
test("preview renderiza la plantilla guardada con variables", () => {
  const svc = new TemplateService();
  const tpl = svc.create(TENANT_A, validInput());
  const preview = svc.preview(TENANT_A, tpl.id, { nombre: "Ana" });
  assert.equal(preview.id, tpl.id);
  assert.equal(preview.subject, "Hola Ana");
  assert.equal(preview.body_html, "<p>Hola Ana</p>");
  assert.equal(preview.body_text, "Hola Ana");
});

test("preview no persiste cambios en la plantilla", () => {
  const svc = new TemplateService();
  const tpl = svc.create(TENANT_A, validInput());
  svc.preview(TENANT_A, tpl.id, { nombre: "Ana" });
  const stored = svc.get(TENANT_A, tpl.id);
  assert.equal(stored.subject, "Hola {{nombre}}");
});

test("previewDraft renderiza sin necesidad de guardar", () => {
  const svc = new TemplateService();
  const out = svc.previewDraft(validInput(), { nombre: "Leo" });
  assert.equal(out.subject, "Hola Leo");
  assert.equal(out.body_html, "<p>Hola Leo</p>");
});
