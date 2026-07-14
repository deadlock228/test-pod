'use strict';

const crypto = require('node:crypto');

// Extrae/genera un request id estable por petición. Si el cliente (o un
// proxy/gateway) ya envió un `x-request-id`, lo reutilizamos para correlación.
function getRequestId(req, headerName = 'x-request-id') {
  const existing = req && req.headers ? req.headers[headerName] : undefined;
  if (typeof existing === 'string' && existing.trim()) {
    return existing.trim();
  }
  if (Array.isArray(existing) && existing.length && String(existing[0]).trim()) {
    return String(existing[0]).trim();
  }
  return crypto.randomUUID();
}

// Resuelve el tenant a partir del header `x-tenant-id` (o el que se configure).
// Devuelve null cuando no se puede determinar (ej: endpoints públicos).
function getTenantId(req, headerName = 'x-tenant-id') {
  const value = req && req.headers ? req.headers[headerName] : undefined;
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value) && value.length && String(value[0]).trim()) {
    return String(value[0]).trim();
  }
  return null;
}

module.exports = { getRequestId, getTenantId };
