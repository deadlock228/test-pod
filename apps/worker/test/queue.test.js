import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryQueue } from '../src/queue.js';

test('enqueue/dequeue en orden FIFO', () => {
  const q = new InMemoryQueue();
  q.enqueue({ n: 1 });
  q.enqueue({ n: 2 });
  assert.equal(q.size(), 2);
  assert.equal(q.dequeue().payload.n, 1);
  assert.equal(q.dequeue().payload.n, 2);
  assert.equal(q.dequeue(), null);
});

test('jobs demorados no se entregan hasta cumplir el delay', () => {
  let now = 0;
  const q = new InMemoryQueue({ now: () => now });
  q.enqueue({ n: 1 }, { delayMs: 1000 });
  assert.equal(q.size(), 1);
  assert.equal(q.ready(), 0);
  assert.equal(q.dequeue(), null, 'no debe entregarse antes del delay');

  now = 999;
  assert.equal(q.dequeue(), null);

  now = 1000;
  assert.equal(q.ready(), 1);
  assert.equal(q.dequeue().payload.n, 1);
});

test('entre jobs disponibles se prioriza el más antiguo', () => {
  let now = 0;
  const q = new InMemoryQueue({ now: () => now });
  q.enqueue({ n: 'demorado' }, { delayMs: 500 });
  q.enqueue({ n: 'inmediato' });
  // sólo el inmediato está disponible
  assert.equal(q.dequeue().payload.n, 'inmediato');
  now = 500;
  assert.equal(q.dequeue().payload.n, 'demorado');
});
