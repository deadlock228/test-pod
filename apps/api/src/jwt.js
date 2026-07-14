// JWT HS256 minimalista basado en `crypto` (sin dependencias externas).
// Emite access tokens de vida corta y refresh tokens de vida larga.
import crypto from 'node:crypto';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlJson(obj) {
  return base64url(JSON.stringify(obj));
}

function decodeSegment(segment) {
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function sign(data, secret) {
  return base64url(crypto.createHmac('sha256', secret).update(data).digest());
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Duraciones por defecto (en segundos).
export const ACCESS_TTL = 15 * 60; // 15 minutos
export const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 días

/**
 * Firma un JWT HS256.
 * @param {object} payload  claims (sub, tenantId, role, type, ...)
 * @param {string} secret
 * @param {number} ttlSeconds  tiempo de vida en segundos
 */
export function signToken(payload, secret, ttlSeconds) {
  if (!secret) throw new Error('JWT secret requerido');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { iat: now, exp: now + ttlSeconds, ...payload };
  const encodedHeader = base64urlJson(header);
  const encodedBody = base64urlJson(body);
  const signature = sign(`${encodedHeader}.${encodedBody}`, secret);
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

/**
 * Verifica firma y expiración. Lanza Error si el token es inválido.
 * @returns {object} claims decodificados
 */
export function verifyToken(token, secret) {
  if (typeof token !== 'string') throw new Error('token inválido');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('token malformado');
  const [encodedHeader, encodedBody, signature] = parts;
  const expected = sign(`${encodedHeader}.${encodedBody}`, secret);
  if (!timingSafeEqual(signature, expected)) throw new Error('firma inválida');
  let payload;
  try {
    payload = JSON.parse(decodeSegment(encodedBody));
  } catch {
    throw new Error('payload inválido');
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now >= payload.exp) {
    throw new Error('token expirado');
  }
  return payload;
}

/** Emite el par de tokens (access + refresh) para un usuario autenticado. */
export function issueTokenPair(user, secret) {
  const base = { sub: user.id, tenantId: user.tenant_id, role: user.role };
  return {
    accessToken: signToken({ ...base, type: 'access' }, secret, ACCESS_TTL),
    refreshToken: signToken({ ...base, type: 'refresh' }, secret, REFRESH_TTL),
    tokenType: 'Bearer',
    expiresIn: ACCESS_TTL,
  };
}
