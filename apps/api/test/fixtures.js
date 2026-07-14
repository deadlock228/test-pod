/** Fixtures compartidos para los tests de historial de mensajes. */

export const TENANT_A = 'tenant-a';
export const TENANT_B = 'tenant-b';
export const CAMPAIGN_1 = 'camp-1';
export const CAMPAIGN_2 = 'camp-2';

export function buildFixtures() {
  const messages = [
    {
      id: 'm1',
      tenant_id: TENANT_A,
      campaign_id: CAMPAIGN_1,
      contact_id: 'c1',
      to_email: 'ana@example.com',
      subject: 'Newsletter Enero',
      status: 'delivered',
      provider_message_id: 'prov-1',
      created_at: '2026-01-01T10:00:00.000Z',
    },
    {
      id: 'm2',
      tenant_id: TENANT_A,
      campaign_id: CAMPAIGN_1,
      contact_id: 'c2',
      to_email: 'beto@example.com',
      subject: 'Newsletter Enero',
      status: 'bounced',
      provider_message_id: 'prov-2',
      created_at: '2026-01-02T10:00:00.000Z',
    },
    {
      id: 'm3',
      tenant_id: TENANT_A,
      campaign_id: CAMPAIGN_2,
      contact_id: 'c3',
      to_email: 'caro@example.com',
      subject: 'Promo Febrero',
      status: 'delivered',
      provider_message_id: 'prov-3',
      created_at: '2026-02-01T10:00:00.000Z',
    },
    {
      id: 'm4',
      tenant_id: TENANT_A,
      campaign_id: null,
      contact_id: 'c4',
      to_email: 'dani@example.com',
      subject: 'Confirmación de compra',
      status: 'sent',
      provider_message_id: 'prov-4',
      created_at: '2026-02-05T10:00:00.000Z',
    },
    {
      id: 'm5',
      tenant_id: TENANT_A,
      campaign_id: null,
      contact_id: 'c5',
      to_email: 'eva@example.com',
      subject: 'Recuperar contraseña',
      status: 'queued',
      provider_message_id: null,
      created_at: '2026-02-10T10:00:00.000Z',
    },
    // Mensaje de OTRO tenant: nunca debe aparecer para TENANT_A.
    {
      id: 'x1',
      tenant_id: TENANT_B,
      campaign_id: CAMPAIGN_1,
      contact_id: 'z1',
      to_email: 'intruso@other.com',
      subject: 'No visible',
      status: 'delivered',
      provider_message_id: 'prov-x1',
      created_at: '2026-02-11T10:00:00.000Z',
    },
  ];

  const events = [
    {
      id: 'e1',
      tenant_id: TENANT_A,
      message_id: 'm1',
      type: 'delivered',
      metadata: {},
      occurred_at: '2026-01-01T10:01:00.000Z',
    },
    {
      id: 'e2',
      tenant_id: TENANT_A,
      message_id: 'm1',
      type: 'opened',
      metadata: { userAgent: 'Mail' },
      occurred_at: '2026-01-01T11:00:00.000Z',
    },
    {
      id: 'e3',
      tenant_id: TENANT_A,
      message_id: 'm1',
      type: 'clicked',
      metadata: { url: 'https://example.com' },
      occurred_at: '2026-01-01T12:00:00.000Z',
    },
    {
      id: 'e4',
      tenant_id: TENANT_A,
      message_id: 'm2',
      type: 'bounced',
      metadata: { reason: 'mailbox full' },
      occurred_at: '2026-01-02T10:05:00.000Z',
    },
    // Evento de otro tenant sobre un id que no le corresponde.
    {
      id: 'ex1',
      tenant_id: TENANT_B,
      message_id: 'x1',
      type: 'delivered',
      metadata: {},
      occurred_at: '2026-02-11T10:05:00.000Z',
    },
  ];

  return { messages, events };
}
