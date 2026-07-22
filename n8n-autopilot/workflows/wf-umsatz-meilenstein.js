import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Täglich 21:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 21, triggerAtMinute: 0 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'SHOP', value: 'dein-shop-subdomain', type: 'string' },
    { id: 's02', name: 'SHOPIFY_TOKEN', value: 'shpat_HIER_DEIN_TOKEN', type: 'string' },
    { id: 's03', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's04', name: 'TELEGRAM_TOKEN', value: 'HIER_TOKEN', type: 'string' },
    { id: 's05', name: 'TELEGRAM_CHAT', value: 'HIER_CHAT', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getToday = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Orders heute', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.startOf('day').toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const check = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Meilensteine prüfen', parameters: { mode: 'runOnceForAllItems', jsCode: `const sd = $getWorkflowStaticData('global');
sd.records = sd.records || { umsatz: 0, bestellungen: 0 };
sd.milestones = sd.milestones || { bestellungen: [10, 25, 50, 100, 250], umsatz: [1000, 5000, 10000, 50000] };
const orders = ($input.first().json.orders || []).filter(o => !o.cancelled_at);
const umsatz = orders.reduce((a,b)=>a+parseFloat(b.total_price||0), 0);
const meilensteine = [];
if (umsatz > sd.records.umsatz) {
  for (const m of sd.milestones.umsatz) {
    if (umsatz >= m && sd.records.umsatz < m) {
      meilensteine.push({ type: 'Umsatz', value: m, actual: umsatz.toFixed(0) });
    }
  }
  sd.records.umsatz = Math.max(sd.records.umsatz, umsatz);
}
if (orders.length > sd.records.bestellungen) {
  for (const m of sd.milestones.bestellungen) {
    if (orders.length >= m && sd.records.bestellungen < m) {
      meilensteine.push({ type: 'Bestellungen', value: m, actual: orders.length });
    }
  }
  sd.records.bestellungen = Math.max(sd.records.bestellungen, orders.length);
}
return meilensteine.length > 0 ? [{ json: { meilensteine, count: meilensteine.length } }] : [];` } },
  output: [{ meilensteine: [] }]
});

const celebrate = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Feier-Nachricht', parameters: { mode: 'runOnceForEachItem', jsCode: `const setup = $('Setup').first().json;
const ms = $json.meilensteine || [];
const msgs = ms.map(m => {
  const emoji = m.type === 'Umsatz' ? '💰' : '🎉';
  return emoji + ' ' + m.type + '-MEILENSTEIN! ' + m.value + ' erreicht (aktuell: ' + m.actual + ')';
}).join(NL);
const NL = String.fromCharCode(10);
const tips = NL + NL + '💡 TIPP FÜR DIESEN ERFOLG:' + NL +
  (ms[0]?.type === 'Umsatz' ? '→ Jetzt die Meta Ads Budgets erhöhen!' : '→ UGC-Anfragen rausgehen & Review-Magnet aktivieren!');
return [{ json: { nachricht: setup.SHOP_NAME + ' ' + msgs + tips } }];` } },
  output: [{ nachricht: '' }]
});

const telegram = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Telegram Celebration', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT, text: $json.nachricht }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('umsatz-meilenstein-feier', '49 · Umsatz-Meilenstein-Feier 🎊💹')
  .add(scheduleTrigger)
  .to(setup)
  .to(getToday)
  .to(check)
  .to(celebrate)
  .to(telegram);
