'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getRequestId, getTenantId } = require('../src/requestContext');

test('reutiliza x-request-id entrante', () => {
  const id = getRequestId({ headers: { 'x-request-id': 'req-123' } });
  assert.equal(id, 'req-123');
});

test('genera un request id cuando no viene en headers', () => {
  const id = getRequestId({ headers: {} });
  assert.match(id, /[0-9a-f-]{36}/);
});

test('extrae tenant desde x-tenant-id', () => {
  assert.equal(getTenantId({ headers: { 'x-tenant-id': 'acme' } }), 'acme');
});

test('devuelve null cuando no hay tenant', () => {
  assert.equal(getTenantId({ headers: {} }), null);
});
