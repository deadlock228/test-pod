// Validación de email pragmática (no RFC completa) suficiente para el import.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (e.length === 0 || e.length > 254) return false;
  if (e.includes('..')) return false;
  return EMAIL_RE.test(e);
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}
