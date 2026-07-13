// Parser CSV mínimo y sin dependencias.
// Soporta campos entrecomillados, comas y saltos de línea dentro de comillas,
// y comillas escapadas ("" -> ").
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let started = false; // si empezamos a leer contenido de la fila actual

  const s = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    started = true;

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushField();
      pushRow();
    } else {
      field += c;
    }
  }

  // Volcamos el último campo/fila si quedó contenido pendiente.
  if (started || field !== '' || row.length > 0) {
    pushField();
    pushRow();
  }

  return rows;
}
