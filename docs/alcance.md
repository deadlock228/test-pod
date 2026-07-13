# Alcance — Plataforma de Notificaciones por Email

## 1. Visión

Producto SaaS que permite a las empresas enviar **notificaciones por email** a sus
clientes: comunicaciones transaccionales (confirmaciones, alertas) y campañas
(newsletters, promociones). Ofrece gestión de contactos, plantillas reutilizables,
envío inmediato o programado, integración con proveedores de email y seguimiento de
métricas de entrega/apertura/clic.

## 2. Objetivos

- Centralizar el envío de emails a clientes desde una sola plataforma.
- Reducir el tiempo de creación de comunicaciones con plantillas y variables.
- Garantizar la trazabilidad: saber qué se envió, a quién y con qué resultado.
- Cumplir requisitos legales de opt-out (baja de suscripción).

## 3. Usuarios / Roles

| Rol | Descripción |
|-----|-------------|
| **Admin** | Gestiona el tenant, usuarios, proveedor de envío y facturación. |
| **Operador** | Crea contactos, plantillas y campañas; dispara notificaciones. |
| **Viewer** | Solo consulta métricas y estado de envíos. |
| **Sistema externo** | Consume la API pública (API key) para disparar emails transaccionales. |
| **Destinatario/Cliente** | Recibe emails y gestiona su suscripción/baja. |

## 4. Dentro del alcance (MVP)

- Autenticación y multi-tenant (aislamiento de datos por organización).
- Gestión de contactos (CRUD, import CSV) y listas/segmentos.
- Plantillas de email con variables dinámicas (`{{nombre}}`, etc.).
- Integración con proveedor de envío (SMTP y proveedor tipo SES/SendGrid).
- Envío de email individual (transaccional) vía API/UI.
- Campañas a listas de contactos.
- Programación de envíos (fecha/hora futura).
- Tracking de eventos: entregado, abierto, clic, rebote, queja.
- Gestión de suscripciones y baja (unsubscribe) con link automático.
- Dashboard de métricas.
- API pública con API keys para envío transaccional.

## 5. Fuera del alcance (MVP)

- Envío de SMS / push / WhatsApp.
- Editor drag-and-drop avanzado de plantillas.
- A/B testing de campañas.
- Facturación y planes de pago automatizados.
- Automatizaciones/workflows multi-paso.

## 6. Supuestos y restricciones

- El envío real se delega a un proveedor externo (no montamos MTA propio).
- Los eventos de tracking llegan por webhooks del proveedor.
- Cumplimiento CAN-SPAM/GDPR: todo email de campaña incluye link de baja.
- Rate limiting por tenant para evitar abuso.

## 7. Métricas de éxito

- Tasa de entrega > 98%.
- Tiempo de creación y envío de una campaña < 10 min.
- Disponibilidad de la API de envío ≥ 99.5%.
