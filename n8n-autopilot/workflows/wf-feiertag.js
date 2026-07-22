import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Taeglich 07:15', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 7, triggerAtMinute: 15 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'ANTHROPIC_API_KEY', value: 'sk-ant-HIER_DEIN_KEY', type: 'string' },
    { id: 's02', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's03', name: 'SHOP_NISCHE', value: 'z.B. Fitness-Zubehoer fuer Zuhause', type: 'string' },
    { id: 's04', name: 'LAND_CODE', value: 'DE', type: 'string' },
    { id: 's05', name: 'VORLAUF_TAGE', value: '10', type: 'string' },
    { id: 's06', name: 'TELEGRAM_BOT_TOKEN', value: '123456:ABC-HIER_DEIN_BOT_TOKEN', type: 'string' },
    { id: 's07', name: 'TELEGRAM_CHAT_ID', value: 'HIER_DEINE_CHAT_ID', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getHolidays = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Feiertage holen', onError: 'continueRegularOutput', parameters: {
    method: 'GET',
    url: expr("https://date.nager.at/api/v3/PublicHolidays/{{ $now.year }}/{{ $('Setup').first().json.LAND_CODE }}"),
    options: {}
  } },
  output: [{}]
});

const check = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Naher Feiertag', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const vorlauf = parseInt(setup.VORLAUF_TAGE);
let liste = $input.first().json;
if (liste && !Array.isArray(liste) && liste.data) liste = liste.data;
if (!Array.isArray(liste)) liste = [];
const heute = new Date(); heute.setHours(0,0,0,0);
const treffer = [];
for (const h of liste) {
  if (!h.date) continue;
  const d = new Date(h.date + 'T00:00:00');
  const tage = Math.round((d - heute) / 86400000);
  if (tage >= 0 && tage <= vorlauf) treffer.push({ name: h.localName || h.name, tage, datum: h.date });
}
if (treffer.length === 0) {
  return [];
}
treffer.sort((a, b) => a.tage - b.tage);
const t = treffer[0];
const prompt = 'Du bist Marketing-Stratege fuer den Onlineshop "' + setup.SHOP_NAME + '" (Nische: ' + setup.SHOP_NISCHE + ').' + NL + NL +
  'In ' + t.tage + ' Tagen ist "' + t.name + '" (' + t.datum + ').' + NL + NL +
  'Gib mir eine schnelle, konkrete Marketing-Aktion dazu auf Deutsch:' + NL +
  '1. Passt dieser Anlass ueberhaupt zur Nische? (ehrlich - wenn nur schwach, sag wie man trotzdem einen Bezug baut)' + NL +
  '2. EINE konkrete Aktions-Idee (Angebot/Bundle/Rabatt-Code-Vorschlag) mit passendem Timing' + NL +
  '3. EIN fertiger Social-Hook + 1 E-Mail-Betreff' + NL +
  '4. Was JETZT vorbereiten (Countdown: heute noch ' + t.tage + ' Tage)' + NL + NL +
  'Kurz, Klartext ohne Markdown, Emojis als Trenner.';
return [{ json: { prompt, anlass: t.name, tage: t.tage } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude Feiertags-Aktion', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 1200, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const pack = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Nachricht bauen', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const info = $('Naher Feiertag').first().json;
const blocks = ($input.first().json.content) || [];
const idee = (blocks.find(b => b.type === 'text') || {}).text || '';
const text = 'FEIERTAGS-RADAR - ' + setup.SHOP_NAME + NL + 'In ' + info.tage + ' Tagen: ' + info.anlass + NL + '--------------------' + NL + NL + idee;
return [{ json: { telegram_text: text } }];` } },
  output: [{ telegram_text: '' }]
});

const telegram = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Radar aufs Handy', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_BOT_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT_ID, text: $json.telegram_text }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('feiertags-radar', '33 · Feiertags-Radar 🗓️🎉')
  .add(scheduleTrigger)
  .to(setup)
  .to(getHolidays)
  .to(check)
  .to(claude)
  .to(pack)
  .to(telegram);
