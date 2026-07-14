'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createQueueMetrics } = require('../src/queueMetrics');

test('snapshot inicial expone las métricas básicas de la cola', () => {
  const m = createQueueMetrics();
  const snap = m.snapshot();
  for (const key of ['enqueued', 'active', 'waiting', 'sent', 'failed', 'retried', 'delayed']) {
    assert.equal(snap[key], 0, `métrica ${key}`);
  }
});

test('incr y set actualizan los contadores', () => {
  const m = createQueueMetrics();
  assert.equal(m.incr('enqueued'), 1);
  assert.equal(m.incr('enqueued', 4), 5);
  assert.equal(m.set('waiting', 3), 3);
  assert.equal(m.get('enqueued'), 5);
  assert.equal(m.snapshot().waiting, 3);
});

test('toPrometheus emite formato de texto con prefijo send_queue', () => {
  const m = createQueueMetrics();
  m.incr('sent', 7);
  m.incr('failed', 2);
  const text = m.toPrometheus();

  assert.match(text, /# TYPE send_queue_sent gauge/);
  assert.match(text, /send_queue_sent 7/);
  assert.match(text, /send_queue_failed 2/);
  assert.ok(text.endsWith('\n'));
});

test('reset vuelve todo a cero', () => {
  const m = createQueueMetrics({ sent: 10 });
  m.reset();
  assert.equal(m.get('sent'), 0);
});
