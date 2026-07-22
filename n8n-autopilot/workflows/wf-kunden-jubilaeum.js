import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Täglich 10:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 10, triggerAtMinute: 0 } ] } } },
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
    { id: 's05', name: 'JUBILAEUM_RABATT', value: '15', type: 'string' },
    { id: 's06', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's07', name: 'TEST_MODE', value: 'ja', type: 'string' },
    { id: 's08', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getCustomers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Kunden abrufen', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/customers.json?limit=250&fields=id,email,first_name,created_at"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ customers: [] }]
});

const check = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Jubiläen finden', parameters: { mode: 'runOnceForAllItems', jsCode: `const sd = $getWorkflowStaticData('global');
sd.gefeiert = sd.gefeiert || [];
const customers = $input.first().json.customers || [];
const heute = new Date();
const raus = [];
for (const c of customers) {
  if (!c.created_at) continue;
  const erstellt = new Date(c.created_at);
  const jahre = heute.getFullYear() - erstellt.getFullYear();
  const istJahrestag = erstellt.getMonth() === heute.getMonth() && erstellt.getDate() === heute.getDate();
  const key = c.id + '-' + heute.getFullYear();
  if (jahre >= 1 && istJahrestag && !sd.gefeiert.includes(key)) {
    sd.gefeiert.push(key);
    raus.push({ json: { email: c.email, name: c.first_name || 'Kunde', jahre } });
  }
}
if (sd.gefeiert.length > 5000) sd.gefeiert = sd.gefeiert.slice(-5000);
return raus;` } },
  output: [{ email: '' }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Jubiläums-Mail-Prompt', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const k = $json;
const prompt = 'Du schreibst im Namen des Gruenders vom Onlineshop "' + setup.SHOP_NAME + '".' + NL +
  'Kunde ' + k.name + ' ist seit genau ' + k.jahre + ' Jahr(en) Kunde bei uns (heute Jahrestag!).' + NL + NL +
  'Schreibe eine warme, persönliche Jubiläums-Email auf Deutsch (Du-Form), max 100 Wörter:' + NL +
  '- Herzlichen Glückwunsch zum "Kunden-Jubiläum"' + NL +
  '- Dankbarkeit für die Treue ausdrücken' + NL +
  '- Geschenk: ' + setup.JUBILAEUM_RABATT + '% Rabatt-Code als Dankeschön' + NL +
  '- Locker, warm, kein Corporate-Ton' + NL + NL +
  'Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}';
return { json: { email: k.email, prompt } };` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude schreibt Jubiläums-Mail', parameters: {
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
try { daten = JSON.parse(text.slice(s, e + 1)); } catch (err) { daten = { betreff: 'Alles Gute zum Jubiläum!', html: text }; }
const orig = $('Jubiläums-Mail-Prompt').item.json;
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
  config: { name: 'Jubiläums-Mail senden', parameters: {
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

export default workflow('kunden-jubilaeum', '23 · Kunden-Jubiläum 🎂🎁')
  .add(scheduleTrigger)
  .to(setup)
  .to(getCustomers)
  .to(check)
  .to(build)
  .to(claude)
  .to(parse)
  .to(sendMail);
