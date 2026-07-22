import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: '1. jeden Monats um 09:00', parameters: { rule: { interval: [ { field: 'months', monthsInterval: 1, triggerAtDay: 1, triggerAtHour: 9, triggerAtMinute: 0 } ] } } },
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

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Orders 90 Tage', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 90 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const analyze = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Laender-Mix analysieren', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const orders = ($input.first().json.orders || []).filter(o => !o.cancelled_at);
const laender = {};
for (const o of orders) {
  const land = (o.shipping_address || {}).country || 'unbekannt';
  laender[land] = (laender[land] || 0) + 1;
}
const top = Object.entries(laender).sort((a,b)=>b[1]-a[1]).slice(0, 10).map(e => e[0] + ': ' + e[1]).join(NL);
const prompt = 'Du bist Laender-Expansions-Strategin fuer den Onlineshop "' + setup.SHOP_NAME + '" (Nische: ' + setup.SHOP_NISCHE + ').' + NL + NL +
  'Bestellungen nach Laendern (letzte 90 Tage):' + NL + top + NL + NL +
  'Analysiere und gib Empfehlungen auf Deutsch:' + NL +
  '1. Top 3 NEW Expansion-Laender (nicht bereits vertreten)' + NL +
  '2. Fuer jedes: Potential, Marktgroesse, Cultural Fit zur Nische' + NL +
  '3. Konkrete Einstiegs-Strategie (Paid Ads, Influencer, Partnerships)' + NL +
  '4. Logistik/Versand: Was ist zu beachten?' + NL +
  '5. Low-Risk Test: Budget + Timeline' + NL + NL +
  'Antworte als sauberes HTML (h3/p/ul), kein Markdown.';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude Expansion-Plan', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 3000, messages: [{ role: 'user', content: $json.prompt }] }) }}")
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
  betreff: 'Laender-Expansions-Plan - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">' + html + '</div>'
}};` } },
  output: [{ betreff: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Plan an dich', parameters: {
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

export default workflow('laender-expansions-scout', '47 · Länder-Expansions-Scout 🌍📈')
  .add(scheduleTrigger)
  .to(setup)
  .to(getOrders)
  .to(analyze)
  .to(claude)
  .to(pack)
  .to(sendMail);
