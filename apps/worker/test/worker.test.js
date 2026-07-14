import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryQueue } from '../src/queue.js';
import { InMemoryMessageStore, MessageStatus } from '../src/messageStore.js';
import { TokenBucketRateLimiter } from '../src/rateLimiter.js';
import { SendWorker } from '../src/worker.js';
import { TransientSendError, PermanentSendError } from '../src/errors.js';

/** Reloj virtual controlable. */
function makeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

/** Proveedor programable: cada llamada consume el próximo comportamiento. */
function makeProvider(behaviors) {
  const calls = [];
  let i = 0;
  return {
    calls,
    async send(message) {
      calls.push(message.id);
      const b = typeof behaviors === 'function' ? behaviors(i) : behaviors[i];
      i += 1;
      if (b instanceof Error) throw b;
      return b || { providerMessageId: `prov-${message.id}-${i}` };
    },
  };
}

// ---------------------------------------------------------------------------
// CA1: "Los envíos se encolan y procesa un worker."
// ---------------------------------------------------------------------------
test('CA1: un envío se encola (queued) y el worker lo procesa', async () => {
  const clock = makeClock();
  const queue = new InMemoryQueue({ now: clock.now });
  const store = new InMemoryMessageStore();
  const provider = makeProvider([{ providerMessageId: 'abc123' }]);
  const worker = new SendWorker({ queue, store, provider, now: clock.now });

  const msg = worker.enqueueMessage({ id: 'm1', tenantId: 't1', toEmail: 'a@b.com' });
  assert.equal(msg.status, MessageStatus.QUEUED, 'nace queued');
  assert.equal(queue.size(), 1, 'quedó encolado');

  const res = await worker.processNext();
  assert.equal(res.status, 'sent');
  assert.equal(provider.calls.length, 1, 'el worker llamó al proveedor');
  assert.equal(store.get('m1').status, MessageStatus.SENT);
  assert.equal(store.get('m1').providerMessageId, 'abc123');
  assert.equal(queue.size(), 0, 'la cola queda vacía tras procesar');
});

test('CA1: processNext devuelve idle si la cola está vacía', async () => {
  const queue = new InMemoryQueue();
  const store = new InMemoryMessageStore();
  const worker = new SendWorker({ queue, store, provider: makeProvider([]) });
  assert.deepEqual(await worker.processNext(), { status: 'idle' });
});

// ---------------------------------------------------------------------------
// CA2: "Fallos transitorios se reintentan con backoff."
// ---------------------------------------------------------------------------
test('CA2: fallo transitorio reencola con backoff y luego se envía', async () => {
  const clock = makeClock();
  const queue = new InMemoryQueue({ now: clock.now });
  const store = new InMemoryMessageStore();
  // 1er intento falla transitorio, 2do OK
  const provider = makeProvider([
    new TransientSendError('timeout'),
    { providerMessageId: 'ok-2' },
  ]);
  const worker = new SendWorker({
    queue,
    store,
    provider,
    now: clock.now,
    maxAttempts: 5,
    backoff: { baseMs: 1000, factor: 2 },
  });

  worker.enqueueMessage({ id: 'm1', tenantId: 't1' });

  // 1er procesamiento -> retry con delay = 1000ms
  const r1 = await worker.processNext();
  assert.equal(r1.status, 'retry');
  assert.equal(r1.attempt, 1);
  assert.equal(r1.delayMs, 1000);
  assert.equal(store.get('m1').status, MessageStatus.QUEUED, 'vuelve a queued');
  assert.equal(store.get('m1').error, 'timeout');

  // El job demorado NO está disponible todavía.
  assert.equal(await (async () => (await worker.processNext()).status)(), 'idle');

  // Avanza el reloj hasta cumplir el backoff.
  clock.advance(1000);
  const r2 = await worker.processNext();
  assert.equal(r2.status, 'sent');
  assert.equal(r2.attempt, 2);
  assert.equal(store.get('m1').status, MessageStatus.SENT);
  assert.equal(provider.calls.length, 2);
});

test('CA2: el delay entre reintentos crece exponencialmente', async () => {
  const clock = makeClock();
  const queue = new InMemoryQueue({ now: clock.now });
  const store = new InMemoryMessageStore();
  const provider = makeProvider(() => new TransientSendError('down')); // siempre falla
  const worker = new SendWorker({
    queue,
    store,
    provider,
    now: clock.now,
    maxAttempts: 4,
    backoff: { baseMs: 1000, factor: 2 },
  });

  worker.enqueueMessage({ id: 'm1', tenantId: 't1' });

  const delays = [];
  for (let i = 0; i < 3; i++) {
    const r = await worker.processNext();
    assert.equal(r.status, 'retry');
    delays.push(r.delayMs);
    clock.advance(r.delayMs); // saltamos al momento del siguiente intento
  }
  assert.deepEqual(delays, [1000, 2000, 4000], 'backoff exponencial');
});

test('CA2: agotados los maxAttempts el message queda failed', async () => {
  const clock = makeClock();
  const queue = new InMemoryQueue({ now: clock.now });
  const store = new InMemoryMessageStore();
  const provider = makeProvider(() => new TransientSendError('always'));
  const worker = new SendWorker({
    queue,
    store,
    provider,
    now: clock.now,
    maxAttempts: 3,
    backoff: { baseMs: 100, factor: 2 },
  });

  worker.enqueueMessage({ id: 'm1', tenantId: 't1' });

  let res;
  for (let i = 0; i < 3; i++) {
    res = await worker.processNext();
    if (res.status === 'retry') clock.advance(res.delayMs);
  }
  assert.equal(res.status, 'failed');
  assert.equal(res.attempt, 3);
  assert.equal(store.get('m1').status, MessageStatus.FAILED);
  assert.equal(store.get('m1').attempts, 3);
  assert.equal(queue.size(), 0, 'no reencola tras agotar intentos');
});

