import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aggregateCampaignMetrics, inRange, EVENT_TYPES } from '../src/metrics.js';
import { buildDashboard } from '../src/dashboard.js';

// -- Fixtures ---------------------------------------------------------------
// Dos campañas del mismo tenant, con mensajes y eventos de tracking.
const TENANT = 't1';

function fixtures() {
  const campaigns = [
    { id: 'c1', tenant_id: TENANT, name: 'Newsletter Enero' },
    { id: 'c2', tenant_id: TENANT, name: 'Promo Verano' },
  ];

  // Campaña c1: 4 mensajes enviados. Campaña c2: 2 mensajes enviados.
  const messages = [
    { id: 'm1', tenant_id: TENANT, campaign_id: 'c1', status: 'delivered', created_at: '2026-01-10' },
    { id: 'm2', tenant_id: TENANT, campaign_id: 'c1', status: 'delivered', created_at: '2026-01-10' },
    { id: 'm3', tenant_id: TENANT, campaign_id: 'c1', status: 'delivered', created_at: '2026-01-10' },
    { id: 'm4', tenant_id: TENANT, campaign_id: 'c1', status: 'bounced', created_at: '2026-01-10' },
    { id: 'm5', tenant_id: TENANT, campaign_id: 'c2', status: 'delivered', created_at: '2026-06-01' },
    { id: 'm6', tenant_id: TENANT, campaign_id: 'c2', status: 'delivered', created_at: '2026-06-01' },
    // Mensaje transaccional (sin campaña) => no debe afectar métricas de campaña.
    { id: 'mx', tenant_id: TENANT, campaign_id: null, status: 'delivered', created_at: '2026-01-10' },
  ];

  const events = [
    // c1: 3 delivered, 2 opened, 1 clicked, 1 bounced
    { id: 'e1', tenant_id: TENANT, message_id: 'm1', type: EVENT_TYPES.DELIVERED, occurred_at: '2026-01-11T10:00:00Z' },
    { id: 'e2', tenant_id: TENANT, message_id: 'm2', type: EVENT_TYPES.DELIVERED, occurred_at: '2026-01-11T10:00:00Z' },
    { id: 'e3', tenant_id: TENANT, message_id: 'm3', type: EVENT_TYPES.DELIVERED, occurred_at: '2026-01-11T10:00:00Z' },
    { id: 'e4', tenant_id: TENANT, message_id: 'm1', type: EVENT_TYPES.OPENED, occurred_at: '2026-01-11T11:00:00Z' },
    // apertura duplicada del mismo mensaje: debe contar una sola vez
    { id: 'e4b', tenant_id: TENANT, message_id: 'm1', type: EVENT_TYPES.OPENED, occurred_at: '2026-01-11T11:30:00Z' },
    { id: 'e5', tenant_id: TENANT, message_id: 'm2', type: EVENT_TYPES.OPENED, occurred_at: '2026-01-11T12:00:00Z' },
    { id: 'e6', tenant_id: TENANT, message_id: 'm1', type: EVENT_TYPES.CLICKED, occurred_at: '2026-01-11T13:00:00Z' },
    { id: 'e7', tenant_id: TENANT, message_id: 'm4', type: EVENT_TYPES.BOUNCED, occurred_at: '2026-01-11T09:00:00Z' },
    // c2 (junio): 2 delivered, 1 opened
    { id: 'e8', tenant_id: TENANT, message_id: 'm5', type: EVENT_TYPES.DELIVERED, occurred_at: '2026-06-02T10:00:00Z' },
    { id: 'e9', tenant_id: TENANT, message_id: 'm6', type: EVENT_TYPES.DELIVERED, occurred_at: '2026-06-02T10:00:00Z' },
    { id: 'e10', tenant_id: TENANT, message_id: 'm5', type: EVENT_TYPES.OPENED, occurred_at: '2026-06-02T11:00:00Z' },
  ];

  return { campaigns, messages, events };
}

// -- Criterio: Se muestran métricas agregadas por campaña -------------------
test('agrega métricas en una fila por campaña', () => {
  const { campaigns, messages, events } = fixtures();
  const rows = aggregateCampaignMetrics({ campaigns, messages, events });

  assert.equal(rows.length, 2, 'una fila por campaña');
  const c1 = rows.find((r) => r.campaignId === 'c1');
  const c2 = rows.find((r) => r.campaignId === 'c2');

  assert.equal(c1.campaignName, 'Newsletter Enero');
  assert.equal(c1.sent, 4);
  assert.equal(c1.delivered, 3);
  assert.equal(c1.opened, 2, 'aperturas duplicadas cuentan una sola vez');
  assert.equal(c1.clicked, 1);
  assert.equal(c1.bounced, 1);

  assert.equal(c2.sent, 2);
  assert.equal(c2.delivered, 2);
  assert.equal(c2.opened, 1);
});

