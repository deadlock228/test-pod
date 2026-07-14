// Orquestación del dashboard de métricas.
//
// Toma los datos crudos (mensajes + email_event) y una selección de filtros
// (tenant + rango de fechas) y produce el payload del dashboard: una fila por
// campaña más los totales agregados del período.

import { aggregateCampaignMetrics } from './metrics.js';

/** Normaliza un extremo de rango a Date (o null si no viene / es inválido). */
function parseDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Construye el dashboard de métricas por campaña.
 *
 * @param {object} data                 { messages, events, campaigns }
 * @param {object} [filters]            { tenantId, from, to }
 * @returns {{ range: {from: (string|null), to: (string|null)}, campaigns: Array, totals: object }}
 */
export function buildDashboard(data = {}, filters = {}) {
  const { messages = [], events = [], campaigns = [] } = data;
  const from = parseDate(filters.from);
  const to = parseDate(filters.to);
  const tenantId = filters.tenantId;

  const rows = aggregateCampaignMetrics({
    messages,
    events,
    campaigns,
    from,
    to,
    tenantId,
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.sent += r.sent;
      acc.delivered += r.delivered;
      acc.opened += r.opened;
      acc.clicked += r.clicked;
      acc.bounced += r.bounced;
      acc.complained += r.complained;
      return acc;
    },
    { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 },
  );

  const ratio = (num, den) => (den ? Math.round((num / den) * 1e4) / 1e4 : 0);

  return {
    range: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
    campaigns: rows,
    totals: {
      ...totals,
      deliveryRate: ratio(totals.delivered, totals.sent),
      openRate: ratio(totals.opened, totals.delivered),
      clickRate: ratio(totals.clicked, totals.delivered),
      bounceRate: ratio(totals.bounced, totals.sent),
    },
  };
}
