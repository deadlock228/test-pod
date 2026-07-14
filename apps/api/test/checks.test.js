'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const {
  parseHostPort,
  tcpPing,
  createDbCheck,
  createQueueCheck,
} = require('../src/checks');

test('parseHostPort extrae host y puerto de una URL', () => {
  assert.deepEqual(parseHostPort('postgres://u:p@db.local:5433/x', 5432), {
    host: 'db.local',
    port: 5433,
  });
  assert.deepEqual(parseHostPort('redis://cache', 6379), {
    host: 'cache',
    port: 6379,
  });
});

test('createDbCheck falla si no hay DATABASE_URL', async () => {
  const check = createDbCheck(undefined);
  await assert.rejects(() => check(), /DATABASE_URL not configured/);
});

test('createQueueCheck falla si no hay REDIS_URL', async () => {
  const check = createQueueCheck(undefined);
  await assert.rejects(() => check(), /REDIS_URL not configured/);
});

test('tcpPing resuelve contra un puerto escuchando', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const ok = await tcpPing('127.0.0.1', port, 1000);
    assert.equal(ok, true);
  } finally {
    server.close();
  }
});

test('tcpPing rechaza contra un puerto cerrado', async () => {
  // Puerto donde (casi con seguridad) no hay nada escuchando.
  await assert.rejects(() => tcpPing('127.0.0.1', 1, 300));
});
