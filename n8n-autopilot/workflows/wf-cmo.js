import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Jeden Sonntag 18:00', parameters: { rule: { interval: [ { field: 'weeks', weeksInterval: 1, triggerAtDay: [0], triggerAtHour: 18, triggerAtMinute: 0 } ] } } },
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
    { id: 's05', name: 'SHOP_NISCHE', value: 'z.B. Fitness-Zubehoer fuer Zuhause', type: 'string' },
    { id: 's06', name: 'ZIELGRUPPE', value: 'z.B. Frauen 20-35, sportlich, kaufen ueber TikTok/Insta', type: 'string' },
    { id: 's07', name: 'MONATSZIEL_UMSATZ', value: '10000', type: 'string' },
    { id: 's08', name: 'MARKETING_BUDGET_MONAT', value: '1500', type: 'string' },
    { id: 's09', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's10', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' },
    { id: 's11', name: 'TELEGRAM_BOT_TOKEN', value: '123456:ABC-HIER_DEIN_BOT_TOKEN', type: 'string' },
    { id: 's12', name: 'TELEGRAM_CHAT_ID', value: 'HIER_DEINE_CHAT_ID', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getWeek = node({
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
  config: { name: 'Vorwoche', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 14 }).toISO()) }}&created_at_max={{ encodeURIComponent($now.minus({ days: 7 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const compare = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Wochen vergleichen', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
function statistik(orders) {
  orders = (orders || []).filter(o => !o.cancelled_at);
  let umsatz = 0;
  let neukunden = 0;
  let stammkunden = 0;
  const produkte = {};
  for (const o of orders) {
    umsatz += parseFloat(o.total_price || 0);
    if (o.customer && parseInt(o.customer.orders_count || 1) <= 1) neukunden++; else stammkunden++;
    for (const li of (o.line_items || [])) produkte[li.title] = (produkte[li.title] || 0) + li.quantity;
  }
  const top = Object.entries(produkte).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(function(e) { return e[0] + ' (' + e[1] + 'x)'; }).join(', ');
  return { umsatz, anzahl: orders.length, aov: orders.length ? umsatz / orders.length : 0, neukunden, stammkunden, top };
}
const woche = statistik($('Diese Woche').first().json.orders);
const vorwoche = statistik($('Vorwoche').first().json.orders);
function delta(a, b) {
  if (!b) return a > 0 ? '+unendlich' : '0%';
  return ((a - b) / b * 100).toFixed(0) + '%';
}
const daten = 'DIESE WOCHE: Umsatz ' + woche.umsatz.toFixed(2) + ' | Bestellungen ' + woche.anzahl + ' | AOV ' + woche.aov.toFixed(2) + ' | Neukunden ' + woche.neukunden + ' | Stammkunden ' + woche.stammkunden + NL +
  'VORWOCHE: Umsatz ' + vorwoche.umsatz.toFixed(2) + ' | Bestellungen ' + vorwoche.anzahl + ' | AOV ' + vorwoche.aov.toFixed(2) + NL +
  'VERAENDERUNG: Umsatz ' + delta(woche.umsatz, vorwoche.umsatz) + ' | Bestellungen ' + delta(woche.anzahl, vorwoche.anzahl) + NL +
  'TOP-PRODUKTE: ' + (woche.top || 'keine') + NL +
  'MONATSZIEL: ' + setup.MONATSZIEL_UMSATZ + ' Umsatz | MARKETING-BUDGET: ' + setup.MARKETING_BUDGET_MONAT + '/Monat';
const prompt = 'Du bist der CMO (Marketing-Chef) vom Onlineshop "' + setup.SHOP_NAME + '" (Nische: ' + setup.SHOP_NISCHE + ', Zielgruppe: ' + setup.ZIELGRUPPE + '). ' +
  'Der Gruender ist Solo-Unternehmer mit wenig Zeit. Du bist erfahren, direkt und sagst auch unbequeme Wahrheiten.' + NL + NL +
  'WOCHENDATEN:' + NL + daten + NL + NL +
  'Schreibe dein woechentliches CMO-Briefing fuer die kommende Woche, auf Deutsch (Du-Form):' + NL +
  '1. LAGEBERICHT: Wo stehen wir? Sind wir auf Kurs zum Monatsziel? (ehrlich rechnen!)' + NL +
  '2. DIE 3 PRIORITAETEN der Woche (konkret, mit Zeitaufwand-Schaetzung, wichtigste zuerst)' + NL +
  '3. BUDGET-EMPFEHLUNG: Wie das Marketing-Budget diese Woche aufteilen (Ads / Content / Sonstiges) und warum' + NL +
  '4. EIN WACHSTUMS-EXPERIMENT fuer die Woche (Hypothese, Umsetzung, Erfolgskriterium)' + NL +
  '5. STOPP-LISTE: Eine Sache, die der Gruender diese Woche NICHT tun sollte (Zeitfresser/Ablenkung)' + NL + NL +
  'Antworte NUR mit validem JSON, ohne Markdown:' + NL +
  '{"telegram_kurz": "<max 800 Zeichen Kurzfassung: Lage in 2 Saetzen + die 3 Prioritaeten als Stichpunkte>", "html": "<das volle Briefing als sauberes HTML mit h2/h3, Listen, ohne html/body-Geruest>"}';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claudeCmo = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude CMO-Briefing', parameters: {
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

const parseCmo = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Briefing verpacken', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const blocks = $json.content || [];
const text = (blocks.find(b => b.type === 'text') || {}).text || '';
let daten;
const s = text.indexOf('{');
const e = text.lastIndexOf('}');
try { daten = JSON.parse(text.slice(s, e + 1)); } catch (err) { daten = { telegram_kurz: text.slice(0, 800), html: '<pre style="white-space:pre-wrap;font-family:sans-serif;">' + text + '</pre>' }; }
const setup = $('Setup').first().json;
return { json: {
  betreff: 'CMO-Briefing fuer die Woche - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">' + daten.html + '</div>',
  telegram_text: 'CMO-BRIEFING - ' + setup.SHOP_NAME + NL + '--------------------' + NL + NL + daten.telegram_kurz + NL + NL + 'Das volle Briefing liegt in deinem Postfach.'
}};` } },
  output: [{ betreff: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Volles Briefing per E-Mail', parameters: {
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

const telegramShort = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Kurzfassung aufs Handy', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_BOT_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT_ID, text: $json.telegram_text }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('marketing-chef', '12 · Marketing-Chef (KI-CMO) 🧠👔')
  .add(scheduleTrigger)
  .to(setup)
  .to(getWeek)
  .to(getLastWeek)
  .to(compare)
  .to(claudeCmo)
  .to(parseCmo)
  .to(sendMail)
  .to(telegramShort);
