// API HTTP (node:http, sin framework externo).
// Expone auth (registro/login/refresh) y endpoints protegidos por rol que
// demuestran el aislamiento por tenant_id.
import http from 'node:http';
import { Store } from './store.js';
import { AuthService, AuthError } from './auth-service.js';
import { can } from './rbac.js';

function send(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('payload demasiado grande'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new AuthError('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const header = req.headers['authorization'] || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

/**
 * Crea la app HTTP. Devuelve `{ server, store, auth }` para poder testear.
 */
export function createApp({ secret = process.env.JWT_SECRET } = {}) {
  const store = new Store();
  const auth = new AuthService(store, secret || 'dev-secret-change-me');

  // Middleware de autenticación: devuelve el contexto o responde 401.
  function authenticate(req, res) {
    const token = bearer(req);
    if (!token) {
      send(res, 401, { error: 'falta token Bearer' });
      return null;
    }
    try {
      return auth.authenticate(token);
    } catch (err) {
      send(res, err.status || 401, { error: err.message });
      return null;
    }
  }

  // Middleware de autorización por permiso RBAC.
  function authorize(ctx, res, permission) {
    if (!can(ctx.role, permission)) {
      send(res, 403, { error: `rol "${ctx.role}" sin permiso para ${permission}` });
      return false;
    }
    return true;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      const method = req.method;

      if (method === 'GET' && path === '/health') {
        return send(res, 200, { status: 'ok' });
      }

      // --- Auth pública ---------------------------------------------------
      if (method === 'POST' && path === '/auth/register') {
        const body = await readJsonBody(req);
        const result = auth.registerTenant(body);
        return send(res, 201, result);
      }

      if (method === 'POST' && path === '/auth/login') {
        const body = await readJsonBody(req);
        return send(res, 200, auth.login(body));
      }

      if (method === 'POST' && path === '/auth/refresh') {
        const body = await readJsonBody(req);
        return send(res, 200, auth.refresh(body.refreshToken));
      }

      // --- A partir de aquí, todo requiere access token -------------------
      const ctx = authenticate(req, res);
      if (!ctx) return;

      if (method === 'GET' && path === '/me') {
        return send(res, 200, { userId: ctx.userId, tenantId: ctx.tenantId, role: ctx.role });
      }

      // Gestión de usuarios: solo admin.
      if (method === 'POST' && path === '/users') {
        if (!authorize(ctx, res, 'users:manage')) return;
        const body = await readJsonBody(req);
        return send(res, 201, auth.createUser(ctx.tenantId, body));
      }

      // Recurso de negocio de ejemplo (contactos) para demostrar RBAC +
      // aislamiento por tenant_id. Escritura: admin/operador. Lectura: todos.
      if (path === '/contacts') {
        if (method === 'POST') {
          if (!authorize(ctx, res, 'resource:write')) return;
          const body = await readJsonBody(req);
          const contact = store.insert('contact', ctx.tenantId, {
            email: body.email,
            name: body.name || null,
            attributes: body.attributes || {},
            subscribed: true,
          });
          return send(res, 201, contact);
        }
        if (method === 'GET') {
          if (!authorize(ctx, res, 'resource:read')) return;
          // find() filtra SIEMPRE por ctx.tenantId → aislamiento garantizado.
          return send(res, 200, store.find('contact', ctx.tenantId));
        }
      }

      return send(res, 404, { error: 'no encontrado' });
    } catch (err) {
      if (err instanceof AuthError) {
        return send(res, err.status || 400, { error: err.message });
      }
      return send(res, 500, { error: 'error interno' });
    }
  });

  return { server, store, auth };
}
