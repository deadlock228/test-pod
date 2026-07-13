import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  importContactsFromCsv,
  InMemoryContactRepository,
  parseCsv,
  isValidEmail,
} from '../src/index.js';

const TENANT = 'tenant-1';

// --- CSV parser -----------------------------------------------------------

test('parseCsv soporta campos entrecomillados con comas y comillas escapadas', () => {
  const rows = parseCsv('email,name\n"a@b.com","Doe, ""JD"""');
  assert.deepEqual(rows[0], ['email', 'name']);
  assert.deepEqual(rows[1], ['a@b.com', 'Doe, "JD"']);
});

// --- Validación de email --------------------------------------------------

test('isValidEmail acepta válidos y rechaza inválidos', () => {
  assert.equal(isValidEmail('user@example.com'), true);
  assert.equal(isValidEmail('no-arroba'), false);
  assert.equal(isValidEmail('a@@b.com'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('a@b'), false);
});

// --- Criterio: se sube un CSV y se crean/actualizan contactos -------------

test('crea contactos nuevos desde el CSV', async () => {
  const repo = new InMemoryContactRepository();
  const csv = [
    'email,name,company',
    'ana@example.com,Ana,Acme',
    'beto@example.com,Beto,Globex',
  ].join('\n');

  const summary = await importContactsFromCsv(csv, repo, { tenantId: TENANT });

  assert.equal(summary.created, 2);
  assert.equal(summary.updated, 0);
  assert.equal(summary.errors.length, 0);
  assert.equal(summary.total, 2);

  const ana = await repo.findByEmail(TENANT, 'ana@example.com');
  assert.equal(ana.name, 'Ana');
  assert.equal(ana.attributes.company, 'Acme');
});

test('actualiza contactos existentes (upsert por email, case-insensitive)', async () => {
  const repo = new InMemoryContactRepository();
  await repo.create(TENANT, { email: 'ana@example.com', name: 'Ana', attributes: { company: 'Old' } });

  const csv = [
    'email,name,company',
    'ANA@example.com,Ana María,Acme', // mismo email en mayúsculas
    'nuevo@example.com,Nuevo,',
  ].join('\n');

  const summary = await importContactsFromCsv(csv, repo, { tenantId: TENANT });

  assert.equal(summary.created, 1);
  assert.equal(summary.updated, 1);

  const ana = await repo.findByEmail(TENANT, 'ana@example.com');
  assert.equal(ana.name, 'Ana María');
  assert.equal(ana.attributes.company, 'Acme');
});

// --- Criterio: filas con email inválido se reportan sin abortar -----------

test('reporta filas con email inválido sin abortar el proceso', async () => {
  const repo = new InMemoryContactRepository();
  const csv = [
    'email,name',
    'ok@example.com,Ok',
    'no-es-email,Malo',   // inválido
    ',SinEmail',          // vacío
    'otro@example.com,Otro',
  ].join('\n');

  const summary = await importContactsFromCsv(csv, repo, { tenantId: TENANT });

  // El proceso NO aborta: los dos válidos se crean.
  assert.equal(summary.created, 2);
  assert.equal(summary.errors.length, 2);

  // Reporte con número de línea y motivo.
  assert.deepEqual(summary.errors[0], { line: 3, email: 'no-es-email', error: 'email inválido' });
  assert.deepEqual(summary.errors[1], { line: 4, email: '', error: 'email vacío' });

  // Los válidos quedaron persistidos.
  assert.ok(await repo.findByEmail(TENANT, 'ok@example.com'));
  assert.ok(await repo.findByEmail(TENANT, 'otro@example.com'));
});

test('un fallo de persistencia en una fila no aborta el resto', async () => {
  const repo = new InMemoryContactRepository();
  const original = repo.create.bind(repo);
  let calls = 0;
  repo.create = async (tenantId, data) => {
    calls++;
    if (calls === 1) throw new Error('DB caída');
    return original(tenantId, data);
  };

  const csv = [
    'email,name',
    'primero@example.com,Uno',
    'segundo@example.com,Dos',
  ].join('\n');

  const summary = await importContactsFromCsv(csv, repo, { tenantId: TENANT });

  assert.equal(summary.created, 1);
  assert.equal(summary.errors.length, 1);
  assert.match(summary.errors[0].error, /error al persistir/);
});

// --- Criterio: resumen de creados/actualizados/errores --------------------

test('devuelve un resumen con created/updated/errors/total', async () => {
  const repo = new InMemoryContactRepository();
  await repo.create(TENANT, { email: 'existe@example.com', name: 'Existe' });

  const csv = [
    'email,name',
    'existe@example.com,Existe Editado', // update
    'nuevo1@example.com,Nuevo1',          // create
    'nuevo2@example.com,Nuevo2',          // create
    'roto,Roto',                           // error
  ].join('\n');

  const summary = await importContactsFromCsv(csv, repo, { tenantId: TENANT });

  assert.deepEqual(
    {
      created: summary.created,
      updated: summary.updated,
      errors: summary.errors.length,
      total: summary.total,
    },
    { created: 2, updated: 1, errors: 1, total: 4 },
  );
});

test('ignora líneas en blanco y tolera CSV vacío', async () => {
  const repo = new InMemoryContactRepository();
  const csv = 'email,name\n\nsolo@example.com,Solo\n\n';

  const summary = await importContactsFromCsv(csv, repo, { tenantId: TENANT });
  assert.equal(summary.created, 1);
  assert.equal(summary.total, 1);
  assert.equal(summary.errors.length, 0);

  const vacio = await importContactsFromCsv('', repo, { tenantId: TENANT });
  assert.deepEqual(vacio, { created: 0, updated: 0, errors: [], total: 0 });
});

test('lanza error si falta la columna email en la cabecera', async () => {
  const repo = new InMemoryContactRepository();
  await assert.rejects(
    () => importContactsFromCsv('nombre,empresa\nAna,Acme', repo, { tenantId: TENANT }),
    /columna "email"/,
  );
});
