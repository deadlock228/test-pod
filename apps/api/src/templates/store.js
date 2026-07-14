/**
 * Almacenamiento en memoria de plantillas, aislado por tenant.
 *
 * Define el contrato que un repositorio real (PostgreSQL) debe cumplir. Todas
 * las operaciones reciben `tenantId` para garantizar el aislamiento multi-tenant
 * exigido por el modelo de datos (cada fila lleva `tenant_id`).
 */
export class InMemoryTemplateStore {
  constructor() {
    /** @type {Map<string, Map<string, object>>} tenantId -> (id -> template) */
    this._byTenant = new Map();
  }

  _tenant(tenantId) {
    let bucket = this._byTenant.get(tenantId);
    if (!bucket) {
      bucket = new Map();
      this._byTenant.set(tenantId, bucket);
    }
    return bucket;
  }

  insert(template) {
    this._tenant(template.tenant_id).set(template.id, { ...template });
    return { ...template };
  }

  findById(tenantId, id) {
    const found = this._tenant(tenantId).get(id);
    return found ? { ...found } : null;
  }

  list(tenantId) {
    return [...this._tenant(tenantId).values()].map((t) => ({ ...t }));
  }

  update(tenantId, id, template) {
    this._tenant(tenantId).set(id, { ...template });
    return { ...template };
  }

  remove(tenantId, id) {
    return this._tenant(tenantId).delete(id);
  }
}
