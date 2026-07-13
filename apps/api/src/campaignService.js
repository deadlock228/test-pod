/**
 * Servicio de campañas (B11 — "Campañas a listas").
 *
 * Responsabilidades:
 *  - Crear una campaña asociando una plantilla y una lista.
 *  - Enviar la campaña: encolar un `message` por cada contacto suscripto de la
 *    lista, excluyendo a los dados de baja.
 *  - Reflejar el estado de la campaña: draft -> sending -> sent (o failed).
 */

export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
});

/** Render mínimo de variables {{attr}} usando los atributos del contacto. */
function render(template, attributes = {}) {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = attributes[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export class CampaignService {
  constructor({ store, queue }) {
    if (!store) throw new Error('store requerido');
    if (!queue) throw new Error('queue requerido');
    this.store = store;
    this.queue = queue;
  }

  /**
   * Crea una campaña en estado `draft` asociando plantilla y lista del mismo tenant.
   */
  createCampaign({ tenantId, name, templateId, listId }) {
    if (!tenantId) throw new Error('tenantId requerido');
    if (!name) throw new Error('name requerido');

    const template = this.store.templates.get(templateId);
    if (!template || template.tenantId !== tenantId) {
      throw new Error('plantilla inexistente para el tenant');
    }

    const list = this.store.lists.get(listId);
    if (!list || list.tenantId !== tenantId) {
      throw new Error('lista inexistente para el tenant');
    }

    const id = randomId();
    const campaign = {
      id,
      tenantId,
      name,
      templateId,
      listId,
      status: CAMPAIGN_STATUS.DRAFT,
      scheduledAt: null,
      sentAt: null,
    };
    this.store.campaigns.set(id, campaign);
    return campaign;
  }

  /**
   * Envía la campaña: transiciona a `sending`, encola un message por cada
   * contacto suscripto de la lista y finaliza en `sent`.
   * Devuelve un resumen con los mensajes encolados y los excluidos.
   */
  sendCampaign(campaignId, tenantId) {
    const campaign = this.store.campaigns.get(campaignId);
    if (!campaign || campaign.tenantId !== tenantId) {
      throw new Error('campaña inexistente para el tenant');
    }
    if (
      campaign.status !== CAMPAIGN_STATUS.DRAFT &&
      campaign.status !== CAMPAIGN_STATUS.SCHEDULED
    ) {
      throw new Error(`no se puede enviar una campaña en estado ${campaign.status}`);
    }

    const template = this.store.templates.get(campaign.templateId);
    if (!template) {
      campaign.status = CAMPAIGN_STATUS.FAILED;
      throw new Error('plantilla inexistente al enviar');
    }

    // Marca el inicio del envío.
    campaign.status = CAMPAIGN_STATUS.SENDING;

    const contacts = this.store.contactsInList(campaign.listId, tenantId);
    const enqueued = [];
    const skipped = [];

    for (const contact of contacts) {
      // Se excluyen los contactos dados de baja (no suscriptos).
      if (!contact.subscribed) {
        skipped.push(contact.id);
        continue;
      }

      const message = this.store.createMessage({
        tenantId,
        campaignId: campaign.id,
        contactId: contact.id,
        toEmail: contact.email,
        templateId: template.id,
        subject: render(template.subject, contact.attributes),
        status: 'queued',
      });

      this.queue.enqueue('send-email', {
        messageId: message.id,
        tenantId,
        campaignId: campaign.id,
      });

      enqueued.push(message);
    }

    campaign.status = CAMPAIGN_STATUS.SENT;
    campaign.sentAt = new Date().toISOString();

    return {
      campaign,
      enqueuedCount: enqueued.length,
      skippedCount: skipped.length,
      messages: enqueued,
    };
  }
}

function randomId() {
  // Import perezoso para mantener el módulo puro/testeable.
  return globalThis.crypto.randomUUID();
}
