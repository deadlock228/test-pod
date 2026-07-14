# @email-notif/worker — Cola y worker de envío (B10)

Procesamiento **asíncrono** de envíos de email con **reintentos + backoff** y
**rate limiting por tenant**. Corresponde al slice `cola-worker` del build plan.

## Piezas

| Módulo | Responsabilidad |
|--------|-----------------|
| `src/queue.js` | Cola de jobs en memoria con soporte de jobs demorados (delay). Sustituible por Redis/BullMQ. |
| `src/rateLimiter.js` | Token bucket **por tenant** (`TokenBucketRateLimiter`) + `NoopRateLimiter`. |
| `src/messageStore.js` | Estado del `message` (`queued`/`sent`/`failed`) — respaldable en PostgreSQL. |
| `src/backoff.js` | Backoff exponencial con tope y jitter opcional. |
| `src/errors.js` | Clasifica fallos **transitorios** (reintentar) vs **permanentes** (fallar). |
| `src/worker.js` | `SendWorker`: consume la cola, aplica rate limit, envía, reintenta y actualiza estado. |
| `src/index.js` | Exports + `createSendPipeline()` para armar el pipeline completo. |

## Flujo

```
enqueueMessage(msg)  -> message.status = queued  + job en cola
                          │
                 processNext() (worker)
                          │
        ┌── sin cupo de tenant ──> reencola con delay (rate_limited), sigue queued
        │
     provider.send(message)
        ├── ok            -> message.status = sent  (+ providerMessageId)
        ├── transitorio   -> reencola con backoff, message vuelve a queued
        │                    (hasta maxAttempts, luego failed)
        └── permanente    -> message.status = failed (sin reintento)
```

## Uso

```js
import { createSendPipeline, TransientSendError } from '@email-notif/worker';

const provider = {
  async send(message) {
    // llamar al adaptador SMTP/SES/SendGrid...
    return { providerMessageId: 'abc' };
    // throw new TransientSendError('timeout')  // se reintenta
  },
};

const { worker } = createSendPipeline({ provider, ratePerSecond: 10, burst: 10, maxAttempts: 5 });
worker.enqueueMessage({ id: 'msg-1', tenantId: 'tenant-1', toEmail: 'a@b.com' });
await worker.run(); // loop; en tests se usa processNext()
```

Todas las dependencias temporales (`now`, `sleep`) se inyectan para tests
deterministas.

## Tests

Sin dependencias externas (usa el runner integrado de Node):

```bash
node --test          # dentro de apps/worker
```
