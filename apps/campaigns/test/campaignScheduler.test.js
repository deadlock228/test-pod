import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CampaignScheduler,
  CampaignRepository,
  CampaignStatus,
  InvalidScheduleError,
  InvalidStateError,
  CampaignNotFoundError,
} from '../src/index.js';

// Reloj fijo de referencia para tests deterministas.
const T0 = Date.parse('2026-07-13T10:00:00.000Z');
const HOUR = 3600 * 1000;

function makeSetup({ sender } = {}) {
  const repo = new CampaignRepository();
  repo.save({
    id: 'camp-1',
    tenant_id: 'tenant-a',
    name: 'Newsletter Julio',
    template_id: 'tpl-1',
    list_id: 'list-1',
    status: CampaignStatus.DRAFT,
  });
  const scheduler = new CampaignScheduler({
    repository: repo,
    sender: sender ?? (() => {}),
    clock: () => T0,
  });
  return { repo, scheduler };
}

// ── CA1: Se puede fijar scheduled_at en una campaña ──────────────────────────

test('CA1: schedule fija scheduled_at y pasa la campaña a estado scheduled', () => {
  const { repo, scheduler } = makeSetup();
  const when = new Date(T0 + 2 * HOUR).toISOString();

  const updated = scheduler.schedule('camp-1', when);

  assert.equal(updated.status, CampaignStatus.SCHEDULED);
  assert.equal(updated.scheduled_at, when);

  const persisted = repo.findById('camp-1');
  assert.equal(persisted.status, CampaignStatus.SCHEDULED);
  assert.equal(persisted.scheduled_at, when);
});

test('CA1: schedule acepta Date, epoch ms y string ISO', () => {
  const { scheduler } = makeSetup();
  const asDate = scheduler.schedule('camp-1', new Date(T0 + HOUR));
  assert.equal(asDate.scheduled_at, new Date(T0 + HOUR).toISOString());

  const asEpoch = scheduler.schedule('camp-1', T0 + 2 * HOUR);
  assert.equal(asEpoch.scheduled_at, new Date(T0 + 2 * HOUR).toISOString());
});

test('CA1: rechaza fecha pasada, ausente o inválida', () => {
  const { scheduler } = makeSetup();
  assert.throws(() => scheduler.schedule('camp-1', new Date(T0 - HOUR)), InvalidScheduleError);
  assert.throws(() => scheduler.schedule('camp-1', new Date(T0)), InvalidScheduleError);
  assert.throws(() => scheduler.schedule('camp-1', null), InvalidScheduleError);
  assert.throws(() => scheduler.schedule('camp-1', 'no-es-fecha'), InvalidScheduleError);
});

test('CA1: no se puede programar una campaña ya enviada', () => {
  const { repo, scheduler } = makeSetup();
  repo.save({ id: 'camp-1', tenant_id: 'tenant-a', status: CampaignStatus.SENT });
  assert.throws(() => scheduler.schedule('camp-1', new Date(T0 + HOUR)), InvalidStateError);
});

test('CA1: campaña inexistente lanza CampaignNotFoundError', () => {
  const { scheduler } = makeSetup();
  assert.throws(() => scheduler.schedule('nope', new Date(T0 + HOUR)), CampaignNotFoundError);
});

// ── CA2: La campaña se envía automáticamente al llegar la hora ───────────────

test('CA2: dispatchDue envía la campaña cuando llegó la hora', async () => {
  const sent = [];
  const { repo, scheduler } = makeSetup({ sender: (c) => sent.push(c.id) });
  scheduler.schedule('camp-1', new Date(T0 + HOUR));

  // Antes de la hora: no se envía.
  let results = await scheduler.dispatchDue({ now: T0 + 30 * 60 * 1000 });
  assert.deepEqual(results, []);
  assert.equal(repo.findById('camp-1').status, CampaignStatus.SCHEDULED);
  assert.equal(sent.length, 0);

  // Al llegar la hora: se envía automáticamente.
  results = await scheduler.dispatchDue({ now: T0 + HOUR });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, CampaignStatus.SENT);
  assert.deepEqual(sent, ['camp-1']);

  const persisted = repo.findById('camp-1');
  assert.equal(persisted.status, CampaignStatus.SENT);
  assert.equal(persisted.sent_at, new Date(T0 + HOUR).toISOString());
});

