import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Monatlich am 10. um 10:00', parameters: { rule: { interval: [ { field: 'months', monthsInterval: 1, triggerAtDay: 10, triggerAtHour: 10, triggerAtMinute: 0 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'ANTHROPIC_API_KEY', value: 'sk-ant-HIER_DEIN_KEY', type: 'string' },
    { id: 's02', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's03', name: 'SHOP_NISCHE', value: 'z.B. Fitness-Zubehoer', type: 'string' },
    { id: 's04', name: 'ZIELGRUPPE', value: 'z.B. Frauen 20-35, sportlich', type: 'string' },
    { id: 's05', name: 'BUDGET', value: '1000-5000', type: 'string' },
    { id: 's06', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's07', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Anforderungen definieren', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const prompt = 'Du bist Influencer-Marketing-Experte fuer den Onlineshop "' + setup.SHOP_NAME + '".' + NL +
  'Nische: ' + setup.SHOP_NISCHE + ', Zielgruppe: ' + setup.ZIELGRUPPE + ', Budget: ' + setup.BUDGET + ' EUR' + NL + NL +
  'Erstelle auf Deutsch eine konkrete Influencer-Scouting-Strategie:' + NL +
  '1. Welche 3 Plattformen sind sinnvoll? (TikTok/Instagram/YouTube/Pinterest)' + NL +
  '2. Ideales Influencer-Profil: Follower-Größe, Engagement-Rate, Content-Typ' + NL +
  '3. Die 5 besten Suchbegriffe / Hashtags um passende Creator zu finden' + NL +
  '4. Konkrete Pitch-Vorlage: Was schreiben an den Influencer (Deutsch)?' + NL +
  '5. Performance-KPIs: Woran erkennt man einen erfolgreichen Deal?' + NL + NL +
  'Antworte als sauberes HTML (h3/p/ul), ohne html/body-Geruest, kein Markdown.';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude Influencer-Strategie', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 3000, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const pack = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Strategie verpacken', parameters: { mode: 'runOnceForEachItem', jsCode: `const blocks = $json.content || [];
const html = (blocks.find(b => b.type === 'text') || {}).text || '';
const setup = $('Setup').first().json;
return { json: {
  betreff: 'Influencer-Scouting-Strategie - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">' + html + '</div>'
}};` } },
  output: [{ betreff: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Strategie an dich', parameters: {
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

export default workflow('influencer-match-finder', '40 · Influencer-Match-Finder 🌟👥')
  .add(scheduleTrigger)
  .to(setup)
  .to(build)
  .to(claude)
  .to(pack)
  .to(sendMail);
