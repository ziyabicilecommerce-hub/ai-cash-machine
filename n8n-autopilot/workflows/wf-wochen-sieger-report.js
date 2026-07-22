import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Sonntags 18:00', parameters: { rule: { interval: [ { field: 'weeks', weeksInterval: 1, triggerAtDay: [0], triggerAtHour: 18, triggerAtMinute: 0 } ] } } },
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

const getThisWeek = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Diese Woche', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 7 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const getLastWeek = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Letzte Woche', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 14 }).toISO()) }}&created_at_max={{ encodeURIComponent($now.minus({ days: 7 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const analyze = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Wochenvergleich', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const thisWeek = ($input.all().find(i => i.node === 'Diese Woche').json.orders || []).filter(o => !o.cancelled_at);
const lastWeek = ($input.all().find(i => i.node === 'Letzte Woche').json.orders || []).filter(o => !o.cancelled_at);
const umsatzDiese = thisWeek.reduce((a,b)=>a+parseFloat(b.total_price||0),0);
const umsatzLetzte = lastWeek.reduce((a,b)=>a+parseFloat(b.total_price||0),0);
const veraenderung = umsatzLetzte > 0 ? (((umsatzDiese - umsatzLetzte) / umsatzLetzte) * 100).toFixed(1) : 'N/A';
const produkte = {};
for (const o of thisWeek) {
  for (const li of (o.line_items || [])) {
    produkte[li.title] = (produkte[li.title] || 0) + (li.quantity || 1);
  }
}
const topProdukt = Object.entries(produkte).sort((a,b)=>b[1]-a[1])[0];
const daten = 'Diese Woche: ' + thisWeek.length + ' Bestellungen, ' + umsatzDiese.toFixed(0) + ' EUR Umsatz' + NL +
  'Letzte Woche: ' + lastWeek.length + ' Bestellungen, ' + umsatzLetzte.toFixed(0) + ' EUR Umsatz' + NL +
  'Veränderung: ' + veraenderung + '%' + NL +
  'Top-Produkt: ' + (topProdukt ? topProdukt[0] + ' (' + topProdukt[1] + 'x)' : 'keine Daten');
const prompt = 'Du bist Wochenreport-Analyst für den Onlineshop "' + setup.SHOP_NAME + '".' + NL + NL +
  daten + NL + NL +
  'Erstelle auf Deutsch einen motivierenden, aber ehrlichen Wochen-Report:' + NL +
  '1. Kurze Einordnung: Läuft es gut oder schlecht? Warum?' + NL +
  '2. Was war der "Sieger" dieser Woche (Produkt/Kanal/Trend)?' + NL +
  '3. Eine konkrete Sache für nächste Woche verbessern' + NL + NL +
  'Antworte als sauberes HTML (h3/p), kein Markdown, motivierender Ton.';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude Wochen-Report', parameters: {
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

const pack = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Report verpacken', parameters: { mode: 'runOnceForEachItem', jsCode: `const blocks = $json.content || [];
const html = (blocks.find(b => b.type === 'text') || {}).text || '';
const setup = $('Setup').first().json;
return { json: {
  betreff: 'Wochen-Sieger-Report - ' + setup.SHOP_NAME,
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

export default workflow('wochen-sieger-report', '27 · Wochen-Sieger-Report 🏆📈')
  .add(scheduleTrigger)
  .add(getThisWeek)
  .add(getLastWeek)
  .to(analyze)
  .to(claude)
  .to(pack)
  .to(sendMail);
