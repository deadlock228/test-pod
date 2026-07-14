import test from 'node:test';
import assert from 'node:assert/strict';
import { can, isValidRole, ROLES } from '../src/rbac.js';

test('los tres roles son válidos', () => {
  assert.deepEqual(ROLES, ['admin', 'operador', 'viewer']);
  for (const r of ROLES) assert.equal(isValidRole(r), true);
  assert.equal(isValidRole('root'), false);
});

test('solo admin gestiona usuarios y proveedor', () => {
  assert.equal(can('admin', 'users:manage'), true);
  assert.equal(can('operador', 'users:manage'), false);
  assert.equal(can('viewer', 'users:manage'), false);
  assert.equal(can('admin', 'provider:manage'), true);
  assert.equal(can('operador', 'provider:manage'), false);
});

test('admin y operador escriben recursos; viewer no', () => {
  assert.equal(can('admin', 'resource:write'), true);
  assert.equal(can('operador', 'resource:write'), true);
  assert.equal(can('viewer', 'resource:write'), false);
});

test('los tres roles pueden leer recursos', () => {
  assert.equal(can('admin', 'resource:read'), true);
  assert.equal(can('operador', 'resource:read'), true);
  assert.equal(can('viewer', 'resource:read'), true);
});
