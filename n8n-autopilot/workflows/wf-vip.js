import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Taeglich 12:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 12, triggerAtMinute: 0 } ] } } },
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
    { id: 's06', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' },
    { id: 's07', name: 'VIP_UMSATZ_SCHWELLE', value: '150', type: 'string' },
    { id: 's08', name: 'VIP_BESTELLUNGEN_SCHWELLE', value: '3', type: 'string' },
    { id: 's09', name: 'VIP_RABATT_CODE', value: 'VIP20', type: 'string' },
    { id: 's10', name: 'TELEGRAM_BOT_TOKEN', value: '123456:ABC-HIER_DEIN_BOT_TOKEN', type: 'string' },
    { id: 's11', name: 'TELEGRAM_CHAT_ID', value: 'HIER_DEINE_CHAT_ID', type: 'string' },
    { id: 's12', name: 'TEST_MODE', value: 'ja', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Bestellungen von gestern', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 1 }).startOf('day').toISO()) }}&created_at_max={{ encodeURIComponent($now.startOf('day').toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const detectVip = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Neue VIPs erkennen', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const sd = $getWorkflowStaticData('global');
sd.vips = sd.vips || [];
const setup = $('Setup').first().json;
const orders = (($input.first().json.orders) || []).filter(o => !o.cancelled_at && o.email && o.customer);
const umsatzSchwelle = parseFloat(setup.VIP_UMSATZ_SCHWELLE);
const bestellSchwelle = parseInt(setup.VIP_BESTELLUNGEN_SCHWELLE);
const raus = [];
for (const o of orders) {
  const k = o.customer;
  const totalSpent = parseFloat(k.total_spent || 0);
  const ordersCount = parseInt(k.orders_count || 0);
  const istVip = totalSpent >= umsatzSchwelle || ordersCount >= bestellSchwelle;
  if (!istVip) continue;
  if (sd.vips.includes(k.id)) continue;
  sd.vips.push(k.id);
  const artikel = (o.line_items || []).map(li => li.title).slice(0, 3).join(', ');
  const prompt = 'Du schreibst im Namen des Gruenders vom Onlineshop "' + setup.SHOP_NAME + '".' + NL +
    'Dieser Kunde ist gerade offiziell VIP geworden: ' + ordersCount + ' Bestellungen, ' + totalSpent.toFixed(0) + ' Gesamtumsatz. Letzte Bestellung: ' + artikel + '.' + NL + NL +
    'Schreibe eine PERSOENLICHE Dankes-E-Mail auf Deutsch (Du-Form), maximal 120 Woerter:' + NL +
    '- Klingt wie vom Gruender persoenlich getippt, NICHT wie Marketing' + NL +
    '- Ehrlicher Dank, dass er/sie immer wieder kauft' + NL +
    '- Vorname: ' + (k.first_name || 'unbekannt (neutral anreden)') + NL +
    '- Als Dankeschoen: exklusiver VIP-Code ' + setup.VIP_RABATT_CODE + ' (dauerhaft gueltig, nur fuer ihn/sie)' + NL +
    '- Frage am Ende: Was koennen wir besser machen? (echte Antworten erwuenscht)' + NL +
    '- Schlichtes HTML, wenig Styling, wie eine normale persoenliche Mail' + NL +
    'Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}';
  raus.push({ json: { email: o.email, vorname: k.first_name || '', total_spent: totalSpent.toFixed(2), orders_count: ordersCount, prompt } });
}
if (sd.vips.length > 5000) sd.vips = sd.vips.slice(-5000);
return raus;` } },
  output: [{ prompt: '' }]
});

const claudeVip = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude schreibt Dankes-Mail', parameters: {
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

const parseVip = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Antwort parsen', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const blocks = $json.content || [];
const text = (blocks.find(b => b.type === 'text') || {}).text || '';
let daten;
const s = text.indexOf('{');
const e = text.lastIndexOf('}');
try { daten = JSON.parse(text.slice(s, e + 1)); } catch (err) { daten = { betreff: 'Danke, dass du dabei bist', html: text }; }
const orig = $('Neue VIPs erkennen').item.json;
const setup = $('Setup').first().json;
const empfaenger = setup.TEST_MODE === 'ja' ? setup.OWNER_EMAIL : orig.email;
const telegram_text = 'NEUER VIP-KUNDE!' + NL + NL +
  'Name: ' + (orig.vorname || '?') + NL + 'E-Mail: ' + orig.email + NL +
  'Bestellungen: ' + orig.orders_count + NL + 'Gesamtumsatz: ' + orig.total_spent + NL + NL +
  'Persoenliche Dankes-Mail wurde ' + (setup.TEST_MODE === 'ja' ? 'im TEST-MODUS an dich' : 'automatisch an den Kunden') + ' gesendet.';
return { json: { empfaenger, betreff: (setup.TEST_MODE === 'ja' ? '[TEST] ' : '') + daten.betreff, email_html: daten.html, telegram_text } };` } },
  output: [{ empfaenger: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Dankes-Mail senden', parameters: {
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

const telegramVip = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'VIP-Alarm an dich', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_BOT_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT_ID, text: $json.telegram_text }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('vip-radar', '10 · VIP-Radar 👑💎')
  .add(scheduleTrigger)
  .to(setup)
  .to(getOrders)
  .to(detectVip)
  .to(claudeVip)
  .to(parseVip)
  .to(sendMail)
  .to(telegramVip);
