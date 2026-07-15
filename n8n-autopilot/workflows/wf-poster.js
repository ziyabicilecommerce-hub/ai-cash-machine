import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Taeglich 16:00', parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 16, triggerAtMinute: 0 } ] } } },
  output: [{}]
});

const setup = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Setup', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 's01', name: 'SHOP', value: 'dein-shop-subdomain', type: 'string' },
    { id: 's02', name: 'SHOPIFY_TOKEN', value: 'shpat_HIER_DEIN_TOKEN', type: 'string' },
    { id: 's03', name: 'ANTHROPIC_API_KEY', value: 'sk-ant-HIER_DEIN_KEY', type: 'string' },
    { id: 's04', name: 'SHOP_NAME', value: 'Mein Shop', type: 'string' },
    { id: 's05', name: 'SHOP_URL', value: 'https://meinshop.de', type: 'string' },
    { id: 's06', name: 'SHOP_NISCHE', value: 'z.B. Fitness-Zubehoer fuer Zuhause', type: 'string' },
    { id: 's07', name: 'ZIELGRUPPE', value: 'z.B. Frauen 20-35, sportlich, kaufen ueber TikTok/Insta', type: 'string' },
    { id: 's08', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's09', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' },
    { id: 's10', name: 'TELEGRAM_BOT_TOKEN', value: '123456:ABC-HIER_DEIN_BOT_TOKEN', type: 'string' },
    { id: 's11', name: 'TELEGRAM_CHAT_ID', value: 'HIER_DEINE_CHAT_ID', type: 'string' },
    { id: 's12', name: 'FB_PAGE_ID', value: '', type: 'string' },
    { id: 's13', name: 'FB_PAGE_TOKEN', value: '', type: 'string' },
    { id: 's14', name: 'AUTO_POST_FACEBOOK', value: 'nein', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getOrders = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Bestseller ermitteln', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min={{ encodeURIComponent($now.minus({ days: 14 }).toISO()) }}"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ orders: [] }]
});

const buildPrompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Tages-Thema und Bestseller', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const orders = ($input.first().json.orders || []).filter(o => !o.cancelled_at);
const produkte = {};
for (const o of orders) {
  for (const li of (o.line_items || [])) produkte[li.title] = (produkte[li.title] || 0) + li.quantity;
}
const top = Object.entries(produkte).sort((a, b) => b[1] - a[1]).slice(0, 3).map(function(e) { return e[0]; });
const topText = top.length ? top.join(', ') : '(noch keine Verkaeufe - nutze die Nische)';
const themen = [
  'Ergebnis/Transformation zeigen',
  'Haeufigster Fehler der Zielgruppe',
  'Produkt im Alltag (POV-Style)',
  'Frage/Debatte starten (Engagement)',
  'Mini-Tutorial mit dem Produkt',
  'Kundenstimme/Review nacherzaehlen',
  'Zahlen/Fakten, die ueberraschen'
];
const thema = themen[new Date().getDay()];
const prompt = 'Du bist Multi-Plattform-Social-Media-Manager fuer den Onlineshop "' + setup.SHOP_NAME + '" (Nische: ' + setup.SHOP_NISCHE + ', Zielgruppe: ' + setup.ZIELGRUPPE + ', Shop: ' + setup.SHOP_URL + ').' + NL +
  'Bestseller: ' + topText + NL + 'Kern-Thema heute: ' + thema + NL + NL +
  'Erstelle das komplette Posting-Paket fuer HEUTE - EIN Kern-Inhalt, fuer jede Plattform nativ uebersetzt (nicht kopiert!), alles auf Deutsch:' + NL + NL +
  '1. TIKTOK: Hook (max 10 Woerter) + 20-30s Skript (Szene fuer Szene) + 4 Hashtags + Sound-Idee' + NL +
  '2. INSTAGRAM REEL: Angepasster Hook + Caption mit CTA + 5 Hashtags' + NL +
  '3. INSTAGRAM STORY: 2-Slide-Idee mit Interaktions-Sticker (Umfrage/Slider)' + NL +
  '4. FACEBOOK: Laengerer Post (60-100 Woerter, Story-Stil, 1 Emoji-Absatztrenner, Link zum Shop)' + NL +
  '5. PINTEREST: Pin-Titel (max 60 Zeichen) + Beschreibung (max 200 Zeichen, SEO-Keywords der Nische)' + NL +
  '6. YOUTUBE SHORT: Titel + 25s Skript (kann das TikTok-Skript adaptieren)' + NL +
  '7. X/TWITTER: 2 Tweets (einer frech/meinungsstark, einer mit Mehrwert)' + NL + NL +
  'Antworte NUR mit validem JSON, ohne Markdown:' + NL +
  '{"facebook_post": "<nur der reine Facebook-Text>", "html": "<das GESAMTE Paket als sauberes HTML mit h2 pro Plattform, copy-paste-freundlich, ohne html/body-Geruest>"}';
