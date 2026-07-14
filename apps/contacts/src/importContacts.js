import { parseCsv } from './csv.js';
import { isValidEmail, normalizeEmail } from './email.js';

const RESERVED_COLUMNS = new Set(['email', 'name']);

/**
 * Importa contactos desde el contenido de un CSV.
 *
 * - Crea o actualiza contactos (upsert por email dentro del tenant).
 * - Las filas con email inválido se reportan en `errors` sin abortar el proceso.
 * - Devuelve un resumen { created, updated, errors, total }.
 *
 * @param {string} csvText contenido del archivo CSV
 * @param {object} repo repositorio con findByEmail/create/update
 * @param {object} options
 * @param {string} options.tenantId tenant al que pertenecen los contactos
 */
export async function importContactsFromCsv(csvText, repo, options = {}) {
  const { tenantId } = options;
  const summary = { created: 0, updated: 0, errors: [], total: 0 };

  const rows = parseCsv(csvText);
  if (rows.length === 0) return summary;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const emailIdx = header.indexOf('email');
  const nameIdx = header.indexOf('name');
  if (emailIdx === -1) {
    throw new Error('El CSV debe incluir una columna "email"');
  }

  const attrColumns = header
    .map((h, i) => ({ name: h, index: i }))
    .filter((c) => c.name !== '' && !RESERVED_COLUMNS.has(c.name));

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];

    // Ignoramos líneas totalmente vacías (sin contarlas ni como error).
    const isBlank = row.every((cell) => (cell ?? '').trim() === '');
    if (isBlank) continue;

    summary.total++;
    const line = r + 1; // 1-based, contando la cabecera como línea 1

    const rawEmail = (row[emailIdx] ?? '').trim();
    if (!isValidEmail(rawEmail)) {
      summary.errors.push({
        line,
        email: rawEmail,
        error: rawEmail === '' ? 'email vacío' : 'email inválido',
      });
      continue;
    }

    const email = normalizeEmail(rawEmail);
    const name = nameIdx !== -1 ? (row[nameIdx] ?? '').trim() : '';
    const attributes = {};
    for (const col of attrColumns) {
      const value = (row[col.index] ?? '').trim();
      if (value !== '') attributes[col.name] = value;
    }

    const data = { email, name, attributes };

    try {
      const existing = await repo.findByEmail(tenantId, email);
      if (existing) {
        await repo.update(tenantId, existing, data);
        summary.updated++;
      } else {
        await repo.create(tenantId, data);
        summary.created++;
      }
    } catch (err) {
      summary.errors.push({
        line,
        email: rawEmail,
        error: `error al persistir: ${err.message}`,
      });
    }
  }

  return summary;
}