// -- Criterio: Las tasas se calculan a partir de email_event ----------------
test('calcula las tasas a partir de los email_event', () => {
  const { campaigns, messages, events } = fixtures();
  const rows = aggregateCampaignMetrics({ campaigns, messages, events });
  const c1 = rows.find((r) => r.campaignId === 'c1');

  // delivery = delivered/sent = 3/4
  assert.equal(c1.deliveryRate, 0.75);
  // open = opened/delivered = 2/3
  assert.equal(c1.openRate, 0.6667);
  // click = clicked/delivered = 1/3
  assert.equal(c1.clickRate, 0.3333);
  // bounce = bounced/sent = 1/4
  assert.equal(c1.bounceRate, 0.25);
});

test('sin eventos las tasas son 0 (sin división por cero)', () => {
  const messages = [
    { id: 'm1', tenant_id: TENANT, campaign_id: 'c9', status: 'sent', created_at: '2026-01-10' },
  ];
  const rows = aggregateCampaignMetrics({ messages, events: [] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deliveryRate, 0);
  assert.equal(rows[0].openRate, 0);
  assert.equal(rows[0].clickRate, 0);
  assert.equal(rows[0].bounceRate, 0);
});

// -- Criterio: Se puede filtrar por rango de fechas -------------------------
test('filtra los eventos por rango de fechas', () => {
  const { campaigns, messages, events } = fixtures();

  // Solo enero: c2 (junio) no debe tener eventos contados.
  const rows = aggregateCampaignMetrics({
    campaigns,
    messages,
    events,
    from: '2026-01-01T00:00:00Z',
    to: '2026-01-31T23:59:59Z',
  });

  const c1 = rows.find((r) => r.campaignId === 'c1');
  const c2 = rows.find((r) => r.campaignId === 'c2');

  assert.equal(c1.delivered, 3, 'los eventos de enero se cuentan');
  assert.equal(c2.delivered, 0, 'los eventos de junio quedan fuera del rango');
  assert.equal(c2.openRate, 0);
});

test('el filtro de fechas restringe el numerador (media apertura)', () => {
  const { campaigns, messages, events } = fixtures();
  // Rango que sólo incluye entregas (10:00) pero no aperturas (>=11:00) de c1.
  const rows = aggregateCampaignMetrics({
    campaigns,
    messages,
    events,
    from: '2026-01-11T00:00:00Z',
    to: '2026-01-11T10:30:00Z',
  });
  const c1 = rows.find((r) => r.campaignId === 'c1');
  assert.equal(c1.delivered, 3);
  assert.equal(c1.opened, 0, 'las aperturas posteriores al rango no cuentan');
  assert.equal(c1.openRate, 0);
});

test('inRange es inclusivo y soporta extremos abiertos', () => {
  assert.equal(inRange('2026-01-10', '2026-01-01', '2026-01-31'), true);
  assert.equal(inRange('2026-02-01', '2026-01-01', '2026-01-31'), false);
  assert.equal(inRange('2026-02-01', '2026-01-01', undefined), true); // sin tope superior
  assert.equal(inRange('2025-12-01', undefined, '2026-01-31'), true); // sin tope inferior
  assert.equal(inRange(null, '2026-01-01', '2026-01-31'), false);
});

// -- Aislamiento multi-tenant ----------------------------------------------
test('respeta el aislamiento por tenant', () => {
  const { campaigns, messages, events } = fixtures();
  const otherTenant = [
    { id: 'z1', tenant_id: 't2', campaign_id: 'cz', status: 'delivered', created_at: '2026-01-10' },
  ];
  const rows = aggregateCampaignMetrics({
    campaigns,
    messages: [...messages, ...otherTenant],
    events,
    tenantId: TENANT,
  });
  assert.ok(rows.every((r) => r.campaignId !== 'cz'));
});

// -- Dashboard de alto nivel (integración) ----------------------------------
test('buildDashboard devuelve campañas, totales y rango aplicado', () => {
  const { campaigns, messages, events } = fixtures();
  const dash = buildDashboard(
    { campaigns, messages, events },
    { tenantId: TENANT, from: '2026-01-01', to: '2026-12-31' },
  );

  assert.equal(dash.campaigns.length, 2);
  assert.equal(dash.totals.sent, 6);
  assert.equal(dash.totals.delivered, 5);
  assert.equal(dash.totals.opened, 3);
  assert.equal(dash.totals.clicked, 1);
  assert.equal(dash.totals.bounced, 1);
  assert.equal(dash.totals.deliveryRate, 0.8333); // 5/6
  assert.ok(dash.range.from.startsWith('2026-01-01'));
  assert.ok(dash.range.to.startsWith('2026-12-31'));
});

test('buildDashboard sin rango deja los extremos en null', () => {
  const { campaigns, messages, events } = fixtures();
  const dash = buildDashboard({ campaigns, messages, events });
  assert.equal(dash.range.from, null);
  assert.equal(dash.range.to, null);
  assert.equal(dash.campaigns.length, 2);
});
