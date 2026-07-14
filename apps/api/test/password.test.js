import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/password.js';

test('hashPassword no guarda la contraseña en claro', () => {
  const hash = hashPassword('super-secreta');
  assert.ok(!hash.includes('super-secreta'));
  assert.match(hash, /^scrypt\$/);
});

test('verifyPassword acepta la contraseña correcta y rechaza la incorrecta', () => {
  const hash = hashPassword('super-secreta');
  assert.equal(verifyPassword('super-secreta', hash), true);
  assert.equal(verifyPassword('otra-cosa', hash), false);
});

test('hashPassword rechaza contraseñas cortas', () => {
  assert.throws(() => hashPassword('corta'), /al menos 8/);
});

test('dos hashes de la misma contraseña difieren (salt aleatorio)', () => {
  assert.notEqual(hashPassword('super-secreta'), hashPassword('super-secreta'));
});
