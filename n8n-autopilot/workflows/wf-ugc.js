import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Taeglich 15:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 15, triggerAtMinute: 0 } ] } } },
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
    { id: 's05', name: 'MIN_BESTELLUNGEN', value: '2', type: 'string' },
    { id: 's06', name: 'UGC_BELOHNUNG', value: 'z.B. 20% Gutschein oder Gratis-Produkt', type: 'string' },
    { id: 's07', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's08', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' },
    { id: 's09', name: 'TEST_MODE', value: 'ja', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Bestellungen vor 10 Tagen', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 12 }).startOf('day').toISO()) }}&created_at_max={{ encodeURIComponent($now.minus({ days: 10 }).endOf('day').toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const pick = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fans finden', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const sd = $getWorkflowStaticData('global');
sd.gefragt = sd.gefragt || [];
const setup = $('Setup').first().json;
const minBest = parseInt(setup.MIN_BESTELLUNGEN);
const orders = ($input.first().json.orders || []).filter(o => !o.cancelled_at && o.email && o.customer);
const raus = [];
for (const o of orders) {
  const k = o.customer;
  if (parseInt(k.orders_count || 1) < minBest) continue;
  if (sd.gefragt.includes(k.id)) continue;
  sd.gefragt.push(k.id);
  const artikel = (o.line_items || []).map(li => li.title).slice(0, 2).join(', ');
  const prompt = 'Du schreibst im Namen des Gruenders vom Onlineshop "' + setup.SHOP_NAME + '".' + NL +
    'Dieser Kunde ist ein echter Fan (' + k.orders_count + ' Bestellungen). Letzter Kauf: ' + (artikel || 'diverses') + '.' + NL + NL +
    'Bitte ihn um ein kurzes Foto oder Video (UGC) mit dem Produkt, das der Shop fuer Social Media/Ads nutzen darf.' + NL +
    'Schreibe eine lockere, persoenliche E-Mail auf Deutsch (Du-Form), max 120 Woerter:' + NL +
    '- Vorname: ' + (k.first_name || 'unbekannt (neutral anreden)') + NL +
    '- Ehrliches Kompliment (er kauft immer wieder), dann die Bitte um ein echtes Foto/Video im Alltag' + NL +
    '- Als Dankeschoen: ' + setup.UGC_BELOHNUNG + NL +
    '- Super einfach machen: einfach auf diese Mail antworten und Datei anhaengen' + NL +
    '- Locker, kein Corporate-Ton, schlichtes HTML' + NL +
    'Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}';
  raus.push({ json: { email: o.email, prompt } });
}
if (sd.gefragt.length > 8000) sd.gefragt = sd.gefragt.slice(-8000);
return raus;` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude fragt nach UGC', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 1200, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const parse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Antwort parsen', parameters: { mode: 'runOnceForEachItem', jsCode: `const blocks = $json.content || [];
const text = (blocks.find(b => b.type === 'text') || {}).text || '';
let daten;
const s = text.indexOf('{');
const e = text.lastIndexOf('}');
try { daten = JSON.parse(text.slice(s, e + 1)); } catch (err) { daten = { betreff: 'Kleine Bitte an dich', html: text }; }
const orig = $('Fans finden').item.json;
const setup = $('Setup').first().json;
const empfaenger = setup.TEST_MODE === 'ja' ? setup.OWNER_EMAIL : orig.email;
return { json: {
  empfaenger,
  betreff: (setup.TEST_MODE === 'ja' ? '[TEST] ' : '') + daten.betreff,
  email_html: daten.html
}};` } },
  output: [{ empfaenger: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'UGC-Anfrage senden', parameters: {
    resource: 'email', operation: 'send',
    fromEmail: expr("{{ $('Setup').first().json.ABSENDER_EMAIL }}"),
    toEmail: expr("{{ $json.empfaenger }}"),
    subject: expr("{{ $json.betreff }}"),
    emailFormat: 'html',
    html: expr("{{ $json.email_html }}"),
    options: { appendAttribution: false }
  }, credentials: { smtp: newCredential('SMTP') } },
  output: [{ success: true }]
});

export default workflow('ugc-anfrage', '32 · UGC-Anfrage-Automat 📸🎬')
  .add(scheduleTrigger)
  .to(setup)
  .to(getOrders)
  .to(pick)
  .to(claude)
  .to(parse)
  .to(sendMail);
