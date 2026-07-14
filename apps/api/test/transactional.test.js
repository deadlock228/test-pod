import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { createStore } from '../src/store.js';
import { hashApiKey } from '../src/auth.js';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const RAW_KEY_A = 'sk_live_tenant_a_secret';
const RAW_KEY_B = 'sk_live_tenant_b_secret';
const REVOKED_KEY = 'sk_live_revoked_secret';

/** Prepara un store con API keys y una plantilla de ejemplo. */
function seedStore() {
  const store = createStore();
  store.addApiKey({ tenant_id: TENANT_A, name: 'A', key_hash: hashApiKey(RAW_KEY_A) });
  store.addApiKey({ tenant_id: TENANT_B, name: 'B', key_hash: hashApiKey(RAW_KEY_B) });
  store.addApiKey({
    tenant_id: TENANT_A,
    name: 'revocada',
    key_hash: hashApiKey(REVOKED_KEY),
    revoked_at: new Date().toISOString(),
  });
  store.addTemplate({
    id: 'tpl-welcome',
    tenant_id: TENANT_A,
    name: 'Bienvenida',
    subject: 'Hola {{nombre}}',
    body_html: '<p>Bienvenido {{nombre}} a {{empresa}}</p>',
    body_text: 'Bienvenido {{nombre}}',
  });
  return store;
}

describe('Envío transaccional individual (B09) — HTTP', () => {
  let app;
  let baseUrl;

  before(async () => {
    app = createApp({ store: seedStore() });
    await new Promise((resolve) => app.server.listen(0, resolve));
    const { port } = app.server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
  });

  function post(body, { key = RAW_KEY_A, header = 'x-api-key' } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (key !== null) {
      if (header === 'bearer') headers['authorization'] = `Bearer ${key}`;
      else headers['x-api-key'] = key;
    }
    return fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  // --- Criterio 1: endpoint autenticado con API key encola un email ---
  test('encola un email a un destinatario con API key válida', async () => {
    const before = app.queue.size();
    const res = await post({ to: 'user@example.com', subject: 'Hi', text: 'hola' });
    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.to, 'user@example.com');
    assert.equal(json.status, 'queued');
    assert.equal(app.queue.size(), before + 1, 'debe encolar exactamente un job');
    const job = app.queue.jobs.at(-1);
    assert.equal(job.name, 'send-email');
    assert.equal(job.payload.message_id, json.id);
    assert.equal(job.payload.tenant_id, TENANT_A);
  });

  test('acepta API key vía Authorization: Bearer', async () => {
    const res = await post(
      { to: 'bearer@example.com', subject: 'Hi', text: 'hola' },
      { key: RAW_KEY_A, header: 'bearer' }
    );
    assert.equal(res.status, 202);
  });

  test('rechaza sin API key (401)', async () => {
    const res = await post({ to: 'user@example.com', subject: 'Hi', text: 'x' }, { key: null });
    assert.equal(res.status, 401);
  });

  test('rechaza API key inválida (401)', async () => {
    const res = await post({ to: 'user@example.com', subject: 'Hi', text: 'x' }, { key: 'nope' });
    assert.equal(res.status, 401);
  });

  test('rechaza API key revocada (401)', async () => {
    const res = await post(
      { to: 'user@example.com', subject: 'Hi', text: 'x' },
      { key: REVOKED_KEY }
    );
    assert.equal(res.status, 401);
  });

  test('valida destinatario ausente o con formato inválido (400)', async () => {
    const sinTo = await post({ subject: 'Hi', text: 'x' });
    assert.equal(sinTo.status, 400);
    const malTo = await post({ to: 'no-es-email', subject: 'Hi', text: 'x' });
    assert.equal(malTo.status, 400);
  });

  // --- Criterio 2: idempotencia ---
  test('la misma idempotency_key no genera envíos duplicados', async () => {
    const payload = {
      to: 'dedupe@example.com',
      subject: 'Recibo',
      text: 'gracias',
      idempotency_key: 'order-123',
    };
    const before = app.queue.size();

    const first = await post(payload);
    assert.equal(first.status, 202);
    const firstJson = await first.json();
    assert.equal(firstJson.deduplicated, false);

    const second = await post(payload);
    assert.equal(second.status, 200, 'reintento idempotente responde 200');
    const secondJson = await second.json();
    assert.equal(secondJson.deduplicated, true);
    assert.equal(secondJson.id, firstJson.id, 'devuelve el mismo message');

    assert.equal(app.queue.size(), before + 1, 'sólo se encola una vez');
    const forTenant = app.store
      .listMessages(TENANT_A)
      .filter((m) => m.idempotency_key === 'order-123');
    assert.equal(forTenant.length, 1, 'sólo existe un registro message');
  });

  // --- Criterio 3: se crea un registro message con su estado ---
  test('crea un registro message con estado queued y lo expone por GET', async () => {
    const res = await post({ to: 'record@example.com', subject: 'Hola', text: 'x' });
    const json = await res.json();

    const stored = app.store.getMessage(TENANT_A, json.id);
    assert.ok(stored, 'el message existe en el store');
    assert.equal(stored.status, 'queued');
    assert.equal(stored.tenant_id, TENANT_A);
    assert.equal(stored.to_email, 'record@example.com');
    assert.ok(stored.created_at);

    const detail = await fetch(`${baseUrl}/v1/messages/${json.id}`, {
      headers: { 'x-api-key': RAW_KEY_A },
    });
    assert.equal(detail.status, 200);
    const detailJson = await detail.json();
    assert.equal(detailJson.status, 'queued');
  });

  // --- Criterio 4: soporta plantilla o contenido inline ---
  test('usa una plantilla y renderiza variables en subject/body', async () => {
    const before = app.queue.size();
    const res = await post({
      to: 'tpl@example.com',
      template_id: 'tpl-welcome',
      variables: { nombre: 'Ana', empresa: 'Acme' },
    });
    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.subject, 'Hola Ana');
    assert.equal(json.template_id, 'tpl-welcome');

    const job = app.queue.jobs.at(-1);
    assert.equal(app.queue.size(), before + 1);
    assert.equal(job.payload.html, '<p>Bienvenido Ana a Acme</p>');
    assert.equal(job.payload.text, 'Bienvenido Ana');
  });

  test('usa contenido inline (subject + html/text)', async () => {
    const res = await post({
      to: 'inline@example.com',
      subject: 'Asunto inline',
      html: '<b>Cuerpo</b>',
    });
    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.subject, 'Asunto inline');
    assert.equal(json.template_id, null);
    assert.equal(app.queue.jobs.at(-1).payload.html, '<b>Cuerpo</b>');
  });

  test('rechaza si no hay ni plantilla ni contenido inline (400)', async () => {
    const res = await post({ to: 'x@example.com' });
    assert.equal(res.status, 400);
  });

  test('rechaza si combina plantilla con contenido inline (400)', async () => {
    const res = await post({ to: 'x@example.com', template_id: 'tpl-welcome', subject: 'x' });
    assert.equal(res.status, 400);
  });

  test('rechaza plantilla inexistente o de otro tenant (404 / aislamiento)', async () => {
    const noExiste = await post({ to: 'x@example.com', template_id: 'no-existe' });
    assert.equal(noExiste.status, 404);
    // La plantilla de TENANT_A no es visible con la key de TENANT_B.
    const otroTenant = await post(
      { to: 'x@example.com', template_id: 'tpl-welcome' },
      { key: RAW_KEY_B }
    );
    assert.equal(otroTenant.status, 404);
  });
});

