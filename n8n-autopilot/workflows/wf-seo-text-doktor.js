import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Wöchentlich Mittwoch 09:00', parameters: { rule: { interval: [ { field: 'weeks', weeksInterval: 1, triggerAtDay: [3], triggerAtHour: 9, triggerAtMinute: 0 } ] } } },
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
    { id: 's05', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's06', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getProducts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Produkte mit kurzer Beschreibung', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/products.json?limit=50&fields=id,title,body_html,tags"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ products: [] }]
});

const filter = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Schwache Texte finden', parameters: { mode: 'runOnceForAllItems', jsCode: `const products = $input.first().json.products || [];
const schwach = products.filter(p => {
  const text = (p.body_html || '').replace(/<[^>]*>/g, '');
  return text.length < 200;
}).slice(0, 5);
return schwach.map(p => ({ json: { id: p.id, titel: p.title, aktuellerText: (p.body_html || '').replace(/<[^>]*>/g, '').substring(0, 300) } }));` } },
  output: [{ titel: '' }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'SEO-Prompt bauen', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const p = $json;
const prompt = 'Du bist SEO-Copywriter für E-Commerce-Produktseiten.' + NL + NL +
  'Produkt: "' + p.titel + '"' + NL +
  'Aktuelle Beschreibung (zu kurz/schwach): "' + (p.aktuellerText || 'keine') + '"' + NL + NL +
  'Schreibe auf Deutsch eine neue, SEO-optimierte Produktbeschreibung:' + NL +
  '1. 150-250 Wörter, natürlich lesbar (kein Keyword-Stuffing)' + NL +
  '2. Enthält relevante Suchbegriffe, die Kunden nutzen würden' + NL +
  '3. Beantwortet: Was ist es, für wen, welcher Nutzen, warum kaufen' + NL +
  '4. Verkaufsfördernd, aber ehrlich' + NL + NL +
  'Antworte NUR mit validem JSON: {"titel": "' + p.titel.replace(/"/g, "'") + '", "seo_text": "..."}';
return { json: { id: p.id, titel: p.titel, prompt } };` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude schreibt SEO-Text', parameters: {
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
  config: { name: 'Texte sammeln', parameters: { mode: 'runOnceForEachItem', jsCode: `const blocks = $json.content || [];
const text = (blocks.find(b => b.type === 'text') || {}).text || '';
let daten;
const s = text.indexOf('{');
const e = text.lastIndexOf('}');
try { daten = JSON.parse(text.slice(s, e + 1)); } catch (err) { daten = { titel: 'Produkt', seo_text: text }; }
return { json: daten };` } },
  output: [{ titel: '' }]
});

const pack = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Report bündeln', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const items = $input.all();
let html = '<h2>Neue SEO-Texte für ' + items.length + ' Produkte</h2>';
for (const item of items) {
  html += '<h3>' + item.json.titel + '</h3><p>' + item.json.seo_text + '</p><hr/>';
}
return [{ json: {
  betreff: 'SEO-Text-Doktor: ' + items.length + ' neue Produktbeschreibungen - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">' + html + '</div>'
}}];` } },
  output: [{ betreff: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Texte an dich', parameters: {
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

export default workflow('seo-text-doktor', '28 · SEO-Text-Doktor 🔎✍️')
  .add(scheduleTrigger)
  .to(setup)
  .to(getProducts)
  .to(filter)
  .to(build)
  .to(claude)
  .to(parse)
  .to(pack)
  .to(sendMail);
