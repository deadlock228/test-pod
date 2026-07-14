
'use strict';

const http = require('node:http');
const { createLogger } = require('./logger');
const { getRequestId, getTenantId } = require('./requestContext');
const { checkHealth } = require('./health');
const { createQueueMetrics } = require('./queueMetrics');

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(payload);
}

// Crea el servidor HTTP de observabilidad. Todo se inyecta para testear:
// logger, métricas de cola y los checks de DB/cola.
function createServer(options = {}) {
  const {
    logger = createLogger({ level: process.env.LOG_LEVEL || 'info' }),
    metrics = createQueueMetrics(),
    checkDb,
    checkQueue,
    healthTimeoutMs,
  } = options;

  const handler = async (req, res) => {
    const requestId = getRequestId(req);
    const tenantId = getTenantId(req);
    // Cada log de la request lleva requestId + tenantId (trazabilidad).
    const reqLog = logger.child({ requestId, tenantId });
    const start = Date.now();
    res.setHeader('x-request-id', requestId);

    reqLog.info('request.received', { method: req.method, path: req.url });

    try {
      if (req.method === 'GET' && req.url === '/health') {
        const report = await checkHealth({
          checkDb,
          checkQueue,
          timeoutMs: healthTimeoutMs,
        });
        sendJson(res, report.status === 'ok' ? 200 : 503, report);
      } else if (
        req.method === 'GET' &&
        (req.url === '/metrics' || req.url === '/metrics/queue')
      ) {
        res.statusCode = 200;
        res.setHeader('content-type', 'text/plain; version=0.0.4');
        res.end(metrics.toPrometheus());
      } else if (req.method === 'GET' && req.url === '/metrics.json') {
        sendJson(res, 200, metrics.snapshot());
      } else {
        sendJson(res, 404, { error: 'not_found' });
      }
    } catch (err) {
      reqLog.error('request.error', {
        error: err && err.message ? err.message : String(err),
      });
      sendJson(res, 500, { error: 'internal_error' });
    } finally {
      reqLog.info('request.completed', {
        method: req.method,
        path: req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      });
    }
  };

  const server = http.createServer((req, res) => {
    handler(req, res).catch((err) => {
      logger.error('handler.unhandled', {
        error: err && err.message ? err.message : String(err),
      });
      if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' });
    });
  });

  return { server, handler, logger, metrics };
}

module.exports = { createServer, sendJson };
