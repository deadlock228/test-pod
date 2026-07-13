import http from 'node:http';
import { createStore } from './store.js';
import { createQueue } from './queue.js';
import { authenticateApiKey } from './auth.js';
import { sendTransactionalEmail } from './transactional.js';
import { ApiError } from './errors.js';

function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return Array.isArray(headerKey) ? headerKey[0] : headerKey;
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        req.destroy();
        reject(Object.assign(new Error('payload demasiado grande'), { code: 'INVALID_JSON' }));
      }
    });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { code: 'INVALID_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

function serializeMessage(message, extra = {}) {
  return {
    id: message.id,
    status: message.status,
    to: message.to_email,
    subject: message.subject,
    template_id: message.template_id,
    idempotency_key: message.idempotency_key,
    created_at: message.created_at,
    ...extra,
  };
}

/**
 * Construye la app HTTP. Permite inyectar `store`/`queue` para tests.
 */
export function createApp(deps = {}) {
  const store = deps.store || createStore();
  const queue = deps.queue || createQueue();

  async function handle(req, res) {
    try {
      // Envío transaccional individual (B09).
      if (req.method === 'POST' && req.url === '/v1/messages') {
        const apiKey = authenticateApiKey(store, extractApiKey(req));
        const body = await readJson(req);
        const { message, deduplicated } = sendTransactionalEmail(
          { store, queue },
          { apiKey, body }
        );
        sendJson(res, deduplicated ? 200 : 202, serializeMessage(message, { deduplicated }));
        return;
      }

      // Consulta de estado de un message (soporta "registro con su estado").
      const detail = req.method === 'GET' && /^\/v1\/messages\/[^/]+$/.test(req.url || '');
      if (detail) {
        const apiKey = authenticateApiKey(store, extractApiKey(req));
        const id = req.url.split('/').pop();
        const message = store.getMessage(apiKey.tenant_id, id);
        if (!message) {
          sendJson(res, 404, { error: 'not_found', message: 'message no encontrado' });
          return;
        }
        sendJson(res, 200, serializeMessage(message));
        return;
      }

      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { status: 'ok' });
        return;
      }

      sendJson(res, 404, { error: 'not_found', message: 'ruta no encontrada' });
    } catch (err) {
      if (err instanceof ApiError) {
        sendJson(res, err.status, { error: err.code, message: err.message });
        return;
      }
      if (err && err.code === 'INVALID_JSON') {
        sendJson(res, 400, { error: 'invalid_request', message: 'JSON inválido' });
        return;
      }
      sendJson(res, 500, { error: 'internal_error', message: 'error interno' });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  return { server, store, queue, handle };
}
