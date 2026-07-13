# Arquitectura — Plataforma de Notificaciones por Email

## 1. Estilo arquitectónico

Aplicación web modular (monolito modular) con **API REST** + **worker asíncrono** para
el envío. El envío de emails se procesa por una **cola** para desacoplar la petición del
envío real y soportar reintentos y rate limiting.

```
                +-------------------+
   Navegador -->|   Frontend (SPA)  |
                +---------+---------+
                          | HTTPS/REST
   Sistemas    +----------v----------+       +------------------+
   externos -->|   API Backend       |<----->|   Base de datos  |
   (API key)   |  (auth, CRUD, jobs) |       |   (PostgreSQL)   |
                +----+-----------+----+       +------------------+
                     | encola        ^
                     v               | eventos webhook
                +---------+          |
                |  Cola   |          |
                | (Redis) |          |
                +----+----+          |
                     |               |
                +----v---------------+----+     +------------------+
                |   Worker de envío       |---->| Proveedor Email  |
                | (render + send + retry) |     | (SES/SendGrid/SMTP)|
                +-------------------------+     +--------+---------+
                                                         | webhooks
                                                         v
                                                  API /webhooks/events
```

## 2. Componentes

- **Frontend (SPA)**: UI para gestión de contactos, plantillas, campañas y dashboard.
- **API Backend**: autenticación (JWT + API keys), CRUD, orquestación de envíos,
  recepción de webhooks de eventos.
- **Cola de trabajos (Redis)**: jobs de envío, reintentos con backoff, scheduling.
- **Worker de envío**: consume la cola, renderiza plantilla, llama al proveedor,
  aplica rate limiting y registra el resultado.
- **Base de datos (PostgreSQL)**: fuente de verdad (tenants, contactos, plantillas,
  campañas, mensajes, eventos).
- **Proveedor de email**: adaptador con interfaz común (patrón adapter) para
  SMTP / SES / SendGrid.

## 3. Decisiones clave

- **Multi-tenant** por columna `tenant_id` con aislamiento a nivel de aplicación.
- **Idempotencia** en el envío transaccional vía `idempotency_key`.
- **Webhooks entrantes** verificados por firma del proveedor.
- **Link de unsubscribe** firmado (token) en cada email de campaña.
- **Observabilidad**: logs estructurados, métricas de cola y tasa de entrega.

## 4. Seguridad

- Contraseñas hasheadas (bcrypt/argon2), JWT de vida corta + refresh.
- API keys por tenant, scopes limitados, rotación soportada.
- Rate limiting por tenant y por API key.
- Validación de webhooks por firma HMAC.
- Datos sensibles cifrados en tránsito (TLS) y credenciales de proveedor cifradas en reposo.

## 5. Stack sugerido

- Backend: Node.js/TypeScript (o Python) + framework REST.
- DB: PostgreSQL. Cola: Redis (BullMQ / RQ).
- Frontend: React/TypeScript.
- Infra: Docker Compose (dev), CI con lint+test, migraciones versionadas.
