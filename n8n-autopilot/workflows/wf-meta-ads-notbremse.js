import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Alle 3 Stunden', parameters: { rule: { interval: [ { field: 'hours', hoursInterval: 3 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'META_ACCESS_TOKEN', value: 'HIER_DEIN_TOKEN', type: 'string' },
    { id: 's02', name: 'META_AD_ACCOUNT', value: 'act_HIER_ACCOUNT', type: 'string' },
    { id: 's03', name: 'CRITICAL_ROAS', value: '2.0', type: 'string' },
    { id: 's04', name: 'TELEGRAM_TOKEN', value: 'HIER_TOKEN', type: 'string' },
    { id: 's05', name: 'TELEGRAM_CHAT', value: 'HIER_CHAT', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getMetrics = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Meta ROAS abrufen', parameters: {
    method: 'GET',
    url: expr("https://graph.instagram.com/v21.0/{{ $('Setup').first().json.META_AD_ACCOUNT }}/insights?metric=spend,purchase_roas&date_preset=today&fields=spend,purchase_roas,status&access_token={{ $('Setup').first().json.META_ACCESS_TOKEN }}"),
    options: {}
  } },
  output: [{ data: [] }]
});

const check = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'ROAS prüfen', parameters: { mode: 'runOnceForAllItems', jsCode: `const setup = $('Setup').first().json;
const data = $input.first().json.data || [];
const criticalRoas = parseFloat(setup.CRITICAL_ROAS || 2.0);
const spend = parseFloat((data[0] || {}).spend || 0);
const roas = parseFloat((data[0] || {}).purchase_roas || 0);
const status = (data[0] || {}).status;
let nachricht = '';
if (roas < criticalRoas && status === 'ACTIVE' && spend > 0) {
  nachricht = '🚨 NOTBREMSE! ROAS gesunken auf ' + roas.toFixed(2) + ' (Limit: ' + criticalRoas + '). Alle aktiven Ads werden PAUSIERT!';
}
return [{ json: { roas, spend, status, nachricht, action: nachricht ? 'PAUSE' : 'OK' } }];` } },
  output: [{ action: 'OK' }]
});

const pause = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Ads pausieren (wenn nötig)', parameters: { mode: 'runOnceForEachItem', jsCode: `if ($json.action === 'PAUSE') {
  return [{ json: { pause: true, msg: $json.nachricht } }];
} else {
  return [];
}` } },
  output: [{ pause: false }]
});

const telegram = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Telegram Alert', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT, text: $json.msg }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('meta-ads-notbremse', '43 · Meta Ads Notbremse 🛑⚡')
  .add(scheduleTrigger)
  .to(setup)
  .to(getMetrics)
  .to(check)
  .to(pause)
  .to(telegram);
