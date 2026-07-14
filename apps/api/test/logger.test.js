'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger } = require('../src/logger');
const { captureStream } = require('./helpers');

test('emite JSON estructurado con timestamp, level y msg', () => {
  const stream = captureStream();
  const log = createLogger({ stream, now: () => '2026-07-13T00:00:00.000Z' });
  log.info('hello', { foo: 'bar' });

  const [entry] = stream.entries();
  assert.equal(entry.level, 'info');
  assert.equal(entry.msg, 'hello');
  assert.equal(entry.foo, 'bar');
  assert.equal(entry.timestamp, '2026-07-13T00:00:00.000Z');
});

test('siempre incluye claves de trazabilidad tenantId y requestId', () => {
  const stream = captureStream();
  const log = createLogger({ stream });
  log.info('sin contexto');

  const [entry] = stream.entries();
  assert.ok('tenantId' in entry);
  assert.ok('requestId' in entry);
  assert.equal(entry.tenantId, null);
  assert.equal(entry.requestId, null);
});

test('child() propaga tenantId y requestId a cada log', () => {
  const stream = captureStream();
  const log = createLogger({ stream }).child({
    tenantId: 'tenant-42',
    requestId: 'req-abc',
  });
  log.warn('algo');

  const [entry] = stream.entries();
  assert.equal(entry.tenantId, 'tenant-42');
  assert.equal(entry.requestId, 'req-abc');
  assert.equal(entry.level, 'warn');
});

test('respeta el nivel configurado (filtra debug bajo info)', () => {
  const stream = captureStream();
  const log = createLogger({ stream, level: 'info' });
  log.debug('oculto');
  log.error('visible');

  const entries = stream.entries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].msg, 'visible');
});
