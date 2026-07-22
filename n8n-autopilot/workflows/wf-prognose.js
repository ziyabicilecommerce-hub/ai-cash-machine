import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Sonntags 20:00', parameters: { rule: { interval: [ { field: 'weeks', weeksInterval: 1, triggerAtDay: [0], triggerAtHour: 20, triggerAtMinute: 0 } ] } } },
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
    { id: 's05', name: 'MONATSZIEL_UMSATZ', value: '10000', type: 'string' },
    { id: 's06', name: 'TELEGRAM_BOT_TOKEN', value: '123456:ABC-HIER_DEIN_BOT_TOKEN', type: 'string' },
    { id: 's07', name: 'TELEGRAM_CHAT_ID', value: 'HIER_DEINE_CHAT_ID', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Bestellungen 28 Tage', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 28 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const analyze = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Prognose rechnen', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const ziel = parseFloat(setup.MONATSZIEL_UMSATZ);
const orders = ($input.first().json.orders || []).filter(o => !o.cancelled_at);
const jetzt = new Date();
const tagImMonat = jetzt.getDate();
const tageImMonat = new Date(jetzt.getFullYear(), jetzt.getMonth() + 1, 0).getDate();
let umsatz28 = 0;
let umsatzMonat = 0;
for (const o of orders) {
  const p = parseFloat(o.total_price || 0);
  umsatz28 += p;
  const d = new Date(o.created_at);
  if (d.getMonth() === jetzt.getMonth() && d.getFullYear() === jetzt.getFullYear()) umsatzMonat += p;
}
const proTag = umsatz28 / 28;
const prognose = umsatzMonat + proTag * (tageImMonat - tagImMonat);
const zielProzent = ziel > 0 ? (prognose / ziel * 100) : 0;
const restBenoetigtProTag = ziel > umsatzMonat ? ((ziel - umsatzMonat) / Math.max(1, (tageImMonat - tagImMonat))) : 0;
const daten = 'Tag ' + tagImMonat + ' von ' + tageImMonat + ' im Monat' + NL +
  'Umsatz bisher diesen Monat: ' + umsatzMonat.toFixed(0) + NL +
  'Tempo (Schnitt/Tag, 28 Tage): ' + proTag.toFixed(0) + NL +
  'PROGNOSE Monatsende: ~' + prognose.toFixed(0) + ' (' + zielProzent.toFixed(0) + '% vom Ziel ' + ziel.toFixed(0) + ')' + NL +
  'Noetiger Tagesumsatz, um Ziel noch zu schaffen: ~' + restBenoetigtProTag.toFixed(0);
const prompt = 'Du bist Finanz-Coach fuer den Onlineshop "' + setup.SHOP_NAME + '".' + NL + NL +
  'ZAHLEN:' + NL + daten + NL + NL +
  'Gib mir kurz und ehrlich auf Deutsch (Du-Form):' + NL +
  '1. Liegen wir auf Kurs, drueber oder drunter? (1 Satz, klare Ansage)' + NL +
  '2. Wenn drunter: die 2 realistischsten Hebel, um bis Monatsende aufzuholen' + NL +
  '3. Wenn drueber: was jetzt verdoppeln, damit es so bleibt' + NL + NL +
  'Maximal 600 Zeichen, Klartext ohne Markdown, Emojis als Trenner.';
return [{ json: { prompt, kopf: daten } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude Prognose-Coaching', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 900, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const pack = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Nachricht bauen', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const kopf = $('Prognose rechnen').first().json.kopf;
const blocks = ($input.first().json.content) || [];
const coaching = (blocks.find(b => b.type === 'text') || {}).text || '';
const text = 'UMSATZ-PROGNOSE - ' + setup.SHOP_NAME + NL + '--------------------' + NL + kopf + NL + NL + coaching;
return [{ json: { telegram_text: text } }];` } },
  output: [{ telegram_text: '' }]
});

const telegram = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Prognose aufs Handy', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_BOT_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT_ID, text: $json.telegram_text }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('umsatz-prognose', '31 · Umsatz-Prognose 🔮📈')
  .add(scheduleTrigger)
  .to(setup)
  .to(getOrders)
  .to(analyze)
  .to(claude)
  .to(pack)
  .to(telegram);
