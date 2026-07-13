import { randomUUID } from 'node:crypto';

/**
 * Store en memoria, multi-tenant, que modela las entidades necesarias para
 * campañas (contact, list, list_contact, template, campaign, message).
 *
 * No pretende reemplazar a PostgreSQL: aísla la lógica de dominio de la
 * persistencia real para poder testearla sin infraestructura. Un repositorio
 * sobre PG implementaría la misma interfaz.
 */
export class InMemoryStore {
  constructor() {
    this.contacts = new Map();
    this.lists = new Map();
    this.listContacts = []; // { listId, contactId }
    this.templates = new Map();
    this.campaigns = new Map();
    this.messages = new Map();
  }

  createContact({ tenantId, email, name = '', attributes = {}, subscribed = true }) {
    if (!tenantId) throw new Error('tenantId requerido');
    if (!email) throw new Error('email requerido');
    const id = randomUUID();
    const contact = {
      id,
      tenantId,
      email,
      name,
      attributes,
      subscribed,
      unsubscribedAt: subscribed ? null : new Date().toISOString(),
    };
    this.contacts.set(id, contact);
    return contact;
  }

  unsubscribeContact(contactId) {
    const contact = this.contacts.get(contactId);
    if (!contact) throw new Error('contacto inexistente');
    contact.subscribed = false;
    contact.unsubscribedAt = new Date().toISOString();
    return contact;
  }

  createList({ tenantId, name }) {
    if (!tenantId) throw new Error('tenantId requerido');
    const id = randomUUID();
    const list = { id, tenantId, name };
    this.lists.set(id, list);
    return list;
  }

  addContactToList(listId, contactId) {
    const already = this.listContacts.some(
      (lc) => lc.listId === listId && lc.contactId === contactId,
    );
    if (!already) this.listContacts.push({ listId, contactId });
  }

  /** Contactos pertenecientes a una lista, respetando el tenant. */
  contactsInList(listId, tenantId) {
    return this.listContacts
      .filter((lc) => lc.listId === listId)
      .map((lc) => this.contacts.get(lc.contactId))
      .filter((c) => c && c.tenantId === tenantId);
  }

  createTemplate({ tenantId, name, subject = '', bodyHtml = '', bodyText = '' }) {
    if (!tenantId) throw new Error('tenantId requerido');
    const id = randomUUID();
    const template = { id, tenantId, name, subject, bodyHtml, bodyText };
    this.templates.set(id, template);
    return template;
  }

  createMessage(message) {
    const id = randomUUID();
    const record = { id, status: 'queued', ...message };
    this.messages.set(id, record);
    return record;
  }

  messagesByCampaign(campaignId) {
    return [...this.messages.values()].filter((m) => m.campaignId === campaignId);
  }
}
