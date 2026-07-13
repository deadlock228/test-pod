'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server');
const { createLogger } = require('../src/logger');
const { createQueueMetrics } = require('../src/queueMetrics');
const { captureStream } = require('./helpers');

async function withServer(opts, fn) {
  const built = createServer(opts);
  await new Promise((resolve) => built.server.listen(0, '127.0.0.1', resolve));
  const { port } = built.server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    return await fn(base, built);
  } finally {
    await new Promise((resolve) => built.server.close(resolve));
  }
}

test('GET /health responde 200 con estado de api, db y cola', async () => {
  await withServer(
    {
      logger: createLogger({ stream: captureStream() }),
      checkDb: async () => ({}),
      checkQueue: async () => ({}),
    },
    async (base) => {
      const res = await fetch(`${base}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'ok');
      assert.equal(body.checks.api.status, 'up');
      assert.equal(body.checks.db.status, 'up');
      assert.equal(body.checks.queue.status, 'up');
    },
  );
});

test('GET /health responde 503 cuando la cola está caída', async () => {
  await withServer(
    {
      logger: createLogger({ stream: captureStream() }),
      checkDb: async () => ({}),
      checkQueue: async () => {
        throw new Error('redis unreachable');
      },
    },
    async (base) => {
      const res = await fetch(`${base}/health`);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.status, 'degraded');
      assert.equal(body.checks.queue.status, 'down');
    },
  );
});

test('los logs de la request incluyen tenantId y requestId', async () => {
  const stream = captureStream();
  await withServer(
    {
      logger: createLogger({ stream }),
      checkDb: async () => ({}),
      checkQueue: async () => ({}),
    },
    async (base) => {
      const res = await fetch(`${base}/health`, {
        headers: { 'x-tenant-id': 'tenant-9', 'x-request-id': 'req-xyz' },
      });
      assert.equal(res.headers.get('x-request-id'), 'req-xyz');

      const entries = stream
        .entries()
        .filter((e) => e.msg && e.msg.startsWith('request.'));
      assert.ok(entries.length >= 2);
      for (const e of entries) {
        assert.equal(e.tenantId, 'tenant-9');
        assert.equal(e.requestId, 'req-xyz');
      }
      const completed = entries.find((e) => e.msg === 'request.completed');
      assert.equal(completed.statusCode, 200);
      assert.equal(typeof completed.durationMs, 'number');
    },
  );
});

test('GET /metrics expone métricas de la cola en formato Prometheus', async () => {
  const metrics = createQueueMetrics();
  metrics.incr('sent', 5);
  metrics.incr('failed', 1);
  await withServer(
    { logger: createLogger({ stream: captureStream() }), metrics },
    async (base) => {
      const res = await fetch(`${base}/metrics`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /text\/plain/);
      const text = await res.text();
      assert.match(text, /send_queue_sent 5/);
      assert.match(text, /send_queue_failed 1/);
    },
  );
});

test('GET /metrics.json expone el snapshot de la cola', async () => {
  const metrics = createQueueMetrics();
  metrics.set('waiting', 3);
  await withServer(
    { logger: createLogger({ stream: captureStream() }), metrics },
    async (base) => {
      const res = await fetch(`${base}/metrics.json`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.waiting, 3);
    },
  );
});

test('rutas desconocidas responden 404 con x-request-id', async () => {
  await withServer(
    { logger: createLogger({ stream: captureStream() }) },
    async (base) => {
      const res = await fetch(`${base}/nope`);
      assert.equal(res.status, 404);
      assert.ok(res.headers.get('x-request-id'));
    },
  );
});
