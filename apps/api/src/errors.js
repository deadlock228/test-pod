/**
 * Error de API con código HTTP y código de negocio.
 * Se serializa como `{ error, message }` en las respuestas.
 */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Error interno del store para violación de unicidad de idempotency_key. */
export class IdempotencyConflictError extends Error {
  constructor(message = 'idempotency_key duplicada para el tenant') {
    super(message);
    this.name = 'IdempotencyConflictError';
    this.code = 'IDEMPOTENCY_CONFLICT';
  }
}
