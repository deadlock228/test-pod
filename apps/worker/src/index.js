/**
 * Punto de entrada / wiring del módulo cola-worker.
 *
 * Exporta las piezas para construir el pipeline de envío asíncrono:
 *   - InMemoryQueue: cola de jobs (sustituible por Redis/BullMQ).
 *   - InMemoryMessageStore + MessageStatus: estado del message.
 *   - TokenBucketRateLimiter / NoopRateLimiter: rate limit por tenant.
 *   - SendWorker: consumidor con reintentos + backoff.
 *   - Errores para clasificar fallos transitorios vs permanentes.
 */

export { InMemoryQueue } from './queue.js';
export { InMemoryMessageStore, MessageStatus } from './messageStore.js';
export { TokenBucketRateLimiter, NoopRateLimiter } from './rateLimiter.js';
export { SendWorker } from './worker.js';
export { computeBackoff } from './backoff.js';
export {
  SendError,
  TransientSendError,
  PermanentSendError,
  isTransient,
} from './errors.js';

import { InMemoryQueue } from './queue.js';
import { InMemoryMessageStore } from './messageStore.js';
import { TokenBucketRateLimiter } from './rateLimiter.js';
import { SendWorker } from './worker.js';

/**
 * Helper de conveniencia: arma un pipeline listo para usar.
 * @param {{
 *   provider: { send: Function },
 *   ratePerSecond?: number,
 *   burst?: number,
 *   maxAttempts?: number,
 *   backoff?: object,
 *   now?: () => number,
 *   logger?: (e: any) => void,
 * }} opts
 */
export function createSendPipeline({
  provider,
  ratePerSecond = 10,
  burst = ratePerSecond,
  maxAttempts = 5,
  backoff = {},
  now = () => Date.now(),
  logger = () => {},
}) {
  const queue = new InMemoryQueue({ now });
  const store = new InMemoryMessageStore();
  const rateLimiter = new TokenBucketRateLimiter({
    capacity: burst,
    refillPerSec: ratePerSecond,
    now,
  });
  const worker = new SendWorker({
    queue,
    store,
    provider,
    rateLimiter,
    maxAttempts,
    backoff,
    now,
    logger,
  });
  return { queue, store, rateLimiter, worker };
}
