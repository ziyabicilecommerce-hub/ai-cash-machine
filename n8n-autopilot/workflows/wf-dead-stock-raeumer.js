import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Monatlich am 5. um 09:00', parameters: { rule: { interval: [ { field: 'months', monthsInterval: 1, triggerAtDay: 5, triggerAtHour: 9, triggerAtMinute: 0 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'SHOP', value: 'dein-shop-subdomain', type: 'string' },
    { id: 's02', name: 'SHOPIFY_TOKEN', value: 'shpat_HIER_DEIN_TOKEN', type: 'string' },
    { id: 's03', name: 'ANTHROPIC_API_KEY', value: 'sk-ant-HIER_DEIN_KEY', type: 'string' },
    { id: 's04', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's05', name: 'TAGE_OHNE_VERKAUF', value: '90', type: 'string' },
    { id: 's06', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's07', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getProducts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Alle Produkte', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/products.json?limit=250&fields=id,title,variants,created_at"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ products: [] }]
});

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Orders Zeitraum', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: parseInt($('Setup').first().json.TAGE_OHNE_VERKAUF) }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const analyze = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Dead Stock finden', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const products = ($input.all().find(i => i.node === 'Alle Produkte').json.products || []);
const orders = ($input.all().find(i => i.node === 'Orders Zeitraum').json.orders || []).filter(o => !o.cancelled_at);
const verkauft = new Set();
for (const o of orders) {
  for (const li of (o.line_items || [])) {
    verkauft.add(li.product_id);
  }
}
const deadStock = products.filter(p => !verkauft.has(p.id) && (p.variants || []).some(v => parseInt(v.inventory_quantity || 0) > 0));
const liste = deadStock.slice(0, 20).map(p => '- ' + p.title).join(NL);
const prompt = 'Du bist Inventory-Optimierer fuer den Onlineshop "' + setup.SHOP_NAME + '".' + NL + NL +
  deadStock.length + ' Produkte hatten in ' + setup.TAGE_OHNE_VERKAUF + ' Tagen KEINEN einzigen Verkauf, obwohl Lagerbestand vorhanden ist:' + NL +
  liste + NL + NL +
  'Gib konkrete Empfehlungen auf Deutsch:' + NL +
  '1. Sollten diese Produkte abverkauft (Rabatt/Bundle) oder ausgelistet werden?' + NL +
  '2. Für die Top 5: konkrete Rabatt-Strategie (Prozentsatz + Timing)' + NL +
  '3. Bundle-Ideen: welche Dead-Stock-Produkte mit Bestsellern kombinieren?' + NL +
  '4. Cash-Flow-Perspektive: wie viel Kapital ist hier gebunden?' + NL + NL +
  'Antworte als sauberes HTML (h3/p/ul), kein Markdown.';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude Abverkauf-Strategie', parameters: {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [
      { name: 'x-api-key', value: expr("{{ $('Setup').first().json.ANTHROPIC_API_KEY }}") },
      { name: 'anthropic-version', value: '2023-06-01' },
      { name: 'content-type', value: 'application/json' }
    ] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 2500, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const pack = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Report verpacken', parameters: { mode: 'runOnceForEachItem', jsCode: `const blocks = $json.content || [];
const html = (blocks.find(b => b.type === 'text') || {}).text || '';
const setup = $('Setup').first().json;
return { json: {
  betreff: 'Dead-Stock-Report - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">' + html + '</div>'
}};` } },
  output: [{ betreff: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Report an dich', parameters: {
    resource: 'email', operation: 'send',
    fromEmail: expr("{{ $('Setup').first().json.ABSENDER_EMAIL }}"),
    toEmail: expr("{{ $('Setup').first().json.OWNER_EMAIL }}"),
    subject: expr("{{ $json.betreff }}"),
    emailFormat: 'html',
    html: expr("{{ $json.email_html }}"),
    options: { appendAttribution: false }
  }, credentials: { smtp: newCredential('SMTP') } },
  output: [{ success: true }]
});

export default workflow('dead-stock-raeumer', '22 · Dead-Stock-Räumer 🧹💸')
  .add(scheduleTrigger)
  .add(getProducts)
  .add(getOrders)
  .to(analyze)
  .to(claude)
  .to(pack)
  .to(sendMail);
