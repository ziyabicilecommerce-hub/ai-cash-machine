import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Freitags 08:00', parameters: { rule: { interval: [ { field: 'weeks', weeksInterval: 1, triggerAtDay: [5], triggerAtHour: 8, triggerAtMinute: 0 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'JUDGE_ME_API_KEY', value: 'HIER_DEIN_KEY', type: 'string' },
    { id: 's02', name: 'SHOP_ID', value: 'HIER_SHOP_ID', type: 'string' },
    { id: 's03', name: 'ANTHROPIC_API_KEY', value: 'sk-ant-HIER_DEIN_KEY', type: 'string' },
    { id: 's04', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's05', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's06', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getReviews = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Reviews 4-5 Sterne', parameters: {
    method: 'GET',
    url: expr("https://api.judge.me/v1/reviews?shop_id={{ $('Setup').first().json.SHOP_ID }}&rating_min=4&limit=10&api_key={{ $('Setup').first().json.JUDGE_ME_API_KEY }}"),
    options: {}
  } },
  output: [{ reviews: [] }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Reviews zusammenfassen', parameters: { mode: 'runOnceForAllItems', jsCode: `const reviews = ($input.first().json.reviews || []).slice(0, 5).map(r =>
  '- "' + (r.title || r.body || '').substring(0, 60) + '" (' + r.rating + '⭐ von ' + r.reviewer.name + ')'
).join(NL);
const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const prompt = 'Du bist Social Media Content Creator fuer den Shop "' + setup.SHOP_NAME + '".' + NL + NL +
  'Hier sind die besten Kunden-Bewertungen:' + NL + reviews + NL + NL +
  'Erstelle auf Deutsch:' + NL +
  '1. 3x Ad-Teaser für Meta/TikTok Ads (aus Reviews extrahiert, max 30 Woerter je)' + NL +
  '2. 2x Social Media Posts (LinkedIn/Instagram Caption, max 100 Woerter)' + NL +
  '3. 1x Testimonial HTML Block (für Website einzufügen)' + NL + NL +
  'Antworte als sauberes HTML (h3/p/blockquote), kein Markdown.';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude Content Generator', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 2500, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const pack = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Content verpacken', parameters: { mode: 'runOnceForEachItem', jsCode: `const blocks = $json.content || [];
const html = (blocks.find(b => b.type === 'text') || {}).text || '';
const setup = $('Setup').first().json;
return { json: {
  betreff: 'Review→Ads Content Kit - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">' + html + '</div>'
}};` } },
  output: [{ betreff: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Content an dich', parameters: {
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

export default workflow('review-zu-werbung', '48 · Review→Ads Content Kit ⭐📱')
  .add(scheduleTrigger)
  .to(setup)
  .to(getReviews)
  .to(build)
  .to(claude)
  .to(pack)
  .to(sendMail);
