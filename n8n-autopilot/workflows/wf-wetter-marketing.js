import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Täglich 06:30', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 6, triggerAtMinute: 30 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'ANTHROPIC_API_KEY', value: 'sk-ant-HIER_DEIN_KEY', type: 'string' },
    { id: 's02', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's03', name: 'SHOP_NISCHE', value: 'z.B. Fitness-Zubehoer', type: 'string' },
    { id: 's04', name: 'STADT', value: 'Berlin', type: 'string' },
    { id: 's05', name: 'LAT', value: '52.52', type: 'string' },
    { id: 's06', name: 'LON', value: '13.41', type: 'string' },
    { id: 's07', name: 'TELEGRAM_TOKEN', value: 'HIER_TOKEN', type: 'string' },
    { id: 's08', name: 'TELEGRAM_CHAT', value: 'HIER_CHAT', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getWeather = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Wetter abrufen', parameters: {
    method: 'GET',
    url: expr("https://api.open-meteo.com/v1/forecast?latitude={{ $('Setup').first().json.LAT }}&longitude={{ $('Setup').first().json.LON }}&current=temperature_2m,weather_code&forecast_days=3&daily=temperature_2m_max,weather_code"),
    options: {}
  } },
  output: [{ current: {} }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Wetter-Prompt bauen', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const data = $input.first().json;
const temp = (data.current || {}).temperature_2m;
const code = (data.current || {}).weather_code;
const codes = { 0: 'klar/sonnig', 1: 'überwiegend klar', 2: 'teilweise bewölkt', 3: 'bewölkt', 45: 'neblig', 51: 'leichter Regen', 61: 'Regen', 71: 'Schnee', 80: 'Schauer', 95: 'Gewitter' };
const wetterText = codes[code] || 'wechselhaft';
const prompt = 'Du bist Wetter-Marketing-Experte für den Onlineshop "' + setup.SHOP_NAME + '" (Nische: ' + setup.SHOP_NISCHE + ').' + NL + NL +
  'Aktuelles Wetter in ' + setup.STADT + ': ' + temp + '°C, ' + wetterText + NL + NL +
  'Gib mir auf Deutsch:' + NL +
  '1. Passt dieses Wetter zu einem Marketing-Anlass für die Nische? (ehrlich einschätzen)' + NL +
  '2. Falls ja: EINE konkrete Aktion (Rabatt, Bundle, Social-Post) mit Wetter-Bezug' + NL +
  '3. Ein fertiger Social-Media-Post-Text (kurz, mit Wetter-Hook)' + NL +
  '4. Falls das Wetter NICHT relevant ist: sag das kurz, keine erzwungene Aktion' + NL + NL +
  'Kurz, Klartext, keine Emojis-Übertreibung.';
return [{ json: { prompt, temp, wetterText } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude Wetter-Idee', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 1000, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const pack = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Nachricht bauen', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const info = $('Wetter-Prompt bauen').first().json;
const blocks = ($input.first().json.content) || [];
const idee = (blocks.find(b => b.type === 'text') || {}).text || '';
const text = 'WETTER-MARKETING - ' + setup.SHOP_NAME + NL + info.temp + '°C, ' + info.wetterText + ' in ' + setup.STADT + NL + '--------------------' + NL + NL + idee;
return [{ json: { telegram_text: text } }];` } },
  output: [{ telegram_text: '' }]
});

const telegram = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Idee aufs Handy', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT, text: $json.telegram_text }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('wetter-marketing', '25 · Wetter-Marketing 🌦️📣')
  .add(scheduleTrigger)
  .to(setup)
  .to(getWeather)
  .to(build)
  .to(claude)
  .to(pack)
  .to(telegram);
