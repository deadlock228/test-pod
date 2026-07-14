import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const SECRET = 'http-secret';

// Levanta la app en un puerto efímero y devuelve helpers.
async function startApp() {
  const { server } = createApp({ secret: SECRET });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, path, { token, body } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const close = () => new Promise((resolve) => server.close(resolve));
  return { call, close };
}

// Registra un tenant admin y devuelve tokens/ids.
async function registerTenant(call, name, email) {
  const res = await call('POST', '/auth/register', {
    body: { tenantName: name, email, password: 'password123' },
  });
  assert.equal(res.status, 201);
  return res.body;
}

test('POST /auth/register crea tenant + admin y devuelve tokens', async () => {
  const { call, close } = await startApp();
  try {
    const res = await call('POST', '/auth/register', {
      body: { tenantName: 'Acme', email: 'boss@acme.com', password: 'password123' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'admin');
    assert.ok(res.body.tokens.accessToken);
    assert.ok(res.body.tokens.refreshToken);
  } finally {
    await close();
  }
});

test('POST /auth/login devuelve JWT + refresh y /auth/refresh renueva el access', async () => {
  const { call, close } = await startApp();
  try {
    const reg = await registerTenant(call, 'Acme', 'boss@acme.com');
    const login = await call('POST', '/auth/login', {
      body: { tenantId: reg.tenant.id, email: 'boss@acme.com', password: 'password123' },
    });
    assert.equal(login.status, 200);
    assert.ok(login.body.tokens.accessToken);
    assert.ok(login.body.tokens.refreshToken);

    // /me con el access token.
    const me = await call('GET', '/me', { token: login.body.tokens.accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.tenantId, reg.tenant.id);
    assert.equal(me.body.role, 'admin');

    // refresh.
    const refreshed = await call('POST', '/auth/refresh', {
      body: { refreshToken: login.body.tokens.refreshToken },
    });
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.body.accessToken);

    const me2 = await call('GET', '/me', { token: refreshed.body.accessToken });
    assert.equal(me2.status, 200);
  } finally {
    await close();
  }
});

test('login con credenciales inválidas → 401', async () => {
  const { call, close } = await startApp();
  try {
    const reg = await registerTenant(call, 'Acme', 'boss@acme.com');
    const res = await call('POST', '/auth/login', {
      body: { tenantId: reg.tenant.id, email: 'boss@acme.com', password: 'incorrecta' },
    });
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test('endpoints protegidos rechazan requests sin token (401)', async () => {
  const { call, close } = await startApp();
  try {
    assert.equal((await call('GET', '/me')).status, 401);
    assert.equal((await call('GET', '/contacts')).status, 401);
    assert.equal((await call('POST', '/contacts', { body: {} })).status, 401);
  } finally {
    await close();
  }
});

test('aislamiento por tenant_id: cada tenant solo ve sus contactos', async () => {
  const { call, close } = await startApp();
  try {
    const a = await registerTenant(call, 'Acme', 'a@acme.com');
    const b = await registerTenant(call, 'Beta', 'b@beta.com');

    await call('POST', '/contacts', {
      token: a.tokens.accessToken,
      body: { email: 'c1@acme.com' },
    });
    await call('POST', '/contacts', {
      token: b.tokens.accessToken,
      body: { email: 'c1@beta.com' },
    });

    const aList = await call('GET', '/contacts', { token: a.tokens.accessToken });
    const bList = await call('GET', '/contacts', { token: b.tokens.accessToken });
    assert.equal(aList.body.length, 1);
    assert.equal(bList.body.length, 1);
    assert.equal(aList.body[0].email, 'c1@acme.com');
    assert.equal(bList.body[0].email, 'c1@beta.com');
    assert.equal(aList.body[0].tenant_id, a.tenant.id);
    // El contacto del tenant A jamás aparece en el listado del tenant B.
    assert.ok(bList.body.every((c) => c.tenant_id === b.tenant.id));
  } finally {
    await close();
  }
});

test('RBAC: viewer no puede escribir; operador y admin sí; solo admin gestiona usuarios', async () => {
  const { call, close } = await startApp();
  try {
    const admin = await registerTenant(call, 'Acme', 'admin@acme.com');
    const adminToken = admin.tokens.accessToken;

    // Admin crea un operador y un viewer.
    const opRes = await call('POST', '/users', {
      token: adminToken,
      body: { email: 'op@acme.com', password: 'password123', role: 'operador' },
    });
    assert.equal(opRes.status, 201);
    const viewerRes = await call('POST', '/users', {
      token: adminToken,
      body: { email: 'view@acme.com', password: 'password123', role: 'viewer' },
    });
    assert.equal(viewerRes.status, 201);

    // Login de operador y viewer.
    const opLogin = await call('POST', '/auth/login', {
      body: { tenantId: admin.tenant.id, email: 'op@acme.com', password: 'password123' },
    });
    const viewerLogin = await call('POST', '/auth/login', {
      body: { tenantId: admin.tenant.id, email: 'view@acme.com', password: 'password123' },
    });
    const opToken = opLogin.body.tokens.accessToken;
    const viewerToken = viewerLogin.body.tokens.accessToken;

    // Escritura de contactos: admin OK, operador OK, viewer 403.
    assert.equal((await call('POST', '/contacts', { token: adminToken, body: { email: 'x@acme.com' } })).status, 201);
    assert.equal((await call('POST', '/contacts', { token: opToken, body: { email: 'y@acme.com' } })).status, 201);
    assert.equal((await call('POST', '/contacts', { token: viewerToken, body: { email: 'z@acme.com' } })).status, 403);

    // Lectura: los tres roles pueden.
    assert.equal((await call('GET', '/contacts', { token: viewerToken })).status, 200);

    // Gestión de usuarios: solo admin. Operador y viewer 403.
    assert.equal((await call('POST', '/users', { token: opToken, body: { email: 'n@acme.com', password: 'password123', role: 'viewer' } })).status, 403);
    assert.equal((await call('POST', '/users', { token: viewerToken, body: { email: 'm@acme.com', password: 'password123', role: 'viewer' } })).status, 403);
  } finally {
    await close();
  }
});
