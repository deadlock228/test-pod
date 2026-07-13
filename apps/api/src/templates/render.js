/**
 * Renderizado de plantillas con variables `{{variable}}`.
 *
 * Sustituye los placeholders `{{clave}}` por el valor correspondiente de
 * `variables`. Se toleran espacios internos (`{{ clave }}`) y las claves con
 * puntos para acceder a atributos anidados (`{{contacto.nombre}}`).
 *
 * Las variables ausentes se sustituyen por cadena vacía para no filtrar el
 * placeholder crudo al destinatario.
 */

const PLACEHOLDER = /{{\s*([\w.]+)\s*}}/g;

function resolvePath(variables, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return acc[key];
  }, variables);
}

/**
 * Aplica las variables a una cadena de texto.
 * @param {string} template
 * @param {Record<string, unknown>} [variables]
 * @returns {string}
 */
export function renderString(template, variables = {}) {
  if (template == null) return "";
  return String(template).replace(PLACEHOLDER, (_match, path) => {
    const value = resolvePath(variables, path);
    return value == null ? "" : String(value);
  });
}

/**
 * Renderiza subject / body_html / body_text de una plantilla.
 * @param {{subject?: string, body_html?: string, body_text?: string}} template
 * @param {Record<string, unknown>} [variables]
 * @returns {{subject: string, body_html: string, body_text: string}}
 */
export function renderTemplate(template, variables = {}) {
  return {
    subject: renderString(template.subject ?? "", variables),
    body_html: renderString(template.body_html ?? "", variables),
    body_text: renderString(template.body_text ?? "", variables),
  };
}
