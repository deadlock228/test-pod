import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';

test('insert fuerza el tenant_id y no lo deja sobreescribir por data', () => {
  const store = new Store();
  const t = store.insertTenant({ name: 'Acme' });
  const row = store.insert('contact', t.id, {
    email: 'a@a.com',
    tenant_id: 'OTRO-TENANT-FALSO',
  });
  assert.equal(row.tenant_id, t.id);
});

test('find SOLO devuelve filas del tenant indicado (aislamiento)', () => {
  const store = new Store();
  const t1 = store.insertTenant({ name: 'T1' });
  const t2 = store.insertTenant({ name: 'T2' });
  store.insert('contact', t1.id, { email: 'uno@t1.com' });
  store.insert('contact', t1.id, { email: 'dos@t1.com' });
  store.insert('contact', t2.id, { email: 'uno@t2.com' });

  const t1Contacts = store.find('contact', t1.id);
  const t2Contacts = store.find('contact', t2.id);
  assert.equal(t1Contacts.length, 2);
  assert.equal(t2Contacts.length, 1);
  assert.ok(t1Contacts.every((c) => c.tenant_id === t1.id));
  assert.equal(t2Contacts[0].email, 'uno@t2.com');
});

test('update/remove no alcanzan filas de otro tenant', () => {
  const store = new Store();
  const t1 = store.insertTenant({ name: 'T1' });
  const t2 = store.insertTenant({ name: 'T2' });
  const c1 = store.insert('contact', t1.id, { email: 'uno@t1.com' });

  // Otro tenant no puede actualizar ni borrar el contacto de t1.
  assert.equal(store.update('contact', t2.id, c1.id, { name: 'x' }), null);
  assert.equal(store.remove('contact', t2.id, c1.id), false);
  // El dueño sí.
  assert.ok(store.update('contact', t1.id, c1.id, { name: 'x' }));
  assert.equal(store.remove('contact', t1.id, c1.id), true);
});

test('las tablas scoped exigen tenant_id', () => {
  const store = new Store();
  assert.throws(() => store.find('contact', undefined), /tenant_id requerido/);
  assert.throws(() => store.insert('contact', '', {}), /tenant_id requerido/);
});
