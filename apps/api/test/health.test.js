'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkHealth } = require('../src/health');

test('status ok cuando API, DB y cola están up', async () => {
  const report = await checkHealth({
    checkDb: async () => ({ host: 'db' }),
    checkQueue: async () => ({ host: 'redis' }),
    now: () => '2026-07-13T00:00:00.000Z',
  });

  assert.equal(report.status, 'ok');
  assert.equal(report.checks.api.status, 'up');
  assert.equal(report.checks.db.status, 'up');
  assert.equal(report.checks.queue.status, 'up');
  assert.equal(report.checks.db.host, 'db');
  assert.equal(report.checks.queue.host, 'redis');
  assert.equal(report.timestamp, '2026-07-13T00:00:00.000Z');
});

test('status degraded y db down cuando falla el check de DB', async () => {
  const report = await checkHealth({
    checkDb: async () => {
      throw new Error('connection refused');
    },
    checkQueue: async () => ({}),
  });

  assert.equal(report.status, 'degraded');
  assert.equal(report.checks.db.status, 'down');
  assert.equal(report.checks.db.error, 'connection refused');
  assert.equal(report.checks.queue.status, 'up');
});

test('status degraded cuando falla el check de la cola', async () => {
  const report = await checkHealth({
    checkDb: async () => ({}),
    checkQueue: async () => {
      throw new Error('redis down');
    },
  });

  assert.equal(report.status, 'degraded');
  assert.equal(report.checks.queue.status, 'down');
  assert.equal(report.checks.queue.error, 'redis down');
});

test('un check colgado se marca down por timeout', async () => {
  const report = await checkHealth({
    checkDb: () => new Promise(() => {}), // nunca resuelve
    checkQueue: async () => ({}),
    timeoutMs: 20,
  });

  assert.equal(report.checks.db.status, 'down');
  assert.match(report.checks.db.error, /timeout/);
  assert.equal(report.status, 'degraded');
});
