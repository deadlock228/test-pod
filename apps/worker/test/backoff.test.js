import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBackoff } from '../src/backoff.js';

test('backoff crece exponencialmente desde baseMs', () => {
  const opts = { baseMs: 1000, factor: 2 };
  assert.equal(computeBackoff(1, opts), 1000);
  assert.equal(computeBackoff(2, opts), 2000);
  assert.equal(computeBackoff(3, opts), 4000);
  assert.equal(computeBackoff(4, opts), 8000);
});

test('backoff respeta el tope maxMs', () => {
  const opts = { baseMs: 1000, factor: 2, maxMs: 5000 };
  assert.equal(computeBackoff(3, opts), 4000);
  assert.equal(computeBackoff(4, opts), 5000);
  assert.equal(computeBackoff(10, opts), 5000);
});

test('backoff aplica jitter dentro del rango esperado', () => {
  // random fijo en 1 -> offset = +spread/2
  const hi = computeBackoff(1, { baseMs: 1000, factor: 2, jitterRatio: 0.5, random: () => 1 });
  // random fijo en 0 -> offset = -spread/2
  const lo = computeBackoff(1, { baseMs: 1000, factor: 2, jitterRatio: 0.5, random: () => 0 });
  assert.equal(hi, 1250); // 1000 + (1-0.5)*500
  assert.equal(lo, 750); //  1000 + (0-0.5)*500
});

test('backoff nunca es negativo', () => {
  const v = computeBackoff(1, { baseMs: 10, jitterRatio: 5, random: () => 0 });
  assert.ok(v >= 0);
});
