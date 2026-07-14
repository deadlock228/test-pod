import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucketRateLimiter } from '../src/rateLimiter.js';

test('permite hasta la capacidad y luego bloquea', () => {
  let now = 0;
  const rl = new TokenBucketRateLimiter({ capacity: 3, refillPerSec: 1, now: () => now });
  assert.equal(rl.tryRemove('t1'), true);
  assert.equal(rl.tryRemove('t1'), true);
  assert.equal(rl.tryRemove('t1'), true);
  assert.equal(rl.tryRemove('t1'), false, 'agotado el burst debe bloquear');
});

test('el límite es independiente por tenant', () => {
  let now = 0;
  const rl = new TokenBucketRateLimiter({ capacity: 1, refillPerSec: 1, now: () => now });
  assert.equal(rl.tryRemove('tenant-A'), true);
  assert.equal(rl.tryRemove('tenant-A'), false);
  // otro tenant tiene su propio bucket lleno
  assert.equal(rl.tryRemove('tenant-B'), true);
});

test('el bucket se rellena con el tiempo', () => {
  let now = 0;
  const rl = new TokenBucketRateLimiter({ capacity: 2, refillPerSec: 2, now: () => now });
  assert.equal(rl.tryRemove('t1'), true);
  assert.equal(rl.tryRemove('t1'), true);
  assert.equal(rl.tryRemove('t1'), false);
  // a 2 tokens/seg, 500ms => 1 token
  now = 500;
  assert.equal(rl.tryRemove('t1'), true);
  assert.equal(rl.tryRemove('t1'), false);
});

test('msUntilAvailable estima la espera', () => {
  let now = 0;
  const rl = new TokenBucketRateLimiter({ capacity: 1, refillPerSec: 1, now: () => now });
  assert.equal(rl.msUntilAvailable('t1'), 0);
  assert.equal(rl.tryRemove('t1'), true);
  // sin tokens: 1 token/seg => 1000ms
  assert.equal(rl.msUntilAvailable('t1'), 1000);
});
