import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../src/server.js';
import { InMemoryMessageRepository } from '../src/messages/messageRepository.js';
import { buildFixtures, TENANT_A, CAMPAIGN_1 } from './fixtures.js';

let server;
let baseUrl;

before(async () => {
  const repository = new InMemoryMessageRepository(buildFixtures());
  server = createServer({ repository });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function get(path, { tenant = TENANT_A } = {}) {
  const headers = {};
  if (tenant) headers['x-tenant-id'] = tenant;
  return fetch(`${baseUrl}${path}`, { headers });
}

test('GET /api/messages devuelve listado paginado del tenant', async () => {
  const res = await get('/api/messages?page=1&pageSize=2');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.length, 2);
  assert.deepEqual(body.pagination, { page: 1, pageSize: 2, total: 5, totalPages: 3 });
  assert.ok(body.data.every((m) => m.tenant_id === TENANT_A));
});

test('GET /api/messages filtra por estado y campaña', async () => {
  const res = await get(`/api/messages?status=delivered&campaignId=${CAMPAIGN_1}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pagination.total, 1);
  assert.equal(body.data[0].id, 'm1');
});

test('GET /api/messages con estado inválido responde 400', async () => {
  const res = await get('/api/messages?status=zzz');
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /status inválido/);
});

test('GET /api/messages sin tenant responde 401', async () => {
  const res = await get('/api/messages', { tenant: null });
  assert.equal(res.status, 401);
});

test('GET /api/messages/:id devuelve detalle con eventos', async () => {
  const res = await get('/api/messages/m1');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, 'm1');
  assert.equal(body.events.length, 3);
  assert.deepEqual(body.events.map((e) => e.type), ['delivered', 'opened', 'clicked']);
});

test('GET /api/messages/:id inexistente responde 404', async () => {
  const res = await get('/api/messages/no-existe');
  assert.equal(res.status, 404);
});

test('GET /api/messages/:id de otro tenant responde 404 (aislamiento)', async () => {
  const res = await get('/api/messages/x1'); // x1 es de TENANT_B
  assert.equal(res.status, 404);
});

test('método no permitido responde 405', async () => {
  const res = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers: { 'x-tenant-id': TENANT_A },
  });
  assert.equal(res.status, 405);
});
