import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Täglich 08:45', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 8, triggerAtMinute: 45 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'META_ACCESS_TOKEN', value: 'HIER_DEIN_META_TOKEN', type: 'string' },
    { id: 's02', name: 'META_AD_ACCOUNT', value: 'act_HIER_DEIN_ACCOUNT_ID', type: 'string' },
    { id: 's03', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's04', name: 'SCALE_PROZENT', value: '15', type: 'string' },
    { id: 's05', name: 'MAX_BUDGET_PRO_AD', value: '500', type: 'string' },
    { id: 's06', name: 'TELEGRAM_TOKEN', value: 'HIER_DEIN_TOKEN', type: 'string' },
    { id: 's07', name: 'TELEGRAM_CHAT', value: 'HIER_DEINE_CHAT_ID', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getAds = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Meta Ads Insights', parameters: {
    method: 'GET',
    url: expr("https://graph.instagram.com/v21.0/{{ $('Setup').first().json.META_AD_ACCOUNT }}/insights?metric=spend,reach,results,ctr&fields=adset_id,name,effective_status&access_token={{ $('Setup').first().json.META_ACCESS_TOKEN }}"),
    options: {}
  } },
  output: [{ data: [] }]
});

const analyze = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Winner identifizieren', parameters: { mode: 'runOnceForAllItems', jsCode: `const ads = $input.first().json.data || [];
const winners = ads.filter(a =>
  a.effective_status === 'ACTIVE' &&
  parseFloat(a.results || 0) > 0
).map(a => ({
  id: a.adset_id,
  name: a.name,
  spend: parseFloat(a.spend || 0),
  results: parseInt(a.results || 0),
  cpc: (parseFloat(a.spend || 0) / parseInt(a.results || 1)).toFixed(2)
})).sort((a,b) => (b.results/b.spend) - (a.results/a.spend)).slice(0, 5);
return [{ json: { winners } }];` } },
  output: [{ winners: [] }]
});

const scale = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Budget skalieren', parameters: { mode: 'runOnceForEachItem', jsCode: `const setup = $('Setup').first().json;
const winners = $json.winners || [];
const scaleProzent = parseInt(setup.SCALE_PROZENT);
const maxBudget = parseFloat(setup.MAX_BUDGET_PRO_AD);
const aktionen = [];
for (const ad of winners) {
  const newBudget = Math.min(ad.spend * (1 + scaleProzent/100), maxBudget);
  if (newBudget > ad.spend) {
    aktionen.push({
      ad_id: ad.id,
      ad_name: ad.name,
      old_budget: ad.spend,
      new_budget: newBudget,
      erhoehung: (newBudget - ad.spend).toFixed(2)
    });
  }
}
const nachricht = 'Meta Ads Auto-Scaler: ' + aktionen.length + ' winning ads skaliert (+' + setup.SCALE_PROZENT + '%)' + (aktionen.length > 0 ? ': ' + aktionen.map(a => a.ad_name.substring(0,20) + ' (€' + a.erhoehung + ')').join(', ') : '');
return [{ json: { aktionen, nachricht } }];` } },
  output: [{ aktionen: [] }]
});

const telegram = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Telegram Benachrichtigung', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT, text: $json.nachricht }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('meta-ads-auto-skalierer', '42 · Meta Ads Auto-Skalierer 📊💹')
  .add(scheduleTrigger)
  .to(setup)
  .to(getAds)
  .to(analyze)
  .to(scale)
  .to(telegram);
