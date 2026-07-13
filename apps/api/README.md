# @email-notif/api — Observabilidad y health checks (B17)

Módulo mínimo, sin dependencias externas (usa `node:http` y `node --test`),
que aporta la capa de observabilidad de la plataforma.

## Endpoints

- `GET /health` — reporta el estado de **API**, **DB** y **cola** de envío.
  Responde `200` con `{ status: "ok" }` si todo está `up`, o `503` con
  `{ status: "degraded" }` si algún componente está `down`. Cada check incluye
  `latencyMs` y, ante fallo, `error`.
- `GET /metrics` (`/metrics/queue`) — métricas de la cola de envío en formato
  texto Prometheus (`send_queue_*`).
- `GET /metrics.json` — snapshot JSON de las métricas de la cola.

## Logs estructurados

Todos los logs son JSON por línea e incluyen **siempre** `tenantId` y
`requestId` (tomados de `x-tenant-id` y `x-request-id`, o generados). El
`x-request-id` se devuelve en la respuesta para correlación.

## Métricas de cola disponibles

`enqueued`, `active`, `waiting`, `sent`, `failed`, `retried`, `delayed`.

## Uso

```js
const { createServer } = require('./src/server');
const { createDbCheck, createQueueCheck } = require('./src/checks');

const { server } = createServer({
  checkDb: createDbCheck(process.env.DATABASE_URL),
  checkQueue: createQueueCheck(process.env.REDIS_URL),
});
server.listen(3000);
```

Los checks de DB y cola se inyectan (liveness TCP por defecto), lo que permite
sustituirlos por drivers reales (pg / BullMQ) sin tocar el servidor.

## Scripts

- `npm test` → `node --test`
- `npm run lint` → `node --check` de cada módulo
- `npm start` → levanta el servidor