test('CA2: un fallo permanente no se reintenta', async () => {
  const clock = makeClock();
  const queue = new InMemoryQueue({ now: clock.now });
  const store = new InMemoryMessageStore();
  const provider = makeProvider([new PermanentSendError('invalid recipient')]);
  const worker = new SendWorker({ queue, store, provider, now: clock.now, maxAttempts: 5 });

  worker.enqueueMessage({ id: 'm1', tenantId: 't1' });
  const r = await worker.processNext();
  assert.equal(r.status, 'failed');
  assert.equal(store.get('m1').status, MessageStatus.FAILED);
  assert.equal(store.get('m1').error, 'invalid recipient');
  assert.equal(queue.size(), 0, 'no reencola un fallo permanente');
  assert.equal(provider.calls.length, 1, 'sólo un intento');
});

// ---------------------------------------------------------------------------
// CA3: "Se respeta un rate limit por tenant."
// ---------------------------------------------------------------------------
test('CA3: al exceder el rate limit del tenant, el envío se pospone', async () => {
  const clock = makeClock();
  const queue = new InMemoryQueue({ now: clock.now });
  const store = new InMemoryMessageStore();
  const provider = makeProvider(() => ({ providerMessageId: 'x' }));
  const rateLimiter = new TokenBucketRateLimiter({
    capacity: 1,
    refillPerSec: 1,
    now: clock.now,
  });
  const worker = new SendWorker({ queue, store, provider, rateLimiter, now: clock.now });

  worker.enqueueMessage({ id: 'm1', tenantId: 't1' });
  worker.enqueueMessage({ id: 'm2', tenantId: 't1' });

  // 1er envío consume el único token -> sent
  const r1 = await worker.processNext();
  assert.equal(r1.status, 'sent');
  assert.equal(store.get('m1').status, MessageStatus.SENT);

  // 2do envío: sin tokens -> rate_limited, se reencola con delay y NO se envía
  const r2 = await worker.processNext();
  assert.equal(r2.status, 'rate_limited');
  assert.equal(r2.delayMs, 1000);
  assert.equal(store.get('m2').status, MessageStatus.QUEUED, 'sigue queued, no se envió');
  assert.equal(provider.calls.length, 1, 'el proveedor no fue llamado para m2');

  // El job pospuesto no está disponible aún.
  assert.equal((await worker.processNext()).status, 'idle');

  // Tras el refill, se procesa.
  clock.advance(1000);
  const r3 = await worker.processNext();
  assert.equal(r3.status, 'sent');
  assert.equal(store.get('m2').status, MessageStatus.SENT);
  assert.equal(provider.calls.length, 2);
});

test('CA3: el rate limit de un tenant no afecta a otro', async () => {
  const clock = makeClock();
  const queue = new InMemoryQueue({ now: clock.now });
  const store = new InMemoryMessageStore();
  const provider = makeProvider(() => ({ providerMessageId: 'x' }));
  const rateLimiter = new TokenBucketRateLimiter({
    capacity: 1,
    refillPerSec: 1,
    now: clock.now,
  });
  const worker = new SendWorker({ queue, store, provider, rateLimiter, now: clock.now });

  worker.enqueueMessage({ id: 'a1', tenantId: 'A' });
  worker.enqueueMessage({ id: 'a2', tenantId: 'A' }); // excede A
  worker.enqueueMessage({ id: 'b1', tenantId: 'B' }); // tenant B tiene su cupo

  assert.equal((await worker.processNext()).status, 'sent'); // a1
  assert.equal((await worker.processNext()).status, 'rate_limited'); // a2 pospuesto
  const rb = await worker.processNext(); // b1 se envía igual
  assert.equal(rb.status, 'sent');
  assert.equal(store.get('b1').status, MessageStatus.SENT);
});

// ---------------------------------------------------------------------------
// CA4: "El estado del message se actualiza (queued/sent/failed)."
// ---------------------------------------------------------------------------
test('CA4: transiciones de estado queued -> sent', async () => {
  const clock = makeClock();
  const queue = new InMemoryQueue({ now: clock.now });
  const store = new InMemoryMessageStore();
  const provider = makeProvider([{ providerMessageId: 'p' }]);
  const worker = new SendWorker({ queue, store, provider, now: clock.now });

  worker.enqueueMessage({ id: 'm1', tenantId: 't1' });
  assert.equal(store.get('m1').status, MessageStatus.QUEUED);
  await worker.processNext();
  assert.equal(store.get('m1').status, MessageStatus.SENT);
});

test('CA4: transiciones de estado queued -> queued (retry) -> failed', async () => {
  const clock = makeClock();
  const queue = new InMemoryQueue({ now: clock.now });
  const store = new InMemoryMessageStore();
  const provider = makeProvider(() => new TransientSendError('nope'));
  const worker = new SendWorker({
    queue,
    store,
    provider,
    now: clock.now,
    maxAttempts: 2,
    backoff: { baseMs: 10 },
  });

  worker.enqueueMessage({ id: 'm1', tenantId: 't1' });
  const seen = [store.get('m1').status];

  let r = await worker.processNext(); // retry -> queued
  seen.push(store.get('m1').status);
  clock.advance(r.delayMs);

  r = await worker.processNext(); // failed
  seen.push(store.get('m1').status);

  assert.deepEqual(seen, [
    MessageStatus.QUEUED,
    MessageStatus.QUEUED,
    MessageStatus.FAILED,
  ]);
});
