import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Montags 08:30', parameters: { rule: { interval: [ { field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 8, triggerAtMinute: 30 } ] } } },
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

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Bestellungen 30 Tage', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 30 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const analyze = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Quellen auswerten', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const orders = ($input.first().json.orders || []).filter(o => !o.cancelled_at);
function host(u) { try { return (u || '').split('/')[2] || u || 'direkt'; } catch (e) { return 'direkt'; } }
const quelleUmsatz = {};
const quelleAnzahl = {};
const referrer = {};
for (const o of orders) {
  const p = parseFloat(o.total_price || 0);
  const src = o.source_name || 'unbekannt';
  quelleUmsatz[src] = (quelleUmsatz[src] || 0) + p;
  quelleAnzahl[src] = (quelleAnzahl[src] || 0) + 1;
  const ref = host(o.referring_site) || 'direkt/keine';
  referrer[ref] = (referrer[ref] || 0) + 1;
}
function top(obj, n) { return Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0, n); }
const tQuelle = top(quelleUmsatz, 8).map(function(e) { return '- ' + e[0] + ': ' + e[1].toFixed(0) + ' Umsatz (' + (quelleAnzahl[e[0]] || 0) + ' Bestellungen)'; });
const tRef = top(referrer, 8).map(function(e) { return '- ' + e[0] + ': ' + e[1] + ' Bestellungen'; });
const daten = 'Umsatz nach Verkaufskanal (source_name):' + NL + (tQuelle.length ? tQuelle.join(NL) : '- keine Daten') + NL + NL +
  'Herkunft/Referrer (woher kamen die Besucher):' + NL + (tRef.length ? tRef.join(NL) : '- keine Daten');
const prompt = 'Du bist Traffic-/Growth-Analyst fuer den Onlineshop "' + setup.SHOP_NAME + '".' + NL + NL +
  'DATEN (letzte 30 Tage):' + NL + daten + NL + NL +
  'Analysiere auf Deutsch:' + NL +
  '1. Welcher Kanal/welche Quelle bringt das meiste Geld - und welche wird unterschaetzt?' + NL +
  '2. Wo steckt ungenutztes Potenzial (Kanal mit Bestellungen aber wenig Fokus)?' + NL +
  '3. DIE 2 konkreten Massnahmen fuer diese Woche, um den staerksten Kanal auszubauen' + NL +
  '4. Falls fast alles "direkt/unbekannt" ist: Tipp, wie man Herkunft sauber trackt (UTM/Parameter)' + NL + NL +
  'Antworte als sauberes HTML (h2/h3, Listen), ohne html/body-Geruest, kein Markdown-Codeblock.';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude Quellen-Analyse', parameters: {
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
  betreff: 'Traffic-Quellen-Report (30 Tage) - ' + setup.SHOP_NAME,
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

export default workflow('neukunden-quellen', '34 · Neukunden-Quellen-Report 🧭📊')
  .add(scheduleTrigger)
  .to(setup)
  .to(getOrders)
  .to(analyze)
  .to(claude)
  .to(pack)
  .to(sendMail);
