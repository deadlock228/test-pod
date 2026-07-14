/**
 * Cálculo de backoff exponencial (con jitter opcional) para reintentos.
 */

/**
 * @typedef {Object} BackoffOptions
 * @property {number} [baseMs=1000]   Retraso base para el primer reintento.
 * @property {number} [factor=2]      Factor de crecimiento exponencial.
 * @property {number} [maxMs=300000]  Tope máximo de retraso (5 min por defecto).
 * @property {number} [jitterRatio=0] Jitter relativo [0..1] aplicado al retraso.
 * @property {() => number} [random]  Fuente de aleatoriedad (inyectable en tests).
 */

/**
 * Retraso, en ms, antes del reintento número `attempt` (1 = primer reintento).
 *
 * attempt=1 -> baseMs
 * attempt=2 -> baseMs * factor
 * attempt=n -> min(baseMs * factor^(n-1), maxMs)
 *
 * @param {number} attempt
 * @param {BackoffOptions} [opts]
 * @returns {number} milisegundos (entero, >= 0)
 */
export function computeBackoff(attempt, opts = {}) {
  const {
    baseMs = 1000,
    factor = 2,
    maxMs = 300000,
    jitterRatio = 0,
    random = Math.random,
  } = opts;

  const n = Math.max(1, Math.floor(attempt));
  const raw = baseMs * Math.pow(factor, n - 1);
  let delay = Math.min(raw, maxMs);

  if (jitterRatio > 0) {
    const spread = delay * jitterRatio;
    // jitter simétrico: delay +/- (spread/2)
    const offset = (random() - 0.5) * spread;
    delay = delay + offset;
  }

  return Math.max(0, Math.round(delay));
}
