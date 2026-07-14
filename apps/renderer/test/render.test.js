import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderTemplate,
  renderString,
  buildContext,
} from '../src/render.js';

test('reemplaza variables presentes por atributos del contacto', () => {
  const contact = {
    name: 'Ada',
    email: 'ada@example.com',
    attributes: { plan: 'pro', ciudad: 'Rosario' },
  };
  const out = renderTemplate(
    {
      subject: 'Hola {{name}}',
      body: 'Tu plan es {{plan}} en {{ciudad}} ({{email}})',
    },
    contact,
  );
  assert.equal(out.subject, 'Hola Ada');
  assert.equal(out.body, 'Tu plan es pro en Rosario (ada@example.com)');
});

test('variables faltantes se resuelven vacías por defecto', () => {
  const out = renderTemplate(
    { subject: 'Hola {{name}}', body: 'Cupon: {{cupon}} fin' },
    { name: 'Ada' },
  );
  assert.equal(out.subject, 'Hola Ada');
  assert.equal(out.body, 'Cupon:  fin');
});

test('variables faltantes pueden usar un placeholder configurable', () => {
  const out = renderTemplate(
    { subject: 'Hola {{nombre}}', body: '{{saldo}}' },
    {},
    { placeholder: (key) => `[${key}]` },
  );
  assert.equal(out.subject, 'Hola [nombre]');
  assert.equal(out.body, '[saldo]');
});

test('variables faltantes pueden usar un defaultValue', () => {
  const out = renderString('Hola {{nombre}}', {}, { defaultValue: 'cliente' });
  assert.equal(out, 'Hola cliente');
});

test('el render aplica tanto a subject como a body (y body_html/body_text)', () => {
  const contact = { name: 'Grace', attributes: { producto: 'Widget' } };
  const out = renderTemplate(
    {
      subject: 'Compra de {{producto}}',
      body: 'Gracias {{name}}',
      body_html: '<p>Gracias {{name}} por {{producto}}</p>',
      body_text: 'Gracias {{name}}',
    },
    contact,
  );
  assert.equal(out.subject, 'Compra de Widget');
  assert.equal(out.body, 'Gracias Grace');
  assert.equal(out.body_html, '<p>Gracias Grace por Widget</p>');
  assert.equal(out.body_text, 'Gracias Grace');
});

test('los campos top-level tienen prioridad sobre attributes homónimos', () => {
  const ctx = buildContext({ name: 'Real', attributes: { name: 'Attr' } });
  assert.equal(ctx.name, 'Real');
});

test('soporta rutas anidadas con punto', () => {
  const out = renderString('{{empresa.nombre}}', {
    empresa: { nombre: 'ACME' },
  });
  assert.equal(out, 'ACME');
});

test('admite espacios dentro de las llaves y ocurrencias repetidas', () => {
  const out = renderString('{{ name }} y de nuevo {{name}}', { name: 'Ada' });
  assert.equal(out, 'Ada y de nuevo Ada');
});

test('convierte valores no-string a string', () => {
  const out = renderString('total: {{n}}, activo: {{activo}}', {
    n: 42,
    activo: true,
  });
  assert.equal(out, 'total: 42, activo: true');
});

test('valores nulos se tratan como faltantes', () => {
  const out = renderString('x{{a}}x', { a: null }, { defaultValue: '-' });
  assert.equal(out, 'x-x');
});

test('template sin campos de texto no falla', () => {
  const out = renderTemplate({}, { name: 'Ada' });
  assert.deepEqual(out, {});
});

test('subject/body sin variables se devuelven tal cual', () => {
  const out = renderTemplate(
    { subject: 'Bienvenido', body: 'Sin variables aquí' },
    { name: 'Ada' },
  );
  assert.equal(out.subject, 'Bienvenido');
  assert.equal(out.body, 'Sin variables aquí');
});
