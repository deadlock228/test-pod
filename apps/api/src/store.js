// Store en memoria con aislamiento multi-tenant a nivel de aplicación.
//
// Toda tabla de negocio (todas menos `tenant`) exige un `tenant_id` en las
// consultas: los métodos scoped filtran SIEMPRE por tenant_id, de modo que es
// imposible leer/escribir datos de otro tenant por accidente.
//
// La interfaz imita un repositorio para poder cambiar por PostgreSQL más
// adelante sin tocar los servicios.
import crypto from 'node:crypto';

const TENANT_SCOPED = new Set([
  'user',
  'api_key',
  'contact',
  'list',
  'template',
  'campaign',
  'message',
  'email_event',
  'provider_config',
]);

export class Store {
  constructor() {
    this.tables = new Map();
  }

  _table(name) {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name);
  }

  // --- tenant (tabla raíz, no scoped) -------------------------------------
  insertTenant(data) {
    const row = {
      id: crypto.randomUUID(),
      status: 'active',
      plan: 'free',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...data,
    };
    this._table('tenant').push(row);
    return { ...row };
  }

  findTenantById(id) {
    const row = this._table('tenant').find((r) => r.id === id);
    return row ? { ...row } : null;
  }

  // --- tablas scoped por tenant ------------------------------------------
  _assertScoped(table) {
    if (!TENANT_SCOPED.has(table)) {
      throw new Error(`Tabla "${table}" no es tenant-scoped`);
    }
  }

  insert(table, tenantId, data) {
    this._assertScoped(table);
    if (!tenantId) throw new Error('tenant_id requerido');
    const row = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...data,
      tenant_id: tenantId, // el tenant_id nunca puede ser sobreescrito por data
    };
    this._table(table).push(row);
    return { ...row };
  }

  // Devuelve SOLO filas del tenant indicado (aislamiento garantizado).
  find(table, tenantId, predicate = () => true) {
    this._assertScoped(table);
    if (!tenantId) throw new Error('tenant_id requerido');
    return this._table(table)
      .filter((r) => r.tenant_id === tenantId && predicate(r))
      .map((r) => ({ ...r }));
  }

  findOne(table, tenantId, predicate = () => true) {
    const rows = this.find(table, tenantId, predicate);
    return rows.length ? rows[0] : null;
  }

  update(table, tenantId, id, patch) {
    this._assertScoped(table);
    if (!tenantId) throw new Error('tenant_id requerido');
    const row = this._table(table).find(
      (r) => r.id === id && r.tenant_id === tenantId,
    );
    if (!row) return null;
    Object.assign(row, patch, {
      id: row.id,
      tenant_id: row.tenant_id,
      updated_at: new Date().toISOString(),
    });
    return { ...row };
  }

  remove(table, tenantId, id) {
    this._assertScoped(table);
    if (!tenantId) throw new Error('tenant_id requerido');
    const arr = this._table(table);
    const idx = arr.findIndex((r) => r.id === id && r.tenant_id === tenantId);
    if (idx === -1) return false;
    arr.splice(idx, 1);
    return true;
  }
}
