# Backlog — Plataforma de Notificaciones por Email

Prioridad: **must** (MVP), **should** (importante), **could** (deseable).

| ID | Título | Prioridad | Detalle |
|----|--------|-----------|---------|
| B01 | Autenticación y multi-tenant | must | Registro/login, JWT, aislamiento por tenant, roles. |
| B02 | Gestión de API keys | must | Crear/revocar keys por tenant con scopes. |
| B03 | CRUD de contactos | must | Alta/edición/baja de contactos con atributos. |
| B04 | Import de contactos CSV | should | Carga masiva con validación de emails. |
| B05 | Listas y segmentos | must | Agrupar contactos en listas. |
| B06 | CRUD de plantillas | must | Plantillas con subject y body HTML/texto. |
| B07 | Render de plantillas con variables | must | Sustitución de `{{variables}}` con atributos del contacto. |
| B08 | Configuración de proveedor de envío | must | Adaptador SMTP/SES/SendGrid + verificación. |
| B09 | Envío transaccional individual (API) | must | Endpoint con idempotencia que encola envío. |
| B10 | Cola + worker de envío | must | Procesamiento asíncrono con reintentos y rate limiting. |
| B11 | Campañas a listas | must | Crear campaña, encolar envíos a todos los contactos. |
| B12 | Programación de envíos | should | Enviar campaña en fecha/hora futura. |
| B13 | Recepción de webhooks de eventos | must | Endpoint firmado que registra delivered/open/click/bounce. |
| B14 | Gestión de suscripciones / unsubscribe | must | Link firmado de baja y estado de suscripción. |
| B15 | Dashboard de métricas | should | Tasas de entrega/apertura/clic/rebote por campaña. |
| B16 | Historial y detalle de mensajes | should | Listado y estado de cada email enviado. |
| B17 | Observabilidad y health checks | could | Logs estructurados, métricas de cola, /health. |
