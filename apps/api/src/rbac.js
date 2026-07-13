// Control de acceso basado en roles: admin / operador / viewer.
export const ROLES = Object.freeze(['admin', 'operador', 'viewer']);

export function isValidRole(role) {
  return ROLES.includes(role);
}

// Jerarquía de permisos: qué roles pueden ejecutar cada acción.
// - admin: gestiona tenant, usuarios, proveedor, todo.
// - operador: crea/edita recursos de negocio (contactos, plantillas, campañas).
// - viewer: solo lectura.
const PERMISSIONS = Object.freeze({
  'users:manage': ['admin'],
  'provider:manage': ['admin'],
  'resource:write': ['admin', 'operador'],
  'resource:read': ['admin', 'operador', 'viewer'],
});

export function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Devuelve true si `role` está dentro de la lista de roles permitidos. */
export function hasRole(role, allowedRoles) {
  return allowedRoles.includes(role);
}
