// Dashboard de métricas — agregación de tasas por campaña.
//
// Las tasas se calculan a partir de los eventos de tracking (`email_event`):
//   - delivered / opened / clicked / bounced / complained
//
// Todas las funciones son puras: reciben los datos ya cargados de la base
// (mensajes y eventos) y devuelven las métricas agregadas. Esto mantiene la
// lógica testeable sin dependencias de red ni de base de datos.

export const EVENT_TYPES = Object.freeze({
  DELIVERED: 'delivered',
  OPENED: 'opened',
  CLICKED: 'clicked',
  BOUNCED: 'bounced',
  COMPLAINED: 'complained',
});

/** Convierte un valor (Date | string | number) a epoch ms, o null si no aplica. */
function toTime(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * ¿`value` cae dentro del rango [from, to]? El rango es inclusivo y ambos
 * extremos son opcionales (undefined/null => sin límite por ese lado).
 */
export function inRange(value, from, to) {
  const t = toTime(value);
  if (t == null) return false;
  const fromT = toTime(from);
  const toT = toTime(to);
  if (fromT != null && t < fromT) return false;
  if (toT != null && t > toT) return false;
  return true;
}

/** Redondea a `decimals` posiciones evitando ruido de coma flotante. */
function round(value, decimals = 4) {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** rate = num/den, con 0 cuando el denominador es 0. */
function rate(num, den) {
  if (!den) return 0;
  return round(num / den);
}

/**
 * Agrega métricas por campaña.
 *
 * @param {object}   input
 * @param {Array}    input.messages  Mensajes (deben tener `campaign_id`).
 * @param {Array}    input.events    email_event (deben tener `message_id`, `type`, `occurred_at`).
 * @param {Array=}   input.campaigns  Campañas opcionales (para nombre / incluir campañas sin eventos).
 * @param {Date|string=} input.from  Inicio del rango de fechas (inclusive).
 * @param {Date|string=} input.to    Fin del rango de fechas (inclusive).
 * @param {string=}  input.tenantId  Si se pasa, filtra por tenant.
 * @returns {Array} Una fila de métricas por campaña.
 */
export function aggregateCampaignMetrics({
  messages = [],
  events = [],
  campaigns = [],
  from,
  to,
  tenantId,
} = {}) {
  const byTenant = (row) => tenantId == null || row.tenant_id === tenantId;

  // Índice mensaje -> campaña, contando "envíos" por campaña dentro del rango.
  const stats = new Map();
  const ensure = (campaignId) => {
    if (!stats.has(campaignId)) {
      stats.set(campaignId, {
        campaignId,
        campaignName: null,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        complained: 0,
        // sets para contar destinatarios únicos (un mensaje = un destinatario)
        _deliveredMsgs: new Set(),
        _openedMsgs: new Set(),
        _clickedMsgs: new Set(),
        _bouncedMsgs: new Set(),
        _complainedMsgs: new Set(),
      });
    }
    return stats.get(campaignId);
  };

  // Campañas explícitas (para incluir las que aún no tienen eventos).
  for (const c of campaigns) {
    if (!byTenant(c)) continue;
    const s = ensure(c.id);
    s.campaignName = c.name ?? s.campaignName;
  }

  // Mensajes de campaña => base de "enviados". Solo cuentan los mensajes que
  // realmente salieron (no los que quedaron en cola o fallaron antes de enviar).
  const messageCampaign = new Map();
  const SENT_STATUSES = new Set(['sent', 'delivered', 'bounced']);
  for (const m of messages) {
    if (m.campaign_id == null) continue; // transaccional, no es de campaña
    if (!byTenant(m)) continue;
    messageCampaign.set(m.id, m.campaign_id);
    const s = ensure(m.campaign_id);
    // Filtro por rango: si el mensaje trae created_at lo respetamos; si no,
    // se cuenta (el filtro fino de fechas se aplica sobre los eventos).
    const passesRange = m.created_at == null ? true : inRange(m.created_at, from, to);
    const isSent = m.status == null ? true : SENT_STATUSES.has(m.status);
    if (passesRange && isSent) s.sent += 1;
  }

  // Eventos => numeradores de las tasas. Se filtran por rango de fechas.
  for (const e of events) {
    if (!byTenant(e)) continue;
    if (!inRange(e.occurred_at, from, to)) continue;
    const campaignId = messageCampaign.get(e.message_id);
    if (campaignId == null) continue; // evento de un mensaje transaccional
    const s = ensure(campaignId);
    switch (e.type) {
      case EVENT_TYPES.DELIVERED:
        s._deliveredMsgs.add(e.message_id);
        break;
      case EVENT_TYPES.OPENED:
        s._openedMsgs.add(e.message_id);
        break;
      case EVENT_TYPES.CLICKED:
        s._clickedMsgs.add(e.message_id);
        break;
      case EVENT_TYPES.BOUNCED:
        s._bouncedMsgs.add(e.message_id);
        break;
      case EVENT_TYPES.COMPLAINED:
        s._complainedMsgs.add(e.message_id);
        break;
      default:
        break;
    }
  }

  const rows = [];
  for (const s of stats.values()) {
    const delivered = s._deliveredMsgs.size;
    const opened = s._openedMsgs.size;
    const clicked = s._clickedMsgs.size;
    const bounced = s._bouncedMsgs.size;
    const complained = s._complainedMsgs.size;
    rows.push({
      campaignId: s.campaignId,
      campaignName: s.campaignName,
      sent: s.sent,
      delivered,
      opened,
      clicked,
      bounced,
      complained,
      // Tasas calculadas a partir de email_event:
      deliveryRate: rate(delivered, s.sent),
      openRate: rate(opened, delivered),
      clickRate: rate(clicked, delivered),
      bounceRate: rate(bounced, s.sent),
    });
  }

  // Orden estable por nombre de campaña / id para salida determinista.
  rows.sort((a, b) => {
    const an = a.campaignName ?? '';
    const bn = b.campaignName ?? '';
    if (an !== bn) return an < bn ? -1 : 1;
    return String(a.campaignId) < String(b.campaignId) ? -1 : 1;
  });

  return rows;
}