test('CA2: no reenvía una campaña ya enviada (idempotencia por estado)', async () => {
  const sent = [];
  const { scheduler } = makeSetup({ sender: (c) => sent.push(c.id) });
  scheduler.schedule('camp-1', new Date(T0 + HOUR));

  await scheduler.dispatchDue({ now: T0 + HOUR });
  await scheduler.dispatchDue({ now: T0 + 2 * HOUR });

  assert.deepEqual(sent, ['camp-1']);
});

test('CA2: si el envío falla, la campaña queda en estado failed con el error', async () => {
  const { repo, scheduler } = makeSetup({
    sender: () => {
      throw new Error('proveedor caído');
    },
  });
  scheduler.schedule('camp-1', new Date(T0 + HOUR));

  const results = await scheduler.dispatchDue({ now: T0 + HOUR });
  assert.equal(results[0].status, CampaignStatus.FAILED);

  const persisted = repo.findById('camp-1');
  assert.equal(persisted.status, CampaignStatus.FAILED);
  assert.equal(persisted.error, 'proveedor caído');
  assert.equal(persisted.sent_at, null);
});

test('CA2: respeta el aislamiento multi-tenant al despachar', async () => {
  const sent = [];
  const repo = new CampaignRepository();
  repo.save({ id: 'a', tenant_id: 'tenant-a', status: CampaignStatus.DRAFT });
  repo.save({ id: 'b', tenant_id: 'tenant-b', status: CampaignStatus.DRAFT });
  const scheduler = new CampaignScheduler({
    repository: repo,
    sender: (c) => sent.push(c.id),
    clock: () => T0,
  });
  scheduler.schedule('a', new Date(T0 + HOUR));
  scheduler.schedule('b', new Date(T0 + HOUR));

  await scheduler.dispatchDue({ now: T0 + HOUR, tenant_id: 'tenant-a' });

  assert.deepEqual(sent, ['a']);
  assert.equal(repo.findById('b').status, CampaignStatus.SCHEDULED);
});

// ── CA3: Cancelar una campaña programada antes del envío ─────────────────────

test('CA3: cancel vuelve la campaña a draft y limpia scheduled_at', () => {
  const { repo, scheduler } = makeSetup();
  scheduler.schedule('camp-1', new Date(T0 + HOUR));

  const updated = scheduler.cancel('camp-1');
  assert.equal(updated.status, CampaignStatus.DRAFT);
  assert.equal(updated.scheduled_at, null);

  const persisted = repo.findById('camp-1');
  assert.equal(persisted.status, CampaignStatus.DRAFT);
  assert.equal(persisted.scheduled_at, null);
});

test('CA3: una campaña cancelada ya NO se envía al llegar la hora', async () => {
  const sent = [];
  const { scheduler } = makeSetup({ sender: (c) => sent.push(c.id) });
  scheduler.schedule('camp-1', new Date(T0 + HOUR));
  scheduler.cancel('camp-1');

  const results = await scheduler.dispatchDue({ now: T0 + 2 * HOUR });
  assert.deepEqual(results, []);
  assert.equal(sent.length, 0);
});

test('CA3: no se puede cancelar una campaña ya enviada', async () => {
  const { scheduler } = makeSetup();
  scheduler.schedule('camp-1', new Date(T0 + HOUR));
  await scheduler.dispatchDue({ now: T0 + HOUR });

  assert.throws(() => scheduler.cancel('camp-1'), InvalidStateError);
});

test('CA3: no se puede cancelar una campaña en draft (no programada)', () => {
  const { scheduler } = makeSetup();
  assert.throws(() => scheduler.cancel('camp-1'), InvalidStateError);
});
