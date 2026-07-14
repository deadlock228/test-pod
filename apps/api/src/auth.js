import { createHash } from 'node:crypto';
import { ApiError } from './errors.js';

/** Deriva el hash almacenado a partir de la API key en claro (no se guarda la key). */
export function hashApiKey(rawKey) {
  return createHash('sha256').update(String(rawKey)).digest('hex');
}

/**
 * Autentica una request por API key y devuelve el registro `api_key`
 * (que contiene el `tenant_id` para el aislamiento multi-tenant).
 * Lanza ApiError 401 si falta, es inválida o está revocada.
 */
export function authenticateApiKey(store, rawKey) {
  if (!rawKey) {
    throw new ApiError(401, 'unauthorized', 'API key requerida');
  }
  const record = store.findApiKeyByHash(hashApiKey(rawKey));
  if (!record) {
    throw new ApiError(401, 'unauthorized', 'API key inválida');
  }
  if (record.revoked_at) {
    throw new ApiError(401, 'unauthorized', 'API key revocada');
  }
  return record;
}
