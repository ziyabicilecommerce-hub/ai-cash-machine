import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: '15. jeden Monats um 09:00', parameters: { rule: { interval: [ { field: 'months', monthsInterval: 1, triggerAtDay: 15, triggerAtHour: 9, triggerAtMinute: 0 } ] } } },
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
    { id: 's05', name: 'SHOP_NISCHE', value: 'z.B. Fitness', type: 'string' },
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
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/products.json?limit=250&fields=id,title,product_type"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ products: [] }]
});

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Orders 60 Tage', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 60 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const analyze = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Lücken identifizieren', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const products = ($input.all().find(i => i.node === 'Alle Produkte').json.products || []);
const orders = ($input.all().find(i => i.node === 'Orders 60 Tage').json.orders || []).filter(o => !o.cancelled_at);
const kategorien = new Set(products.map(p => p.product_type || 'uncategorized'));
const sold = new Set();
for (const o of orders) {
  for (const li of (o.line_items || [])) {
    sold.add(li.product_type || 'uncategorized');
  }
}
const unverkauft = Array.from(kategorien).filter(k => !sold.has(k));
const top_kategorien = Array.from(sold).slice(0, 5).join(', ');
const prompt = 'Du bist Product Manager fuer den Onlineshop "' + setup.SHOP_NAME + '" (Nische: ' + setup.SHOP_NISCHE + ').' + NL + NL +
  'BESTAND: ' + products.length + ' Produkte in ' + kategorien.size + ' Kategorien' + NL +
  'VERKAUFT (60d): ' + sold.size + ' Kategorien: ' + top_kategorien + NL +
  'NICHT VERKAUFT: ' + unverkauft.join(', ') + NL + NL +
  'Analysiere auf Deutsch:' + NL +
  '1. Warum verkaufen sich die TOP-Kategorien? Was ist ihr Erfolgs-Geheimnis?' + NL +
  '2. Die 5 wichtigsten NEUEN Produkte zum Sourcing (konkrete Beispiele mit SKU-Empfehlungen)' + NL +
  '3. Bundle-Ideen: Welche neuen + bestehenden Produkte passen zusammen?' + NL +
  '4. Trend-Chancen: Was kaufen diese Kunden noch (aber nicht bei dir)?' + NL +
  '5. Sourcing-Strategie: Dropshipper, Großhandel, Private Label?' + NL + NL +
  'Antworte als sauberes HTML (h3/p/ul), kein Markdown.';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude analysiert Lücken', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 3500, messages: [{ role: 'user', content: $json.prompt }] }) }}")
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
  betreff: 'Sortiments-Lücken-Analyse - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">' + html + '</div>'
}};` } },
  output: [{ betreff: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Analyse an dich', parameters: {
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

export default workflow('sortiments-lucken-finder', '50 · Sortiments-Lücken-Finder 🔍📦')
  .add(scheduleTrigger)
  .add(getProducts)
  .add(getOrders)
  .to(analyze)
  .to(claude)
  .to(pack)
  .to(sendMail);
