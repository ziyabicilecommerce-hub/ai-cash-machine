import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Taeglich 06:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 6, triggerAtMinute: 0 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'ANTHROPIC_API_KEY', value: 'sk-ant-HIER_DEIN_KEY', type: 'string' },
    { id: 's02', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's03', name: 'KONKURRENT_URLS', value: 'https://konkurrent1.de/products/produkt-a, https://konkurrent2.de/products/produkt-b', type: 'string' },
    { id: 's04', name: 'TELEGRAM_BOT_TOKEN', value: '123456:ABC-HIER_DEIN_BOT_TOKEN', type: 'string' },
    { id: 's05', name: 'TELEGRAM_CHAT_ID', value: 'HIER_DEINE_CHAT_ID', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const splitUrls = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'URLs aufteilen', parameters: { mode: 'runOnceForAllItems', jsCode: `const setup = $('Setup').first().json;
const urls = (setup.KONKURRENT_URLS || '').split(',').map(u => u.trim()).filter(u => u.startsWith('http'));
return urls.map(function(url) { return { json: { url } }; });` } },
  output: [{ url: '' }]
});

const fetchPage = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Konkurrenz-Seite laden', onError: 'continueRegularOutput', parameters: {
    method: 'GET',
    url: expr("{{ $json.url }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' } ] },
    options: { response: { response: { responseFormat: 'text' } } }
  } },
  output: [{ data: '' }]
});

const prepPage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Seite aufbereiten', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const url = $('URLs aufteilen').item.json.url;
const html = ($json.data || '').toString();
const text = html
  .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
  .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\\s+/g, ' ')
  .slice(0, 12000);
const prompt = 'Hier der Textinhalt einer Produktseite eines Konkurrenten (' + url + '):' + NL + NL + text + NL + NL +
  'Extrahiere: Produktname und aktueller Verkaufspreis (der Preis, den ein Kunde JETZT zahlen wuerde - bei Streichpreisen der reduzierte). Falls ein Rabatt/Sale erkennbar ist, nenne ihn.' + NL +
  'Antworte NUR mit validem JSON, ohne Markdown: {"produkt": "...", "preis": "29.99", "waehrung": "EUR", "sale": "ja|nein", "sale_info": "..."}' + NL +
  'Wenn kein Preis erkennbar ist: {"produkt": "unbekannt", "preis": "", "waehrung": "", "sale": "nein", "sale_info": ""}';
return { json: { url, prompt } };` } },
  output: [{ url: '' }]
});

const claudeExtract = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude liest den Preis', parameters: {
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

const comparePrices = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preise vergleichen', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const sd = $getWorkflowStaticData('global');
sd.preise = sd.preise || {};
const eingaben = $('Seite aufbereiten').all();
const antworten = $input.all();
const zeilen = [];
let alarm = false;
for (let i = 0; i < antworten.length; i++) {
  const url = (eingaben[i] || { json: {} }).json.url || '?';
  const blocks = antworten[i].json.content || [];
  const text = (blocks.find(b => b.type === 'text') || {}).text || '';
  let d;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  try { d = JSON.parse(text.slice(s, e + 1)); } catch (err) { d = { produkt: 'unbekannt', preis: '', sale: 'nein', sale_info: '' }; }
  const alt = sd.preise[url];
  const neu = d.preis;
  let zeile = '- ' + d.produkt + NL + '  ' + (neu ? neu + ' ' + (d.waehrung || '') : 'Preis nicht lesbar');
  if (alt && neu && alt !== neu) {
    const altF = parseFloat(alt); const neuF = parseFloat(neu);
    const pfeil = neuF < altF ? 'GESENKT' : 'ERHOEHT';
    zeile += NL + '  ' + pfeil + ': vorher ' + alt + ' -> jetzt ' + neu;
    alarm = true;
  }
  if (d.sale === 'ja') { zeile += NL + '  SALE: ' + (d.sale_info || 'aktiv'); alarm = true; }
  zeile += NL + '  ' + url;
  zeilen.push(zeile);
  if (neu) sd.preise[url] = neu;
}
const setup = $('Setup').first().json;
const kopf = (alarm ? 'PREIS-SPION: BEWEGUNG BEI DER KONKURRENZ!' : 'PREIS-SPION: Alles ruhig.') + NL + setup.SHOP_NAME + NL + '--------------------' + NL + NL;
return [{ json: { telegram_text: kopf + zeilen.join(NL + NL) } }];` } },
  output: [{ telegram_text: '' }]
});

const telegramPrices = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Spionage-Bericht aufs Handy', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_BOT_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT_ID, text: $json.telegram_text }) }}")
  } },
  output: [{ ok: true }]
});

export default workflow('preis-spion', '14 · Preis-Spion 🕵️💶')
  .add(scheduleTrigger)
  .to(setup)
  .to(splitUrls)
  .to(fetchPage)
  .to(prepPage)
  .to(claudeExtract)
  .to(comparePrices)
  .to(telegramPrices);
