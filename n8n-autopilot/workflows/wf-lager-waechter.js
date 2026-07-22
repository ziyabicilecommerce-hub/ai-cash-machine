import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Täglich 07:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 7, triggerAtMinute: 0 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'SHOP', value: 'dein-shop-subdomain', type: 'string' },
    { id: 's02', name: 'SHOPIFY_TOKEN', value: 'shpat_HIER_DEIN_TOKEN', type: 'string' },
    { id: 's03', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's04', name: 'MIN_BESTAND', value: '5', type: 'string' },
    { id: 's05', name: 'TELEGRAM_TOKEN', value: 'HIER_TOKEN', type: 'string' },
    { id: 's06', name: 'TELEGRAM_CHAT', value: 'HIER_CHAT', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getInventory = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Lagerbestand abrufen', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/products.json?limit=250&fields=id,title,variants"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ products: [] }]
});

const check = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Niedrigen Bestand finden', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const minBestand = parseInt(setup.MIN_BESTAND);
const products = $input.first().json.products || [];
const knapp = [];
for (const p of products) {
  for (const v of (p.variants || [])) {
    const menge = parseInt(v.inventory_quantity || 0);
    if (menge > 0 && menge <= minBestand) {
      knapp.push({ titel: p.title, variante: v.title, menge });
    }
  }
}
if (knapp.length === 0) return [];
const liste = knapp.slice(0, 15).map(k => '- ' + k.titel + (k.variante !== 'Default Title' ? ' (' + k.variante + ')' : '') + ': nur noch ' + k.menge + ' Stück').join(NL);
const msg = '📦 LAGER-WÄCHTER: ' + knapp.length + ' Produkte knapp bei ' + setup.SHOP_NAME + '!' + NL + NL + liste;
return [{ json: { nachricht: msg } }];` } },
  output: [{ nachricht: '' }]
});

const telegram = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Alert senden', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT, text: $json.nachricht }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('lager-waechter', '20 · Lager-Wächter 📦🚨')
  .add(scheduleTrigger)
  .to(setup)
  .to(getInventory)
  .to(check)
  .to(telegram);
