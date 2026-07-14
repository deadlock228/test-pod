/**
 * Errores del proceso de envío.
 *
 * Distingue fallos transitorios (se deben reintentar con backoff) de fallos
 * permanentes (no tiene sentido reintentar, el message queda `failed`).
 */

export class SendError extends Error {
  /**
   * @param {string} message
   * @param {{ transient?: boolean, cause?: unknown }} [opts]
   */
  constructor(message, { transient = false, cause } = {}) {
    super(message);
    this.name = 'SendError';
    this.transient = transient;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Fallo transitorio: red caída, timeout, 5xx del proveedor, throttling. */
export class TransientSendError extends SendError {
  constructor(message, opts = {}) {
    super(message, { ...opts, transient: true });
    this.name = 'TransientSendError';
  }
}

/** Fallo permanente: destinatario inválido, credenciales mal, 4xx no recuperable. */
export class PermanentSendError extends SendError {
  constructor(message, opts = {}) {
    super(message, { ...opts, transient: false });
    this.name = 'PermanentSendError';
  }
}

/**
 * Determina si un error debe considerarse transitorio.
 * Por defecto, un error desconocido se trata como transitorio (fail-safe:
 * preferimos reintentar antes que descartar un envío por un error no clasificado).
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTransient(err) {
  if (err && typeof err === 'object' && 'transient' in err) {
    return Boolean(/** @type {any} */ (err).transient);
  }
  return true;
}