return [{ json: { prompt, thema } }];` } },
  output: [{ prompt: '' }]
});

const claudePosts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude baut alle Posts', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 4000, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const parsePosts = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Paket verpacken', parameters: { mode: 'runOnceForEachItem', jsCode: `const NL = String.fromCharCode(10);
const blocks = $json.content || [];
const text = (blocks.find(b => b.type === 'text') || {}).text || '';
let daten;
const s = text.indexOf('{');
const e = text.lastIndexOf('}');
try { daten = JSON.parse(text.slice(s, e + 1)); } catch (err) { daten = { facebook_post: '', html: '<pre style="white-space:pre-wrap;font-family:sans-serif;">' + text + '</pre>' }; }
const setup = $('Setup').first().json;
const thema = $('Tages-Thema und Bestseller').item.json.thema;
const autoHinweis = (setup.AUTO_POST_FACEBOOK === 'ja' && setup.FB_PAGE_ID) ? NL + NL + 'Facebook-Post geht automatisch raus!' : '';
return { json: {
  betreff: 'Dein Posting-Paket fuer heute (' + thema + ')',
  email_html: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">' + daten.html + '</div>',
  facebook_post: daten.facebook_post || '',
  telegram_text: 'MULTI-PLATTFORM-POSTER - ' + setup.SHOP_NAME + NL + NL + 'Dein Posting-Paket fuer heute (' + thema + ') liegt im Postfach!' + NL + '7 Plattformen, copy-paste-fertig: TikTok, IG Reel + Story, Facebook, Pinterest, YouTube Short, X.' + autoHinweis
}};` } },
  output: [{ facebook_post: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Paket per E-Mail', parameters: {
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

const telegramInfo = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Info aufs Handy', parameters: {
    method: 'POST',
    url: expr("https://api.telegram.org/bot{{ $('Setup').first().json.TELEGRAM_BOT_TOKEN }}/sendMessage"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ chat_id: $('Setup').first().json.TELEGRAM_CHAT_ID, text: $json.telegram_text }) }}")
  } },
  output: [{ ok: true }]
});

const fbGate = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Auto-Post erlaubt', parameters: { mode: 'runOnceForAllItems', jsCode: `const setup = $('Setup').first().json;
const daten = $('Paket verpacken').first().json;
if (setup.AUTO_POST_FACEBOOK !== 'ja') return [];
if (!setup.FB_PAGE_ID || !setup.FB_PAGE_TOKEN) return [];
if (!daten.facebook_post) return [];
return [{ json: { facebook_post: daten.facebook_post } }];` } },
  output: [{ facebook_post: '' }]
});

const fbPost = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Facebook automatisch posten', parameters: {
    method: 'POST',
    url: expr("https://graph.facebook.com/v21.0/{{ $('Setup').first().json.FB_PAGE_ID }}/feed"),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ message: $json.facebook_post, access_token: $('Setup').first().json.FB_PAGE_TOKEN }) }}")
  } },
  output: [{ id: '' }]
});

export default workflow('multi-plattform-poster', '18 · Multi-Plattform-Poster 🌍📣')
  .add(scheduleTrigger)
  .to(setup)
  .to(getOrders)
  .to(buildPrompt)
  .to(claudePosts)
  .to(parsePosts)
  .to(sendMail)
  .to(telegramInfo)
  .to(fbGate)
  .to(fbPost);
