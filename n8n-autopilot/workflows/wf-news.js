import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Jeden Donnerstag 09:00', parameters: { rule: { interval: [ { field: 'weeks', weeksInterval: 1, triggerAtDay: [4], triggerAtHour: 9, triggerAtMinute: 0 } ] } } },
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
    { id: 's05', name: 'SHOP_URL', value: 'https://meinshop.de', type: 'string' },
    { id: 's06', name: 'SHOP_NISCHE', value: 'z.B. Fitness-Zubehoer fuer Zuhause', type: 'string' },
    { id: 's07', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's08', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' },
    { id: 's09', name: 'NEWSLETTER_RABATT_CODE', value: '', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getProducts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Produkte holen', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/products.json?limit=50&fields=id,title,handle,product_type,tags,variants"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ products: [] }]
});

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Verkaeufe der Woche', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 7 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const buildPrompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Daten kombinieren', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const produkte = ($('Produkte holen').first().json.products || [])
  .slice(0, 20)
  .map(p => '- ' + p.title + ' (' + setup.SHOP_URL + '/products/' + p.handle + ', ab ' + (((p.variants || [])[0] || {}).price || '?') + ')');
const orders = ($input.first().json.orders || []).filter(o => !o.cancelled_at);
const verkauft = {};
for (const o of orders) {
  for (const li of (o.line_items || [])) verkauft[li.title] = (verkauft[li.title] || 0) + li.quantity;
}
const topWoche = Object.entries(verkauft).sort((a, b) => b[1] - a[1]).slice(0, 3)
  .map(function(e) { return '- ' + e[0] + ' (' + e[1] + 'x diese Woche)'; });
const prompt = 'Du bist Newsletter-Texter fuer den Onlineshop "' + setup.SHOP_NAME + '" (Nische: ' + setup.SHOP_NISCHE + ').' + NL + NL +
  'Produktkatalog (Auszug):' + NL + produkte.join(NL) + NL + NL +
  'Bestseller dieser Woche:' + NL + (topWoche.length ? topWoche.join(NL) : '(keine Verkaeufe diese Woche)') + NL + NL +
  (setup.NEWSLETTER_RABATT_CODE ? 'Rabattcode fuer den Newsletter: ' + setup.NEWSLETTER_RABATT_CODE + NL + NL : '') +
  'Schreibe den kompletten Wochen-Newsletter auf Deutsch (Du-Form):' + NL +
  '1. Betreffzeile (neugierig machend, max 45 Zeichen) + Preheader (max 80 Zeichen)' + NL +
  '2. Aufhaenger: kurzer, persoenlicher Einstieg mit echtem Mehrwert zur Nische (Tipp, Insight oder Mini-Story - KEIN reines Verkaufen)' + NL +
  '3. Produkt-Spotlight: 1-2 Produkte aus dem Katalog natuerlich einbinden, mit Link' + NL +
  '4. Klarer CTA-Button (als <a> mit Inline-Button-Styling)' + NL +
  (setup.NEWSLETTER_RABATT_CODE ? '5. Rabattcode elegant einbauen' + NL : '') +
  NL + 'Verhaeltnis: 70% Mehrwert, 30% Verkauf. Mobiltaugliches HTML mit Inline-CSS.' + NL +
  'Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "preheader": "...", "html": "<komplettes Newsletter-HTML>"}';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claudeNews = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude schreibt Newsletter', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 4000, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const parseNews = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Entwurf verpacken', parameters: { mode: 'runOnceForEachItem', jsCode: `const blocks = $json.content || [];
const text = (blocks.find(b => b.type === 'text') || {}).text || '';
let daten;
const s = text.indexOf('{');
const e = text.lastIndexOf('}');
try { daten = JSON.parse(text.slice(s, e + 1)); } catch (err) { daten = { betreff: 'Dein Wochen-Newsletter (Entwurf)', preheader: '', html: text }; }
const hinweis = '<div style="background:#fef3c7;border:1px solid #f59e0b;padding:12px;border-radius:8px;font-family:sans-serif;font-size:13px;margin-bottom:20px;">' +
  'Newsletter-Entwurf - Betreff: <b>' + daten.betreff + '</b> - Preheader: ' + (daten.preheader || '-') +
  '<br>Gegenlesen, in dein E-Mail-Tool (Shopify Email / Klaviyo / Mailchimp) kopieren und an deine Liste senden. 2 Minuten Arbeit.</div>';
return { json: { betreff: 'Newsletter-Entwurf fuer diese Woche: ' + daten.betreff, email_html: hinweis + daten.html } };` } },
  output: [{ betreff: '' }]
});

const sendDraft = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Entwurf an dich senden', parameters: {
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

export default workflow('newsletter-autopilot', '09 · Newsletter-Autopilot 📰🚀')
  .add(scheduleTrigger)
  .to(setup)
  .to(getProducts)
  .to(getOrders)
  .to(buildPrompt)
  .to(claudeNews)
  .to(parseNews)
  .to(sendDraft);
