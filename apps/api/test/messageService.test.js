import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryMessageRepository } from '../src/messages/messageRepository.js';
import {
  createMessageService,
  normalizePagination,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../src/messages/messageService.js';
import { buildFixtures, TENANT_A, TENANT_B, CAMPAIGN_1, CAMPAIGN_2 } from './fixtures.js';

function makeService() {
  const repo = new InMemoryMessageRepository(buildFixtures());
  return createMessageService(repo);
}

test('lista los mensajes del tenant y aísla los de otros tenants', async () => {
  const service = makeService();
  const { data, pagination } = await service.listMessages(TENANT_A);

  assert.equal(pagination.total, 5, 'TENANT_A tiene 5 mensajes');
  assert.ok(data.every((m) => m.tenant_id === TENANT_A));
  assert.ok(!data.some((m) => m.id === 'x1'), 'no debe aparecer el mensaje de TENANT_B');

  const otro = await service.listMessages(TENANT_B);
  assert.equal(otro.pagination.total, 1);
  assert.equal(otro.data[0].id, 'x1');
});

test('ordena por created_at descendente (más recientes primero)', async () => {
  const service = makeService();
  const { data } = await service.listMessages(TENANT_A, { pageSize: 100 });
  assert.deepEqual(
    data.map((m) => m.id),
    ['m5', 'm4', 'm3', 'm2', 'm1'],
  );
});

test('filtra por estado', async () => {
  const service = makeService();
  const { data, pagination } = await service.listMessages(TENANT_A, { status: 'delivered' });
  assert.equal(pagination.total, 2);
  assert.ok(data.every((m) => m.status === 'delivered'));
  assert.deepEqual(data.map((m) => m.id).sort(), ['m1', 'm3']);
});

test('filtra por campaña', async () => {
  const service = makeService();
  const { data, pagination } = await service.listMessages(TENANT_A, { campaignId: CAMPAIGN_1 });
  assert.equal(pagination.total, 2);
  assert.ok(data.every((m) => m.campaign_id === CAMPAIGN_1));
});

test('combina filtros de estado y campaña', async () => {
  const service = makeService();
  const { data, pagination } = await service.listMessages(TENANT_A, {
    status: 'delivered',
    campaignId: CAMPAIGN_2,
  });
  assert.equal(pagination.total, 1);
  assert.equal(data[0].id, 'm3');
});

test('rechaza un estado inválido con ValidationError', async () => {
  const service = makeService();
  await assert.rejects(
    () => service.listMessages(TENANT_A, { status: 'inexistente' }),
    (err) => err instanceof ValidationError && err.statusCode === 400,
  );
});

test('exige tenantId', async () => {
  const service = makeService();
  await assert.rejects(() => service.listMessages(''), ValidationError);
});

test('pagina resultados y calcula metadatos', async () => {
  const service = makeService();

  const page1 = await service.listMessages(TENANT_A, { page: 1, pageSize: 2 });
  assert.equal(page1.data.length, 2);
  assert.deepEqual(page1.data.map((m) => m.id), ['m5', 'm4']);
  assert.deepEqual(page1.pagination, { page: 1, pageSize: 2, total: 5, totalPages: 3 });

  const page2 = await service.listMessages(TENANT_A, { page: 2, pageSize: 2 });
  assert.deepEqual(page2.data.map((m) => m.id), ['m3', 'm2']);
  assert.equal(page2.pagination.page, 2);

  const page3 = await service.listMessages(TENANT_A, { page: 3, pageSize: 2 });
  assert.deepEqual(page3.data.map((m) => m.id), ['m1']);

  const page4 = await service.listMessages(TENANT_A, { page: 4, pageSize: 2 });
  assert.equal(page4.data.length, 0, 'página fuera de rango devuelve vacío');
});

test('normalizePagination aplica defaults y límites', () => {
  assert.deepEqual(normalizePagination({}), { page: 1, pageSize: DEFAULT_PAGE_SIZE });
  assert.deepEqual(normalizePagination({ page: 0, pageSize: -5 }), {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  assert.deepEqual(normalizePagination({ page: 'abc', pageSize: 'xyz' }), {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  assert.equal(normalizePagination({ pageSize: 9999 }).pageSize, MAX_PAGE_SIZE);
  assert.deepEqual(normalizePagination({ page: '2', pageSize: '5' }), { page: 2, pageSize: 5 });
});

test('devuelve el detalle de un mensaje con sus eventos ordenados', async () => {
  const service = makeService();
  const message = await service.getMessage(TENANT_A, 'm1');

  assert.ok(message);
  assert.equal(message.id, 'm1');
  assert.equal(message.status, 'delivered');
  assert.equal(message.events.length, 3);
  assert.deepEqual(
    message.events.map((e) => e.type),
    ['delivered', 'opened', 'clicked'],
  );
});

test('detalle: un mensaje sin eventos devuelve events vacío', async () => {
  const service = makeService();
  const message = await service.getMessage(TENANT_A, 'm5');
  assert.ok(message);
  assert.deepEqual(message.events, []);
});

test('detalle: no expone mensajes de otro tenant', async () => {
  const service = makeService();
  const message = await service.getMessage(TENANT_A, 'x1');
  assert.equal(message, null);
});

test('detalle: mensaje inexistente devuelve null', async () => {
  const service = makeService();
  const message = await service.getMessage(TENANT_A, 'no-existe');
  assert.equal(message, null);
});
