import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Täglich 13:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 13, triggerAtMinute: 0 } ] } } },
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
  config: { name: 'Neue Reviews ohne Antwort', parameters: {
    method: 'GET',
    url: expr("https://api.judge.me/v1/reviews?shop_id={{ $('Setup').first().json.SHOP_ID }}&per_page=10&api_key={{ $('Setup').first().json.JUDGE_ME_API_KEY }}"),
    options: {}
  } },
  output: [{ reviews: [] }]
});

const filter = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Unbeantwortete finden', parameters: { mode: 'runOnceForAllItems', jsCode: `const sd = $getWorkflowStaticData('global');
sd.beantwortet = sd.beantwortet || [];
const reviews = ($input.first().json.reviews || []).filter(r => !r.reply);
const raus = [];
for (const r of reviews) {
  if (sd.beantwortet.includes(r.id)) continue;
  sd.beantwortet.push(r.id);
  raus.push({ json: { id: r.id, rating: r.rating, titel: r.title || '', text: r.body || '', name: (r.reviewer || {}).name || 'Kunde' } });
}
if (sd.beantwortet.length > 5000) sd.beantwortet = sd.beantwortet.slice(-5000);
return raus;` } },
  output: [{ text: '' }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Antwort-Prompt bauen', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const r = $json;
const ton = r.rating >= 4 ? 'dankbar und warm' : 'einfühlsam, lösungsorientiert, nicht defensiv';
const prompt = 'Du antwortest im Namen des Shops "' + setup.SHOP_NAME + '" auf eine Kundenbewertung.' + NL +
  'Bewertung (' + r.rating + '/5 Sterne) von ' + r.name + ': "' + r.titel + ' - ' + r.text + '"' + NL + NL +
  'Schreibe eine kurze, öffentliche Antwort auf Deutsch (max 60 Wörter), Ton: ' + ton + '.' + NL +
  (r.rating <= 3 ? 'Biete konkrete Hilfe an (z.B. Kontakt zum Support) und entschuldige dich ehrlich, ohne zu jammern.' : 'Bedanke dich persönlich und lade zum Wiederkommen ein.') + NL + NL +
  'Antworte NUR mit dem reinen Antworttext, kein JSON, kein Markdown.';
return { json: { id: r.id, rating: r.rating, name: r.name, prompt } };` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude schreibt Antwort', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 500, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const pack = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Antworten sammeln', parameters: { mode: 'runOnceForEachItem', jsCode: `const blocks = $json.content || [];
const antwort = (blocks.find(b => b.type === 'text') || {}).text || '';
const orig = $('Antwort-Prompt bauen').item.json;
return { json: { id: orig.id, name: orig.name, rating: orig.rating, antwort } };` } },
  output: [{ antwort: '' }]
});

const report = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Report für Freigabe', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const items = $input.all();
let html = '<h2>' + items.length + ' Review-Antworten (zur Freigabe/manuellen Veröffentlichung)</h2>';
for (const item of items) {
  const j = item.json;
  html += '<p><b>' + j.name + '</b> (' + j.rating + '⭐)<br/>Antwort: ' + j.antwort + '</p><hr/>';
}
return [{ json: {
  betreff: 'Review-Antworten bereit - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">' + html + '</div>'
}}];` } },
  output: [{ betreff: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Antworten an dich', parameters: {
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

export default workflow('bewertungs-antwort-bot', '30 · Bewertungs-Antwort-Bot ⭐💬')
  .add(scheduleTrigger)
  .to(setup)
  .to(getReviews)
  .to(filter)
  .to(build)
  .to(claude)
  .to(pack)
  .to(report)
  .to(sendMail);
