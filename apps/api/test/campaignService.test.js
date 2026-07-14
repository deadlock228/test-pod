import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryStore } from '../src/store.js';
import { InMemoryQueue } from '../src/queue.js';
import { CampaignService, CAMPAIGN_STATUS } from '../src/campaignService.js';

const TENANT = 'tenant-1';

function setup() {
  const store = new InMemoryStore();
  const queue = new InMemoryQueue();
  const service = new CampaignService({ store, queue });

  const template = store.createTemplate({
    tenantId: TENANT,
    name: 'Newsletter',
    subject: 'Hola {{name}}',
    bodyHtml: '<p>Hola {{name}}</p>',
  });
  const list = store.createList({ tenantId: TENANT, name: 'Suscriptores' });

  return { store, queue, service, template, list };
}

test('AC1: se crea una campaña asociando plantilla y lista', () => {
  const { service, template, list } = setup();

  const campaign = service.createCampaign({
    tenantId: TENANT,
    name: 'Promo Julio',
    templateId: template.id,
    listId: list.id,
  });

  assert.equal(campaign.templateId, template.id);
  assert.equal(campaign.listId, list.id);
  assert.equal(campaign.tenantId, TENANT);
  assert.equal(campaign.status, CAMPAIGN_STATUS.DRAFT);
});

test('AC1: no se puede crear campaña con plantilla o lista de otro tenant / inexistente', () => {
  const { service, store, list } = setup();

  const otherTemplate = store.createTemplate({ tenantId: 'tenant-2', name: 'X' });

  assert.throws(
    () =>
      service.createCampaign({
        tenantId: TENANT,
        name: 'Bad',
        templateId: otherTemplate.id,
        listId: list.id,
      }),
    /plantilla inexistente/,
  );

  assert.throws(
    () =>
      service.createCampaign({
        tenantId: TENANT,
        name: 'Bad',
        templateId: store.createTemplate({ tenantId: TENANT, name: 'ok' }).id,
        listId: 'no-existe',
      }),
    /lista inexistente/,
  );
});

test('AC2: al enviar se encola un message por cada contacto suscripto', () => {
  const { service, store, queue, template, list } = setup();

  const c1 = store.createContact({ tenantId: TENANT, email: 'a@x.com', attributes: { name: 'Ana' } });
  const c2 = store.createContact({ tenantId: TENANT, email: 'b@x.com', attributes: { name: 'Beto' } });
  store.addContactToList(list.id, c1.id);
  store.addContactToList(list.id, c2.id);

  const campaign = service.createCampaign({
    tenantId: TENANT,
    name: 'Promo',
    templateId: template.id,
    listId: list.id,
  });

  const result = service.sendCampaign(campaign.id, TENANT);

  assert.equal(result.enqueuedCount, 2);
  assert.equal(queue.size, 2);
  assert.equal(store.messagesByCampaign(campaign.id).length, 2);

  // Un job por contacto, cada uno referenciando su message.
  const messageIds = result.messages.map((m) => m.id).sort();
  const jobMessageIds = queue.jobs.map((j) => j.payload.messageId).sort();
  assert.deepEqual(jobMessageIds, messageIds);

  // El subject se renderiza con los atributos del contacto.
  const subjects = result.messages.map((m) => m.subject).sort();
  assert.deepEqual(subjects, ['Hola Ana', 'Hola Beto']);

  // Cada message referencia al contacto y a la campaña.
  for (const m of result.messages) {
    assert.equal(m.campaignId, campaign.id);
    assert.equal(m.status, 'queued');
    assert.ok(m.contactId);
  }
});

test('AC3: el estado de la campaña refleja draft/sending/sent', () => {
  const { service, store, template, list } = setup();

  const contact = store.createContact({ tenantId: TENANT, email: 'a@x.com' });
  store.addContactToList(list.id, contact.id);

  const campaign = service.createCampaign({
    tenantId: TENANT,
    name: 'Promo',
    templateId: template.id,
    listId: list.id,
  });

  // draft al crearse
  assert.equal(campaign.status, CAMPAIGN_STATUS.DRAFT);

  const result = service.sendCampaign(campaign.id, TENANT);

  // sent al finalizar el envío
  assert.equal(result.campaign.status, CAMPAIGN_STATUS.SENT);
  assert.ok(result.campaign.sentAt);

  // no se puede reenviar una campaña ya enviada
  assert.throws(() => service.sendCampaign(campaign.id, TENANT), /no se puede enviar/);
});

test('AC3: sending es un estado intermedio observable durante el envío', () => {
  const { service, store, queue, template, list } = setup();

  const c1 = store.createContact({ tenantId: TENANT, email: 'a@x.com' });
  store.addContactToList(list.id, c1.id);

  const campaign = service.createCampaign({
    tenantId: TENANT,
    name: 'Promo',
    templateId: template.id,
    listId: list.id,
  });

  // Interceptamos el encolado para observar el estado mientras se envía.
  const originalEnqueue = queue.enqueue.bind(queue);
  let statusDuringSend = null;
  queue.enqueue = (name, payload) => {
    statusDuringSend = store.campaigns.get(campaign.id).status;
    return originalEnqueue(name, payload);
  };

  service.sendCampaign(campaign.id, TENANT);

  assert.equal(statusDuringSend, CAMPAIGN_STATUS.SENDING);
});

test('AC4: los contactos dados de baja se excluyen del envío', () => {
  const { service, store, queue, template, list } = setup();

  const activo = store.createContact({ tenantId: TENANT, email: 'ok@x.com' });
  const baja = store.createContact({ tenantId: TENANT, email: 'baja@x.com', subscribed: false });
  const desuscripto = store.createContact({ tenantId: TENANT, email: 'off@x.com' });
  store.unsubscribeContact(desuscripto.id);

  store.addContactToList(list.id, activo.id);
  store.addContactToList(list.id, baja.id);
  store.addContactToList(list.id, desuscripto.id);

  const campaign = service.createCampaign({
    tenantId: TENANT,
    name: 'Promo',
    templateId: template.id,
    listId: list.id,
  });

  const result = service.sendCampaign(campaign.id, TENANT);

  assert.equal(result.enqueuedCount, 1);
  assert.equal(result.skippedCount, 2);
  assert.equal(queue.size, 1);

  const [message] = result.messages;
  assert.equal(message.toEmail, 'ok@x.com');
});
