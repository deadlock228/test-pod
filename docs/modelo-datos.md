# Modelo de Datos — Plataforma de Notificaciones por Email

Todas las tablas de negocio incluyen `tenant_id` para aislamiento multi-tenant,
más `created_at` / `updated_at`.

## Entidades

### tenant
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| name | text | |
| plan | text | free/pro |
| status | text | active/suspended |

### user
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| tenant_id | uuid (FK) | |
| email | text (unique por tenant) | |
| password_hash | text | |
| role | text | admin/operador/viewer |

### api_key
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| tenant_id | uuid (FK) | |
| name | text | |
| key_hash | text | se guarda hash, no la key |
| scopes | text[] | |
| revoked_at | timestamp null | |

### contact
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| tenant_id | uuid (FK) | |
| email | text | unique por tenant |
| name | text | |
| attributes | jsonb | datos para variables de plantilla |
| subscribed | bool | estado de suscripción |
| unsubscribed_at | timestamp null | |

### list
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| tenant_id | uuid (FK) | |
| name | text | |

### list_contact (N:M)
| Campo | Tipo | Notas |
|-------|------|-------|
| list_id | uuid (FK) | |
| contact_id | uuid (FK) | PK compuesta |

### template
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| tenant_id | uuid (FK) | |
| name | text | |
| subject | text | soporta variables |
| body_html | text | soporta variables |
| body_text | text | fallback |

### campaign
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| tenant_id | uuid (FK) | |
| name | text | |
| template_id | uuid (FK) | |
| list_id | uuid (FK) | |
| status | text | draft/scheduled/sending/sent/failed |
| scheduled_at | timestamp null | |
| sent_at | timestamp null | |

### message
Cada email individual (transaccional o de campaña).
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| tenant_id | uuid (FK) | |
| campaign_id | uuid null (FK) | null si es transaccional |
| contact_id | uuid null (FK) | |
| to_email | text | |
| template_id | uuid null (FK) | |
| subject | text | render final |
| status | text | queued/sent/delivered/bounced/failed |
| provider_message_id | text | id del proveedor |
| idempotency_key | text null | unique por tenant |
| error | text null | |

### email_event
Eventos de tracking recibidos por webhook.
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| tenant_id | uuid (FK) | |
| message_id | uuid (FK) | |
| type | text | delivered/opened/clicked/bounced/complained |
| metadata | jsonb | url del clic, motivo de rebote... |
| occurred_at | timestamp | |

### provider_config
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| tenant_id | uuid (FK) | |
| type | text | smtp/ses/sendgrid |
| credentials | jsonb (cifrado) | |
| from_email | text | |
| verified | bool | |

## Relaciones

- tenant 1—N user, api_key, contact, list, template, campaign, message, provider_config
- list N—N contact (via list_contact)
- campaign N—1 template, campaign N—1 list
- campaign 1—N message
- message 1—N email_event
