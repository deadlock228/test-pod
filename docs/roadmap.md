# Roadmap — Plataforma de Notificaciones por Email

## Fase 0 — Foundation (scaffolding)
Repos, Docker Compose (API, worker, PostgreSQL, Redis), CI (lint+test), migraciones,
variables de entorno y esqueleto de la app.

## Fase 1 — Núcleo de identidad y datos (MVP base)
- B01 Autenticación y multi-tenant
- B02 API keys
- B03 CRUD de contactos
- B05 Listas
- B06 CRUD de plantillas

## Fase 2 — Motor de envío (MVP core)
- B08 Configuración de proveedor
- B07 Render de plantillas
- B10 Cola + worker de envío
- B09 Envío transaccional individual
- B13 Webhooks de eventos

## Fase 3 — Campañas y cumplimiento
- B11 Campañas a listas
- B14 Unsubscribe / suscripciones
- B12 Programación de envíos

## Fase 4 — Visibilidad y mejoras
- B16 Historial de mensajes
- B15 Dashboard de métricas
- B04 Import CSV
- B17 Observabilidad

## Hitos
1. **M1**: Un usuario puede registrarse, crear contactos y plantillas.
2. **M2**: La API dispara un email transaccional y se entrega vía proveedor.
3. **M3**: Se lanza una campaña a una lista con tracking y baja.
4. **M4**: Dashboard y métricas de entrega disponibles.
