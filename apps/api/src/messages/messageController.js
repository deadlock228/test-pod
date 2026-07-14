/**
 * Controlador HTTP para el historial y detalle de mensajes (B16).
 *
 * Rutas expuestas:
 *   GET /api/messages?status=&campaignId=&page=&pageSize=  -> listado paginado
 *   GET /api/messages/:id                                  -> detalle + eventos
 *
 * El tenant se resuelve desde la request (por defecto vía header
 * `x-tenant-id`; en producción provendría del JWT / API key autenticada).
 */

import { ValidationError } from './messageService.js';

/** Resolución de tenant por defecto: header `x-tenant-id`. */
export function defaultResolveTenant(req) {
  const header = req.headers['x-tenant-id'];
  if (Array.isArray(header)) return header[0] || null;
  return header || null;
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Crea el request handler de mensajes.
 * @param {{ messageService: ReturnType<import('./messageService.js').createMessageService>, resolveTenant?: (req: any) => (string|null) }} deps
 * @returns {(req: any, res: any) => Promise<boolean>} handler que devuelve true si atendió la ruta
 */
export function createMessageController({ messageService, resolveTenant = defaultResolveTenant }) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    // Solo atendemos /api/messages(/...)
    if (parts[0] !== 'api' || parts[1] !== 'messages') return false;

    try {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'método no permitido' });
        return true;
      }

      const tenantId = resolveTenant(req);
      if (!tenantId) {
        sendJson(res, 401, { error: 'tenant no autenticado' });
        return true;
      }

      // GET /api/messages -> listado
      if (parts.length === 2) {
        const params = {
          status: url.searchParams.get('status') || undefined,
          campaignId: url.searchParams.get('campaignId') || undefined,
          page: url.searchParams.get('page') || undefined,
          pageSize: url.searchParams.get('pageSize') || undefined,
        };
        const result = await messageService.listMessages(tenantId, params);
        sendJson(res, 200, result);
        return true;
      }

      // GET /api/messages/:id -> detalle
      if (parts.length === 3) {
        const id = decodeURIComponent(parts[2]);
        const message = await messageService.getMessage(tenantId, id);
        if (!message) {
          sendJson(res, 404, { error: 'mensaje no encontrado' });
          return true;
        }
        sendJson(res, 200, message);
        return true;
      }

      sendJson(res, 404, { error: 'ruta no encontrada' });
      return true;
    } catch (err) {
      if (err instanceof ValidationError) {
        sendJson(res, 400, { error: err.message });
        return true;
      }
      sendJson(res, 500, { error: 'error interno' });
      return true;
    }
  };
}
