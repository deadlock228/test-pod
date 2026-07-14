'use strict';

// Logger estructurado (JSON por línea) con soporte de contexto por request:
// siempre incluye `tenantId` y `requestId` para trazabilidad multi-tenant.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger(options = {}) {
  const {
    level = 'info',
    stream = process.stdout,
    base = {},
    now = () => new Date().toISOString(),
  } = options;

  const threshold = LEVELS[level] != null ? LEVELS[level] : LEVELS.info;

  function write(lvl, msg, fields = {}) {
    if ((LEVELS[lvl] != null ? LEVELS[lvl] : LEVELS.info) < threshold) {
      return null;
    }
    const entry = {
      timestamp: now(),
      level: lvl,
      msg,
      ...base,
      ...fields,
    };
    // Garantizamos que las claves de trazabilidad estén siempre presentes.
    if (!('tenantId' in entry)) entry.tenantId = null;
    if (!('requestId' in entry)) entry.requestId = null;
    stream.write(JSON.stringify(entry) + '\n');
    return entry;
  }

  const logger = {
    level,
    log: write,
    child(childFields = {}) {
      return createLogger({
        level,
        stream,
        now,
        base: { ...base, ...childFields },
      });
    },
  };

  for (const lvl of Object.keys(LEVELS)) {
    logger[lvl] = (msg, fields) => write(lvl, msg, fields);
  }

  return logger;
}

module.exports = { createLogger, LEVELS };
