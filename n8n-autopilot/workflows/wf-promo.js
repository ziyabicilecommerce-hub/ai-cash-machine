import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Alle 14 Tage 10:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 14, triggerAtHour: 10, triggerAtMinute: 0 } ] } } },
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
    { id: 's07', name: 'ZIELGRUPPE', value: 'z.B. Frauen 20-35, sportlich, kaufen ueber TikTok/Insta', type: 'string' },
    { id: 's08', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's09', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' },
    { id: 's10', name: 'KAMPAGNEN_RABATT_CODE', value: 'BOOM20', type: 'string' },
    { id: 's11', name: 'RABATT_PROZENT', value: '20', type: 'string' },
    { id: 's12', name: 'MAX_EMPFAENGER', value: '200', type: 'string' },
    { id: 's13', name: 'TEST_MODE', value: 'ja', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getProducts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Produkte holen', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/products.json?limit=50&fields=id,title,handle,variants"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ products: [] }]
});

const getCustomers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Kundenliste holen', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/customers.json?limit=250&fields=id,email,first_name,email_marketing_consent,accepts_marketing"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ customers: [] }]
});

const buildCampaign = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Kampagne planen', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const sd = $getWorkflowStaticData('global');
sd.kampagnenZaehler = (sd.kampagnenZaehler || 0) + 1;
const setup = $('Setup').first().json;
const typen = [
  { name: 'Flash-Sale', idee: '48h-Blitzangebot mit dem Rabattcode, harte Deadline, Countdown-Gefuehl' },
  { name: 'Bestseller-Spotlight', idee: 'Das beliebteste Produkt feiern: warum es alle lieben, Social-Proof-Gefuehl, Code als Bonus' },
  { name: 'Insider-Tipp', idee: 'Wertvoller Nischen-Tipp im Zentrum (echter Mehrwert!), Produkt nur elegant nebenbei, Code als Belohnung fuers Lesen' },
  { name: 'Geheimer Sale', idee: 'Nur-fuer-Abonnenten-Deal: exklusiv, verknappt, nicht auf der Website beworben' },
  { name: 'Neuheiten-Drop', idee: 'Neuste Produkte wie einen Launch inszenieren, Erste-sein-Gefuehl, Code fuer Early Birds' }
];
const typ = typen[(sd.kampagnenZaehler - 1) % typen.length];
const produkte = (($('Produkte holen').first().json.products) || [])
  .slice(0, 15)
  .map(p => '- ' + p.title + ' (' + setup.SHOP_URL + '/products/' + p.handle + ', ' + (((p.variants || [])[0] || {}).price || '?') + ')');
const anrede = String.fromCharCode(123, 123) + 'VORNAME' + String.fromCharCode(125, 125);
const prompt = 'Du bist E-Mail-Marketing-Profi fuer den Onlineshop "' + setup.SHOP_NAME + '" (Nische: ' + setup.SHOP_NISCHE + ', Zielgruppe: ' + setup.ZIELGRUPPE + ').' + NL + NL +
  'KAMPAGNEN-TYP heute: ' + typ.name + ' -> ' + typ.idee + NL +
  'Rabattcode: ' + setup.KAMPAGNEN_RABATT_CODE + ' (' + setup.RABATT_PROZENT + '%)' + NL + NL +
  'Produktkatalog (Auszug):' + NL + produkte.join(NL) + NL + NL +
  'Schreibe die komplette Kampagnen-E-Mail auf Deutsch (Du-Form):' + NL +
  '- Betreff: maximal 45 Zeichen, neugierig machend, zum Kampagnen-Typ passend' + NL +
  '- Der Platzhalter ' + anrede + ' soll im HTML genau einmal fuer die persoenliche Anrede stehen' + NL +
  '- 1-2 konkrete Produkte aus dem Katalog mit Links einbauen' + NL +
  '- EIN klarer CTA-Button (als <a> mit Inline-Button-Styling)' + NL +
  '- Rabattcode prominent, Deadline erzeugen' + NL +
  '- Unten kleiner Footer-Hinweis: Du bekommst diese Mail als Kunde von ' + setup.SHOP_NAME + '. Antworte mit STOP zum Abmelden.' + NL +
  '- Mobiltaugliches HTML mit Inline-CSS, kein Spam-Vokabular (keine Grossbuchstaben-Waende)' + NL +
  'Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}';
return [{ json: { prompt, kampagnen_typ: typ.name } }];` } },
  output: [{ prompt: '' }]
});

const claudeCampaign = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude schreibt die Kampagne', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 3500, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const fanout = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Personalisieren und verteilen', parameters: { mode: 'runOnceForAllItems', jsCode: `const blocks = ($input.first().json.content) || [];
const text = (blocks.find(b => b.type === 'text') || {}).text || '';
let daten;
const s = text.indexOf('{');
const e = text.lastIndexOf('}');
try { daten = JSON.parse(text.slice(s, e + 1)); } catch (err) { daten = { betreff: 'Nur fuer dich', html: text }; }
const setup = $('Setup').first().json;
const maxEmpf = parseInt(setup.MAX_EMPFAENGER || 200);
const platzhalter = String.fromCharCode(123, 123) + 'VORNAME' + String.fromCharCode(125, 125);
const kunden = (($('Kundenliste holen').first().json.customers) || []).filter(function(k) {
  if (!k.email) return false;
  if (k.email_marketing_consent) return k.email_marketing_consent.state === 'subscribed';
  return k.accepts_marketing === true;
}).slice(0, maxEmpf);
if (setup.TEST_MODE === 'ja') {
  return [{ json: {
    empfaenger: setup.OWNER_EMAIL,
    betreff: '[TEST - Kampagne haette ' + kunden.length + ' Empfaenger] ' + daten.betreff,
    email_html: daten.html.split(platzhalter).join('Testkunde')
  }}];
}
return kunden.map(function(k) { return { json: {
  empfaenger: k.email,
  betreff: daten.betreff,
  email_html: daten.html.split(platzhalter).join(k.first_name || 'du')
}}; });` } },
  output: [{ empfaenger: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Kampagne senden', parameters: {
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

export default workflow('promo-kampagnen', '17 · Promo-Kampagnen-Maschine 💥📧')
  .add(scheduleTrigger)
  .to(setup)
  .to(getProducts)
  .to(getCustomers)
  .to(buildCampaign)
  .to(claudeCampaign)
  .to(fanout)
  .to(sendMail);
