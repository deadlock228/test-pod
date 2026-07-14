// Render de plantillas de email con variables `{{...}}`.
//
// Las variables se sustituyen con los atributos del contacto. El contexto de
// render se arma combinando los campos de primer nivel del contacto (por ej.
// `name`, `email`) con su bolsa de atributos dinámicos (`attributes`), tal como
// se modela en la tabla `contact` (columna `attributes` jsonb).
//
// Reglas:
// - Las variables presentes se reemplazan por el valor correspondiente.
// - Las variables faltantes se resuelven con un valor por defecto vacío
//   (o con un placeholder configurable).
// - El render aplica tanto a `subject` como a `body`.

// Matchea `{{ clave }}` admitiendo espacios y rutas con punto (`user.name`).
const VARIABLE_RE = /\{\{\s*([\w.$-]+)\s*\}\}/g;

/**
 * Resuelve una clave (posiblemente anidada con puntos) dentro del contexto.
 * Devuelve `undefined` si algún tramo no existe.
 */
function resolveKey(context, key) {
  if (context == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(context, key)) {
    return context[key];
  }
  let current = context;
  for (const part of key.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Construye el contexto de variables a partir de un contacto.
 * Combina campos de primer nivel con la bolsa `attributes`.
 * Los `attributes` tienen prioridad más baja que los campos top-level.
 */
export function buildContext(contact = {}) {
  const { attributes, ...rest } = contact ?? {};
  return {
    ...(attributes && typeof attributes === 'object' ? attributes : {}),
    ...rest,
  };
}

/**
 * Reemplaza las variables `{{...}}` de un string usando el contexto dado.
 *
 * @param {string} template texto con variables.
 * @param {object} context   diccionario de valores.
 * @param {object} [options]
 * @param {string} [options.defaultValue=''] valor para variables faltantes.
 * @param {(key: string) => string} [options.placeholder] función que genera
 *        el reemplazo para variables faltantes (tiene prioridad sobre defaultValue).
 * @returns {string}
 */
export function renderString(template, context = {}, options = {}) {
  if (template == null) return '';
  const { defaultValue = '', placeholder } = options;
  return String(template).replace(VARIABLE_RE, (_match, key) => {
    const value = resolveKey(context, key);
    if (value === undefined || value === null) {
      if (typeof placeholder === 'function') return String(placeholder(key));
      return defaultValue;
    }
    return String(value);
  });
}

/**
 * Renderiza una plantilla completa (subject + body) con los atributos del
 * contacto. Soporta además `body_html` y `body_text` si están presentes.
 *
 * @param {object} template `{ subject, body, body_html?, body_text? }`
 * @param {object} contact  contacto con `attributes` y campos top-level.
 * @param {object} [options] mismas opciones que `renderString`.
 * @returns {object} plantilla con los campos de texto renderizados.
 */
export function renderTemplate(template = {}, contact = {}, options = {}) {
  const context = buildContext(contact);
  const result = {};
  for (const field of ['subject', 'body', 'body_html', 'body_text']) {
    if (template[field] !== undefined) {
      result[field] = renderString(template[field], context, options);
    }
  }
  return result;
}

export default renderTemplate;
