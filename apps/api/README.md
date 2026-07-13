# @email-notif/api

API Backend de la Plataforma de Notificaciones por Email.

## Envío transaccional individual (B09)

`POST /v1/messages` — autenticado por **API key** (`X-API-Key: <key>` o
`Authorization: Bearer <key>`).

Body:

```jsonc
{
  "to": "cliente@example.com",          // requerido, email válido
  "idempotency_key": "order-123",       // opcional, único por tenant
  // --- opción A: plantilla ---
  "template_id": "tpl-welcome",
  "variables": { "nombre": "Ana" },
  // --- opción B: contenido inline (excluyente con template_id) ---
  "subject": "Asunto",
  "html": "<p>...</p>",
  "text": "..."
}
```

Respuestas:

- `202 Accepted` — se creó el `message` (estado `queued`) y se encoló el envío.
- `200 OK` — reintento idempotente: devuelve el `message` existente
  (`"deduplicated": true`), sin encolar de nuevo.
- `400` payload inválido, `401` API key ausente/inválida/revocada,
  `404` plantilla inexistente.

`GET /v1/messages/:id` — devuelve el estado del `message` (aislado por tenant).

## Scripts

- `npm test` — tests con el runner nativo (`node --test`), sin dependencias externas.
