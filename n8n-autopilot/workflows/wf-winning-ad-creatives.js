import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Montags 07:00', parameters: { rule: { interval: [ { field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 7, triggerAtMinute: 0 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'META_ACCESS_TOKEN', value: 'HIER_DEIN_TOKEN', type: 'string' },
    { id: 's02', name: 'META_AD_ACCOUNT', value: 'act_HIER_ACCOUNT', type: 'string' },
    { id: 's03', name: 'ANTHROPIC_API_KEY', value: 'sk-ant-HIER_DEIN_KEY', type: 'string' },
    { id: 's04', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's05', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's06', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getAds = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Best Ad 30 Tage', parameters: {
    method: 'GET',
    url: expr("https://graph.instagram.com/v21.0/{{ $('Setup').first().json.META_AD_ACCOUNT }}/insights?metric=spend,results,ctr&date_preset=last_30d&fields=ad_id,name,spend,results,ctr&access_token={{ $('Setup').first().json.META_ACCESS_TOKEN }}"),
    options: {}
  } },
  output: [{ data: [] }]
});

const pick = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Winner ermitteln', parameters: { mode: 'runOnceForAllItems', jsCode: `const ads = $input.first().json.data || [];
const best = ads.filter(a => parseFloat(a.results || 0) > 0)
  .sort((a,b) => (parseFloat(b.results||0)/parseFloat(b.spend||1)) - (parseFloat(a.results||0)/parseFloat(a.spend||1)))[0];
if (!best) return [];
return [{ json: { ad_id: best.ad_id, ad_name: best.name, ctr: (best.ctr || 0).toFixed(2) } }];` } },
  output: [{ ad_id: '' }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Creative Brief', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const ad = $json;
const prompt = 'Du bist Creative Director fuer den Onlineshop "' + setup.SHOP_NAME + '".' + NL +
  'Best-performing Ad (CTR: ' + ad.ctr + '%): "' + ad.ad_name + '"' + NL + NL +
  'Generiere 5 NEUE Creative-Varianten (Teaser-Texte / Headlines fuer Ads):' + NL +
  '1. Angle 1: Emotional/Storytelling' + NL +
  '2. Angle 2: FOMO/Urgency' + NL +
  '3. Angle 3: Benefit-driven' + NL +
  '4. Angle 4: Humor/Entertainment' + NL +
  '5. Angle 5: Social Proof' + NL + NL +
  'Fuer jede Variante: 1-2 Headline + 1 Subheadline (je max 30 Woerter). Deutsch.' + NL +
  'Antworte als sauberes HTML (h3/p), kein Markdown.';
return { json: { prompt } };` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude generiert Creatives', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 2000, messages: [{ role: 'user', content: $json.prompt }] }) }}")
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
  betreff: 'Winning Ad - 5 neue Creative Varianten - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">' + html + '</div>'
}};` } },
  output: [{ betreff: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Creatives an dich', parameters: {
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

export default workflow('winning-ad-creatives', '44 · Winning-Ad→Neue Creatives 🎬✨')
  .add(scheduleTrigger)
  .to(setup)
  .to(getAds)
  .to(pick)
  .to(build)
  .to(claude)
  .to(pack)
  .to(sendMail);
