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
    { id: 's03', name: 'ANTHROPIC_API_KEY', value: 'sk-ant-HIER_DEIN_KEY', type: 'string' },
    { id: 's04', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's05', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Bestellungen letzte Stunde', parameters: {
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
  config: { name: 'Neue, versendbare Orders', parameters: { mode: 'runOnceForAllItems', jsCode: `const sd = $getWorkflowStaticData('global');
sd.gefragt = sd.gefragt || [];
const orders = ($input.first().json.orders || []).filter(o => !o.cancelled_at && o.email && o.customer);
const raus = [];
for (const o of orders) {
  if (sd.gefragt.includes(o.id)) continue;
  sd.gefragt.push(o.id);
  const artikel = (o.line_items || []).map(li => li.title).join(', ');
  raus.push({ json: { orderId: o.id, email: o.email, name: o.customer.first_name, artikel, preis: parseFloat(o.total_price || 0) } });
}
if (sd.gefragt.length > 5000) sd.gefragt = sd.gefragt.slice(-5000);
return raus;` } },
  output: [{ email: '' }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Upsell-Prompt erstellen', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const o = $json;
const prompt = 'Du schreibst eine personalisierte Upsell-Email nach dem Kauf fuer den Onlineshop "' + setup.SHOP_NAME + '".' + NL +
  'Kunde: ' + (o.name || 'unbekannt') + ', hat gerade gekauft: ' + o.artikel + ' fuer ' + o.preis + ' EUR' + NL + NL +
  'Schreibe auf Deutsch (Du-Form):' + NL +
  '1. Kurze Gratulation zum Kauf (persoenlich, nicht corporate)' + NL +
  '2. Konkrete Upsell/Cross-Sell-Vorschlaege (was passt dazu?)' + NL +
  '3. EIN Rabatt-Code mit Prozentsatz (realistisch)' + NL +
  '4. Psychologisch wirksam: Knappheit oder Exklusivitaet' + NL + NL +
  'Antworte als fertiges Email-HTML ohne html/body-Tags.';
return { json: { orderId: $json.orderId, email: $json.email, prompt } };` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude generiert Email', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 1500, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const parse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Email vorbereiten', parameters: { mode: 'runOnceForEachItem', jsCode: `const blocks = $json.content || [];
const html = (blocks.find(b => b.type === 'text') || {}).text || '';
const orig = $('Upsell-Prompt erstellen').item.json;
const setup = $('Setup').first().json;
return { json: {
  toEmail: orig.email,
  subject: 'Speziell für dich: ' + setup.SHOP_NAME + ' Upsell',
  email_html: html
}};` } },
  output: [{ toEmail: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Upsell-Email senden', parameters: {
    resource: 'email', operation: 'send',
    fromEmail: expr("{{ $('Setup').first().json.ABSENDER_EMAIL }}"),
    toEmail: expr("{{ $json.toEmail }}"),
    subject: expr("{{ $json.subject }}"),
    emailFormat: 'html',
    html: expr("{{ $json.email_html }}"),
    options: { appendAttribution: false }
  }, credentials: { smtp: newCredential('SMTP') } },
  output: [{ success: true }]
});

export default workflow('post-purchase-upsell-engine', '41 · Post-Purchase-Upsell-Engine 🚀💰')
  .add(scheduleTrigger)
  .to(setup)
  .to(getOrders)
  .to(filter)
  .to(build)
  .to(claude)
  .to(parse)
  .to(sendMail);
