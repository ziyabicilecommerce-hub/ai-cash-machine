import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Täglich 18:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 18, triggerAtMinute: 0 } ] } } },
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

const getCheckouts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Abgebrochene Checkouts', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/checkouts.json?status=expired&limit=250"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ checkouts: [] }]
});

const analyze = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Abbruch-Muster finden', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const checkouts = ($input.first().json.checkouts || []).slice(0, 50);
const warenkoerbe = checkouts.map(c => ({
  wert: parseFloat(c.total_price || 0),
  artikel: (c.line_items || []).length,
  email: c.email || 'unbekannt'
}));
const durchschnitt = warenkoerbe.length > 0 ? (warenkoerbe.reduce((a,b)=>a+b.wert,0) / warenkoerbe.length).toFixed(2) : 0;
const durchschnittArtikel = warenkoerbe.length > 0 ? (warenkoerbe.reduce((a,b)=>a+b.artikel,0) / warenkoerbe.length).toFixed(1) : 0;
const daten = 'Abgebrochene Checkouts (letzte 50):' + NL +
  '- Durchschnittlicher Warenkorb-Wert: ' + durchschnitt + ' EUR' + NL +
  '- Durchschnittliche Artikel pro Warenkorb: ' + durchschnittArtikel + NL +
  '- Potentieller verlorener Umsatz: ' + (warenkoerbe.length * parseFloat(durchschnitt)).toFixed(0) + ' EUR';
const prompt = 'Du bist Konversions-Experte fuer den Onlineshop "' + setup.SHOP_NAME + '".' + NL + NL +
  daten + NL + NL +
  'Analysiere auf Deutsch:' + NL +
  '1. Was sind typische Gründe für Checkout-Abbrüche in E-Commerce?' + NL +
  '2. Die 5 effektivsten Recovery-Strategien speziell für diesen Shop' + NL +
  '3. Konkrete Auto-Mail-Sequenz: Wann senden, was schreiben (psychologisch)' + NL +
  '4. Discount-Strategie zur Rettung (wie viel Rabatt ist sinnvoll)' + NL + NL +
  'Antworte als sauberes HTML (h3/p/ul), ohne html/body-Geruest, kein Markdown.';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude Abbruch-Analyse', parameters: {
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
  betreff: 'Checkout-Abbruch-Analyse - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">' + html + '</div>'
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

export default workflow('checkout-abbruch-radar', '38 · Checkout-Abbruch-Radar 🛒⚠️')
  .add(scheduleTrigger)
  .to(setup)
  .to(getCheckouts)
  .to(analyze)
  .to(claude)
  .to(pack)
  .to(sendMail);
