import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken, issueTokenPair, ACCESS_TTL } from '../src/jwt.js';

const SECRET = 'test-secret';

test('signToken/verifyToken hace round-trip de los claims', () => {
  const token = signToken({ sub: 'u1', role: 'admin', type: 'access' }, SECRET, 60);
  const claims = verifyToken(token, SECRET);
  assert.equal(claims.sub, 'u1');
  assert.equal(claims.role, 'admin');
  assert.equal(claims.type, 'access');
  assert.ok(claims.exp > claims.iat);
});

test('verifyToken rechaza firma inválida (otro secret)', () => {
  const token = signToken({ sub: 'u1' }, SECRET, 60);
  assert.throws(() => verifyToken(token, 'otro-secret'), /firma inválida/);
});

test('verifyToken rechaza tokens manipulados', () => {
  const token = signToken({ sub: 'u1', role: 'viewer' }, SECRET, 60);
  const [h, , s] = token.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ sub: 'u1', role: 'admin' }))
    .toString('base64')
    .replace(/=/g, '');
  assert.throws(() => verifyToken(`${h}.${forgedBody}.${s}`, SECRET), /firma inválida/);
});

test('verifyToken rechaza tokens expirados', () => {
  const token = signToken({ sub: 'u1' }, SECRET, -1);
  assert.throws(() => verifyToken(token, SECRET), /expirado/);
});

test('issueTokenPair emite access + refresh distintos y verificables', () => {
  const user = { id: 'u1', tenant_id: 't1', role: 'admin' };
  const pair = issueTokenPair(user, SECRET);
  assert.equal(pair.tokenType, 'Bearer');
  assert.equal(pair.expiresIn, ACCESS_TTL);
  assert.notEqual(pair.accessToken, pair.refreshToken);
  assert.equal(verifyToken(pair.accessToken, SECRET).type, 'access');
  assert.equal(verifyToken(pair.refreshToken, SECRET).type, 'refresh');
  assert.equal(verifyToken(pair.accessToken, SECRET).tenantId, 't1');
});
