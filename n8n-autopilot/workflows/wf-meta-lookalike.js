import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Montags 06:30', parameters: { rule: { interval: [ { field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 6, triggerAtMinute: 30 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'SHOP', value: 'dein-shop-subdomain', type: 'string' },
    { id: 's02', name: 'SHOPIFY_TOKEN', value: 'shpat_HIER_DEIN_TOKEN', type: 'string' },
    { id: 's03', name: 'META_ACCESS_TOKEN', value: 'HIER_TOKEN', type: 'string' },
    { id: 's04', name: 'META_AUDIENCE_ID', value: 'HIER_CUSTOM_AUDIENCE_ID', type: 'string' },
    { id: 's05', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's06', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getCustomers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Kunden abrufen', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/customers.json?limit=250&fields=email"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ customers: [] }]
});

const hash = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Emails hashen (SHA-256)', parameters: { mode: 'runOnceForAllItems', jsCode: `const crypto = require('crypto');
const customers = $input.first().json.customers || [];
const hashed = customers
  .filter(c => c.email)
  .map(c => {
    const email = c.email.trim().toLowerCase();
    return crypto.createHash('sha256').update(email).digest('hex');
  });
return [{ json: { hashed_emails: hashed, count: hashed.length } }];` } },
  output: [{ hashed_emails: [] }]
});

const send = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'An Meta Custom Audience', parameters: {
    method: 'POST',
    url: expr("https://graph.instagram.com/v21.0/{{ $('Setup').first().json.META_AUDIENCE_ID }}/users"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ payload: { schema: ['EMAIL_SHA256'], hashed_emails: $json.hashed_emails }, access_token: $('Setup').first().json.META_ACCESS_TOKEN }) }}")
  } },
  output: [{ success: true }]
});

const log = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Info sammeln', parameters: { mode: 'runOnceForEachItem', jsCode: `const setup = $('Setup').first().json;
const daten = $('Emails hashen (SHA-256)').first().json;
const msg = 'Meta Lookalike Futter: ' + daten.count + ' Kunden-Emails (SHA-256) zu Custom Audience gesendet. Lookalike-Audience in 24h bereit.';
return [{ json: { nachricht: msg } }];` } },
  output: [{ nachricht: '' }]
});

export default workflow('meta-lookalike-futter', '45 · Meta Lookalike-Futter 🎯👥')
  .add(scheduleTrigger)
  .to(setup)
  .to(getCustomers)
  .to(hash)
  .to(send)
  .to(log);
