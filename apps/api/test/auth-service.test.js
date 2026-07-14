import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { AuthService } from '../src/auth-service.js';
import { verifyToken } from '../src/jwt.js';

const SECRET = 'unit-secret';

function service() {
  return new AuthService(new Store(), SECRET);
}

test('registerTenant crea el tenant y su primer usuario admin', () => {
  const auth = service();
  const { tenant, user, tokens } = auth.registerTenant({
    tenantName: 'Acme',
    email: 'boss@acme.com',
    password: 'password123',
  });
  assert.ok(tenant.id);
  assert.equal(tenant.name, 'Acme');
  assert.equal(user.role, 'admin');
  assert.equal(user.email, 'boss@acme.com');
  assert.equal(user.tenant_id, tenant.id);
  assert.equal(user.password_hash, undefined, 'no expone el hash');
  assert.ok(tokens.accessToken && tokens.refreshToken);
});

test('registerTenant valida entrada', () => {
  const auth = service();
  assert.throws(() => auth.registerTenant({ email: 'x@x.com', password: 'password123' }), /tenantName/);
  assert.throws(() => auth.registerTenant({ tenantName: 'A', email: 'malo', password: 'password123' }), /email/);
  assert.throws(() => auth.registerTenant({ tenantName: 'A', email: 'x@x.com', password: '123' }), /8/);
});

test('login devuelve JWT válido + refresh token', () => {
  const auth = service();
  const { tenant } = auth.registerTenant({
    tenantName: 'Acme',
    email: 'boss@acme.com',
    password: 'password123',
  });
  const { tokens } = auth.login({
    tenantId: tenant.id,
    email: 'boss@acme.com',
    password: 'password123',
  });
  const access = verifyToken(tokens.accessToken, SECRET);
  const refresh = verifyToken(tokens.refreshToken, SECRET);
  assert.equal(access.type, 'access');
  assert.equal(access.tenantId, tenant.id);
  assert.equal(access.role, 'admin');
  assert.equal(refresh.type, 'refresh');
});

test('login rechaza credenciales inválidas con 401', () => {
  const auth = service();
  const { tenant } = auth.registerTenant({
    tenantName: 'Acme',
    email: 'boss@acme.com',
    password: 'password123',
  });
  assert.throws(
    () => auth.login({ tenantId: tenant.id, email: 'boss@acme.com', password: 'mala' }),
    (e) => e.status === 401,
  );
});

test('refresh intercambia un refresh token por un nuevo access token', () => {
  const auth = service();
  const { tenant, tokens } = auth.registerTenant({
    tenantName: 'Acme',
    email: 'boss@acme.com',
    password: 'password123',
  });
  const { accessToken } = auth.refresh(tokens.refreshToken);
  const claims = verifyToken(accessToken, SECRET);
  assert.equal(claims.type, 'access');
  assert.equal(claims.tenantId, tenant.id);
});

test('refresh rechaza un access token usado como refresh', () => {
  const auth = service();
  const { tokens } = auth.registerTenant({
    tenantName: 'Acme',
    email: 'boss@acme.com',
    password: 'password123',
  });
  assert.throws(() => auth.refresh(tokens.accessToken), /refresh token/);
});

test('el email de usuario es único por tenant pero puede repetirse entre tenants', () => {
  const auth = service();
  const t1 = auth.registerTenant({ tenantName: 'T1', email: 'dup@x.com', password: 'password123' });
  // Mismo email en el mismo tenant → conflicto.
  assert.throws(
    () => auth.createUser(t1.tenant.id, { email: 'dup@x.com', password: 'password123', role: 'operador' }),
    (e) => e.status === 409,
  );
  // Mismo email en OTRO tenant → permitido (aislamiento).
  const t2 = auth.registerTenant({ tenantName: 'T2', email: 'dup@x.com', password: 'password123' });
  assert.ok(t2.user.id);
});

test('createUser valida el rol', () => {
  const auth = service();
  const { tenant } = auth.registerTenant({ tenantName: 'T', email: 'a@a.com', password: 'password123' });
  assert.throws(
    () => auth.createUser(tenant.id, { email: 'b@a.com', password: 'password123', role: 'root' }),
    /rol inválido/,
  );
  const op = auth.createUser(tenant.id, { email: 'op@a.com', password: 'password123', role: 'operador' });
  assert.equal(op.role, 'operador');
});
