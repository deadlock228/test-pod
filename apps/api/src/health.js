'use strict';

// Ejecuta un check individual con timeout, normalizando el resultado a
// { name, status, latencyMs, ... } sin lanzar excepciones hacia afuera.
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout after ${ms}ms`)),
      ms,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function runCheck(name, fn, timeoutMs = 2000) {
  const start = Date.now();
  try {
    const result = await withTimeout(Promise.resolve().then(fn), timeoutMs);
    const extra =
      result && typeof result === 'object' && !Array.isArray(result)
        ? result
        : {};
    return { name, status: 'up', ...extra, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      name,
      status: 'down',
      error: err && err.message ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

// Reporta el estado global de la API, la base de datos y la cola de envío.
// Los checks de DB y cola se inyectan para poder testear y desacoplar drivers.
async function checkHealth(deps = {}) {
  const {
    checkDb = async () => ({}),
    checkQueue = async () => ({}),
    timeoutMs = 2000,
    version = process.env.APP_VERSION || '0.1.0',
    now = () => new Date().toISOString(),
    uptime = () => Math.round(process.uptime()),
  } = deps;

  const [db, queue] = await Promise.all([
    runCheck('db', checkDb, timeoutMs),
    runCheck('queue', checkQueue, timeoutMs),
  ]);

  const api = { name: 'api', status: 'up' };
  const checks = { api, db, queue };
  const allUp = Object.values(checks).every((c) => c.status === 'up');

  return {
    status: allUp ? 'ok' : 'degraded',
    version,
    uptimeSeconds: uptime(),
    timestamp: now(),
    checks,
  };
}

module.exports = { checkHealth, runCheck, withTimeout };
