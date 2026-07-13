import { randomUUID } from 'node:crypto';
import { IdempotencyConflictError } from './errors.js';

/**
 * Store en memoria para el slice de envío transaccional.
 * Modela las tablas relevantes del modelo de datos: api_key, template y message,
 * conservando el aislamiento por `tenant_id`.
 *
 * La unicidad de `idempotency_key` es por tenant (índice único), replicando la
 * restricción declarada en el modelo de datos (`idempotency_key unique por tenant`).
 */
export function createStore() {
  const apiKeys = new Map(); // key_hash -> api_key
  const templates = new Map(); // id -> template
  const messages = new Map(); // id -> message
  const idempotencyIndex = new Map(); // `${tenant_id}:${idempotency_key}` -> message.id

  function idemKey(tenantId, key) {
    return `${tenantId}:${key}`;
  }

  return {
    // ---- seeding / dependencias de otros slices (api-keys, plantillas) ----
    addApiKey(data) {
      const record = {
        id: data.id || randomUUID(),
        tenant_id: data.tenant_id,
        name: data.name || '',
        key_hash: data.key_hash,
        scopes: data.scopes || [],
        revoked_at: data.revoked_at ?? null,
      };
      apiKeys.set(record.key_hash, record);
      return record;
    },
    findApiKeyByHash(hash) {
      return apiKeys.get(hash) || null;
    },

    addTemplate(data) {
      const record = {
        id: data.id || randomUUID(),
        tenant_id: data.tenant_id,
        name: data.name || '',
        subject: data.subject || '',
        body_html: data.body_html || '',
        body_text: data.body_text || '',
      };
      templates.set(record.id, record);
      return record;
    },
    findTemplate(tenantId, id) {
      const tpl = templates.get(id);
      return tpl && tpl.tenant_id === tenantId ? tpl : null;
    },

    // ---- mensajes ----
    findMessageByIdempotencyKey(tenantId, key) {
      const id = idempotencyIndex.get(idemKey(tenantId, key));
      return id ? messages.get(id) : null;
    },

    createMessage(data) {
      if (data.idempotency_key) {
        const k = idemKey(data.tenant_id, data.idempotency_key);
        if (idempotencyIndex.has(k)) {
          throw new IdempotencyConflictError();
        }
      }
      const now = new Date().toISOString();
      const record = {
        id: randomUUID(),
        tenant_id: data.tenant_id,
        campaign_id: null,
        contact_id: data.contact_id ?? null,
        to_email: data.to_email,
        template_id: data.template_id ?? null,
        subject: data.subject ?? '',
        status: data.status || 'queued',
        provider_message_id: null,
        idempotency_key: data.idempotency_key ?? null,
        error: null,
        created_at: now,
        updated_at: now,
      };
      messages.set(record.id, record);
      if (record.idempotency_key) {
        idempotencyIndex.set(idemKey(record.tenant_id, record.idempotency_key), record.id);
      }
      return record;
    },

    getMessage(tenantId, id) {
      const msg = messages.get(id);
      return msg && msg.tenant_id === tenantId ? msg : null;
    },

    listMessages(tenantId) {
      return [...messages.values()].filter((m) => m.tenant_id === tenantId);
    },
  };
}
