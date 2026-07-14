/**
 * Rate limiter por tenant basado en token bucket.
 *
 * Cada tenant tiene su propio bucket de capacidad `capacity` que se rellena a
 * `refillPerSec` tokens por segundo. Consumir un token (tryRemove) autoriza un
 * envío. Si no hay tokens, `msUntilAvailable` indica cuánto esperar.
 *
 * El reloj (`now`) es inyectable para tests deterministas.
 */

export class TokenBucketRateLimiter {
  /**
   * @param {{ capacity: number, refillPerSec: number, now?: () => number }} opts
   */
  constructor({ capacity, refillPerSec, now = () => Date.now() }) {
    if (!(capacity > 0)) throw new Error('capacity must be > 0');
    if (!(refillPerSec > 0)) throw new Error('refillPerSec must be > 0');
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.now = now;
    /** @type {Map<string, { tokens: number, last: number }>} */
    this._buckets = new Map();
  }

  /** @param {string} tenantId */
  _bucket(tenantId) {
    let b = this._buckets.get(tenantId);
    if (!b) {
      b = { tokens: this.capacity, last: this.now() };
      this._buckets.set(tenantId, b);
    }
    return b;
  }

  /** @param {{ tokens: number, last: number }} b */
  _refill(b) {
    const t = this.now();
    const elapsedSec = (t - b.last) / 1000;
    if (elapsedSec > 0) {
      b.tokens = Math.min(this.capacity, b.tokens + elapsedSec * this.refillPerSec);
      b.last = t;
    }
  }

  /**
   * Intenta consumir un token para el tenant. Devuelve true si se autoriza.
   * @param {string} tenantId
   * @returns {boolean}
   */
  tryRemove(tenantId) {
    const b = this._bucket(tenantId);
    this._refill(b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Milisegundos hasta que haya al menos 1 token disponible para el tenant.
   * 0 si ya hay disponibilidad.
   * @param {string} tenantId
   * @returns {number}
   */
  msUntilAvailable(tenantId) {
    const b = this._bucket(tenantId);
    this._refill(b);
    if (b.tokens >= 1) return 0;
    const needed = 1 - b.tokens;
    return Math.ceil((needed / this.refillPerSec) * 1000);
  }

  /**
   * Tokens disponibles (aprox.) para el tenant, tras refill.
   * @param {string} tenantId
   */
  available(tenantId) {
    const b = this._bucket(tenantId);
    this._refill(b);
    return b.tokens;
  }
}

/** Rate limiter nulo: nunca limita. Útil para desactivar el límite. */
export class NoopRateLimiter {
  tryRemove() {
    return true;
  }
  msUntilAvailable() {
    return 0;
  }
}
