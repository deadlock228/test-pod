# @email-notif/analytics — Dashboard de métricas (B15)

Agrega las métricas de campañas de email a partir de la tabla `email_event`.

## API

### `aggregateCampaignMetrics({ messages, events, campaigns?, from?, to?, tenantId? })`
Devuelve una fila por campaña con:

| Campo | Cálculo |
|-------|---------|
| `sent` | # de mensajes de la campaña efectivamente enviados |
| `delivered` / `opened` / `clicked` / `bounced` / `complained` | destinatarios únicos por tipo de evento |
| `deliveryRate` | `delivered / sent` |
| `openRate` | `opened / delivered` |
| `clickRate` | `clicked / delivered` |
| `bounceRate` | `bounced / sent` |

- **Métricas agregadas por campaña**: una fila por `campaign_id`.
- **Tasas desde `email_event`**: los numeradores salen de los eventos de tracking.
- **Filtro por rango de fechas**: `from` / `to` (inclusive, extremos opcionales) se
  aplican sobre `occurred_at` de los eventos (y `created_at` de los mensajes).
- Aislamiento multi-tenant opcional vía `tenantId`.

### `buildDashboard({ messages, events, campaigns }, { tenantId?, from?, to? })`
Envuelve la agregación y añade `totals` del período y el `range` aplicado (ISO).

## Diseño

Funciones puras sin dependencias externas: reciben los datos ya cargados desde
PostgreSQL y devuelven el payload del dashboard. La capa de acceso a datos y el
endpoint REST las consumen.

## Tests

```bash
npm test --workspaces --if-present   # usa node:test, sin dependencias externas
```
