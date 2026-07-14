/**
 * Render simple de plantillas con variables `{{ variable }}`.
 * Las variables ausentes se resuelven como cadena vacía (B07).
 */
export function render(template, vars = {}) {
  if (template == null) return template;
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}
