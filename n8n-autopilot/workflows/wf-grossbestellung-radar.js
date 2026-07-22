import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Jede Stunde', parameters: { rule: { interval: [ { field: 'hours', hoursInterval: 1 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'SHOP', value: 'dein-shop-subdomain', type: 'string' },
    { id: 's02', name: 'SHOPIFY_TOKEN', value: 'shpat_HIER_DEIN_TOKEN', type: 'string' },
    { id: 's03', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's04', name: 'MIN_WERT_EUR', value: '500', type: 'string' },
    { id: 's05', name: 'MIN_ARTIKEL', value: '10', type: 'string' },
    { id: 's06', name: 'TELEGRAM_TOKEN', value: 'HIER_TOKEN', type: 'string' },
    { id: 's07', name: 'TELEGRAM_CHAT', value: 'HIER_CHAT', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Neue Orders letzte Stunde', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=50&created_at_min={{ encodeURIComponent($now.minus({ hours: 1 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const filter = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Große Orders filtern', parameters: { mode: 'runOnceForAllItems', jsCode: `const setup = $('Setup').first().json;
const minWert = parseFloat(setup.MIN_WERT_EUR);
const minArtikel = parseInt(setup.MIN_ARTIKEL);
const orders = ($input.first().json.orders || []).filter(o => !o.cancelled_at);
const gross = orders.filter(o =>
  parseFloat(o.total_price || 0) >= minWert ||
  (o.line_items || []).length >= minArtikel
);
if (gross.length === 0) return [];
return gross.slice(0, 5).map(o => ({
  json: {
    id: o.id,
    email: o.email || 'unbekannt',
    wert: parseFloat(o.total_price || 0),
    artikel: (o.line_items || []).length,
    produkte: (o.line_items || []).map(li => li.title).join(', ')
  }
}));` } },
  output: [{ email: '' }]
});

const telegram = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Telegram Message', parameters: { mode: 'runOnceForEachItem', jsCode: `const setup = $('Setup').first().json;
const o = $json;
const msg = '🎉 GROSSBESTELLUNG! ' + setup.SHOP_NAME + NL +
  '💰 ' + o.wert.toFixed(0) + ' EUR | ' + o.artikel + ' Artikel' + NL +
  '📧 ' + o.email + NL +
  '📦 ' + o.produkte.substring(0, 50) + (o.produkte.length > 50 ? '...' : '');
return { json: { telegram_text: msg } };` } },
  output: [{ telegram_text: '' }]
});

const send = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Alert senden', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT, text: $json.telegram_text }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('grossbestellung-radar', '46 · Großbestellung-Radar 📊🎯')
  .add(scheduleTrigger)
  .to(setup)
  .to(getOrders)
  .to(filter)
  .to(telegram)
  .to(send);
