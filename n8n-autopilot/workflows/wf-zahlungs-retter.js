import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Alle 4 Stunden', parameters: { rule: { interval: [ { field: 'hours', hoursInterval: 4 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'SHOP', value: 'dein-shop-subdomain', type: 'string' },
    { id: 's02', name: 'SHOPIFY_TOKEN', value: 'shpat_HIER_DEIN_TOKEN', type: 'string' },
    { id: 's03', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's04', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's05', name: 'TEST_MODE', value: 'ja', type: 'string' },
    { id: 's06', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Offene/fehlgeschlagene Zahlungen', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&financial_status=pending&limit=50&created_at_min={{ encodeURIComponent($now.minus({ hours: 24 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const filter = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Zahlungs-Retter Kandidaten', parameters: { mode: 'runOnceForAllItems', jsCode: `const sd = $getWorkflowStaticData('global');
sd.erinnert = sd.erinnert || [];
const orders = ($input.first().json.orders || []).filter(o => !o.cancelled_at && o.email);
const raus = [];
for (const o of orders) {
  const alterStunden = (Date.now() - new Date(o.created_at).getTime()) / 3600000;
  if (alterStunden < 2) continue;
  if (sd.erinnert.includes(o.id)) continue;
  sd.erinnert.push(o.id);
  raus.push({ json: { orderId: o.id, email: o.email, name: (o.customer || {}).first_name || 'Kunde', wert: parseFloat(o.total_price || 0), checkoutUrl: o.order_status_url || '' } });
}
if (sd.erinnert.length > 5000) sd.erinnert = sd.erinnert.slice(-5000);
return raus;` } },
  output: [{ email: '' }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Zahlungs-Erinnerung bauen', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const o = $json;
const html = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">' +
  '<p>Hallo ' + o.name + ',</p>' +
  '<p>deine Bestellung über ' + o.wert.toFixed(2) + ' EUR bei ' + setup.SHOP_NAME + ' wartet noch auf die Zahlungsbestätigung.</p>' +
  '<p>Falls die Zahlung nicht durchgegangen ist, kannst du es hier einfach nochmal versuchen:</p>' +
  (o.checkoutUrl ? '<p><a href="' + o.checkoutUrl + '" style="background:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Zahlung abschließen</a></p>' : '') +
  '<p>Falls du Fragen hast, antworte einfach auf diese Mail.</p>' +
  '</div>';
return { json: { orderId: o.orderId, empfaenger: setup.TEST_MODE === 'ja' ? setup.OWNER_EMAIL : o.email, email_html: html } };` } },
  output: [{ empfaenger: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Zahlungs-Erinnerung senden', parameters: {
    resource: 'email', operation: 'send',
    fromEmail: expr("{{ $('Setup').first().json.ABSENDER_EMAIL }}"),
    toEmail: expr("{{ $json.empfaenger }}"),
    subject: 'Deine Zahlung wartet noch',
    emailFormat: 'html',
    html: expr("{{ $json.email_html }}"),
    options: { appendAttribution: false }
  }, credentials: { smtp: newCredential('SMTP') } },
  output: [{ success: true }]
});

export default workflow('zahlungs-retter', '29 · Zahlungs-Retter 💳🛟')
  .add(scheduleTrigger)
  .to(setup)
  .to(getOrders)
  .to(filter)
  .to(build)
  .to(sendMail);