describe('Idempotencia — aislada por tenant', () => {
  let app;

  beforeEach(() => {
    app = createApp({ store: seedStore() });
  });

  test('la misma idempotency_key en tenants distintos genera mensajes independientes', () => {
    const keyA = app.store.findApiKeyByHash(hashApiKey(RAW_KEY_A));
    const keyB = app.store.findApiKeyByHash(hashApiKey(RAW_KEY_B));

    // Reusamos el servicio a través del handle no es trivial sin HTTP; usamos el store
    // + servicio directamente vía createMessage para verificar el índice por tenant.
    const m1 = app.store.createMessage({
      tenant_id: keyA.tenant_id,
      to_email: 'a@x.com',
      subject: 's',
      idempotency_key: 'same',
    });
    const m2 = app.store.createMessage({
      tenant_id: keyB.tenant_id,
      to_email: 'b@x.com',
      subject: 's',
      idempotency_key: 'same',
    });
    assert.notEqual(m1.id, m2.id);
    assert.equal(app.store.findMessageByIdempotencyKey(keyA.tenant_id, 'same').id, m1.id);
    assert.equal(app.store.findMessageByIdempotencyKey(keyB.tenant_id, 'same').id, m2.id);
  });

  test('createMessage lanza conflicto ante idempotency_key duplicada del mismo tenant', () => {
    app.store.createMessage({
      tenant_id: TENANT_A,
      to_email: 'a@x.com',
      subject: 's',
      idempotency_key: 'dup',
    });
    assert.throws(
      () =>
        app.store.createMessage({
          tenant_id: TENANT_A,
          to_email: 'a@x.com',
          subject: 's',
          idempotency_key: 'dup',
        }),
      /duplicada/
    );
  });
});
