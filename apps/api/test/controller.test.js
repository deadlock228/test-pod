import { test } from "node:test";
import assert from "node:assert/strict";
import { TemplateController } from "../src/templates/controller.js";

const TENANT = "tenant-x";

function body(overrides = {}) {
  return {
    name: "Promo",
    subject: "Oferta {{nombre}}",
    body_html: "<h1>Hola {{nombre}}</h1>",
    body_text: "Hola {{nombre}}",
    ...overrides,
  };
}

test("flujo REST completo: create/list/get/update/delete", () => {
  const ctrl = new TemplateController();

  // create -> 201
  const created = ctrl.create({ tenantId: TENANT, body: body() });
  assert.equal(created.status, 201);
  const id = created.body.id;

  // list -> 200 con 1 elemento
  const listed = ctrl.list({ tenantId: TENANT });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);

  // get -> 200
  const got = ctrl.get({ tenantId: TENANT, params: { id } });
  assert.equal(got.status, 200);
  assert.equal(got.body.id, id);

  // update -> 200
  const updated = ctrl.update({
    tenantId: TENANT,
    params: { id },
    body: { subject: "Nueva oferta {{nombre}}" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.subject, "Nueva oferta {{nombre}}");

  // delete -> 200
  const deleted = ctrl.delete({ tenantId: TENANT, params: { id } });
  assert.equal(deleted.status, 200);
  assert.equal(ctrl.list({ tenantId: TENANT }).body.length, 0);
});

test("create con payload invalido responde 400", () => {
  const ctrl = new TemplateController();
  const res = ctrl.create({ tenantId: TENANT, body: body({ subject: "" }) });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "VALIDATION_ERROR");
});

test("get de plantilla inexistente responde 404", () => {
  const ctrl = new TemplateController();
  const res = ctrl.get({ tenantId: TENANT, params: { id: "nope" } });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "NOT_FOUND");
});

test("preview via controller renderiza variables", () => {
  const ctrl = new TemplateController();
  const { body: created } = ctrl.create({ tenantId: TENANT, body: body() });
  const res = ctrl.preview({
    tenantId: TENANT,
    params: { id: created.id },
    body: { variables: { nombre: "Sol" } },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.subject, "Oferta Sol");
  assert.equal(res.body.body_html, "<h1>Hola Sol</h1>");
});

test("previewDraft via controller no requiere guardar", () => {
  const ctrl = new TemplateController();
  const res = ctrl.previewDraft({
    tenantId: TENANT,
    body: { template: body(), variables: { nombre: "Sol" } },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.body_text, "Hola Sol");
});
