import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Täglich 11:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 11, triggerAtMinute: 0 } ] } } },
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
    { id: 's05', name: 'SCHLAF_TAGE', value: '60', type: 'string' },
    { id: 's06', name: 'RABATT_PROZENT', value: '15', type: 'string' },
    { id: 's07', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's08', name: 'TEST_MODE', value: 'ja', type: 'string' },
    { id: 's09', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getCustomers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Kunden mit letzter Bestellung', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/customers.json?limit=250&fields=id,email,first_name,orders_count,last_order_id,updated_at"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ customers: [] }]
});

const pick = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Schläfer finden', parameters: { mode: 'runOnceForAllItems', jsCode: `const sd = $getWorkflowStaticData('global');
sd.geweckt = sd.geweckt || [];
const setup = $('Setup').first().json;
const schlafTage = parseInt(setup.SCHLAF_TAGE);
const grenze = new Date();
grenze.setDate(grenze.getDate() - schlafTage);
const customers = ($input.first().json.customers || []).filter(c => c.email && parseInt(c.orders_count || 0) >= 1);
const raus = [];
for (const c of customers) {
  const letzteAktivitaet = new Date(c.updated_at);
  if (letzteAktivitaet > grenze) continue;
  const key = c.id + '-' + grenze.getMonth();
  if (sd.geweckt.includes(key)) continue;
  sd.geweckt.push(key);
  raus.push({ json: { email: c.email, name: c.first_name || 'Kunde' } });
}
if (sd.geweckt.length > 5000) sd.geweckt = sd.geweckt.slice(-5000);
return raus.slice(0, 20);` } },
  output: [{ email: '' }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Weck-Mail-Prompt', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const k = $json;
const prompt = 'Du schreibst im Namen des Gruenders vom Onlineshop "' + setup.SHOP_NAME + '".' + NL +
  'Kunde ' + k.name + ' war seit über ' + setup.SCHLAF_TAGE + ' Tagen inaktiv ("Schläfer").' + NL + NL +
  'Schreibe eine freundliche "Wir vermissen dich"-Email auf Deutsch (Du-Form), max 100 Wörter:' + NL +
  '- Locker, nicht aufdringlich ansprechen ("ist eine Weile her")' + NL +
  '- Neugier wecken: was hat sich seitdem im Shop getan?' + NL +
  '- Anreiz: ' + setup.RABATT_PROZENT + '% Willkommens-zurück-Rabatt' + NL +
  '- Klarer Call-to-Action zurück zum Shop' + NL + NL +
  'Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}';
return { json: { email: k.email, prompt } };` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude weckt Schläfer', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 1000, messages: [{ role: 'user', content: $json.prompt }] }) }}")
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
try { daten = JSON.parse(text.slice(s, e + 1)); } catch (err) { daten = { betreff: 'Wir vermissen dich!', html: text }; }
const orig = $('Weck-Mail-Prompt').item.json;
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
  config: { name: 'Weck-Mail senden', parameters: {
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

export default workflow('schlaefer-wecker', '26 · Schläfer-Wecker 💤⏰')
  .add(scheduleTrigger)
  .to(setup)
  .to(getCustomers)
  .to(pick)
  .to(build)
  .to(claude)
  .to(parse)
  .to(sendMail);
