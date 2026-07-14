import { normalizeEmail } from './email.js';

// Repositorio en memoria que implementa la interfaz que consume el importador.
// En producción se reemplaza por uno respaldado en PostgreSQL, respetando la
// unicidad de `email` por `tenant_id` (ver docs/modelo-datos.md).
export class InMemoryContactRepository {
  constructor() {
    this._store = new Map();
    this._seq = 0;
  }

  _key(tenantId, email) {
    return `${tenantId}::${normalizeEmail(email)}`;
  }

  async findByEmail(tenantId, email) {
    return this._store.get(this._key(tenantId, email)) ?? null;
  }

  async create(tenantId, data) {
    const contact = {
      id: ++this._seq,
      tenantId,
      email: normalizeEmail(data.email),
      name: data.name ?? '',
      attributes: { ...(data.attributes ?? {}) },
      subscribed: true,
    };
    this._store.set(this._key(tenantId, contact.email), contact);
    return contact;
  }

  async update(tenantId, existing, data) {
    const updated = {
      ...existing,
      name: data.name !== undefined && data.name !== '' ? data.name : existing.name,
      attributes: { ...existing.attributes, ...(data.attributes ?? {}) },
    };
    this._store.set(this._key(tenantId, existing.email), updated);
    return updated;
  }

  all() {
    return [...this._store.values()];
  }
}
