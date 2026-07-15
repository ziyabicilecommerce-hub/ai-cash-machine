import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Donnerstags 08:00', parameters: { rule: { interval: [ { field: 'weeks', weeksInterval: 1, triggerAtDay: [4], triggerAtHour: 8, triggerAtMinute: 0 } ] } } },
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
    { id: 's05', name: 'SHOP_NISCHE', value: 'z.B. Fitness-Zubehoer fuer Zuhause', type: 'string' },
    { id: 's06', name: 'VERSANDZEIT', value: '2-4 Werktage', type: 'string' },
    { id: 's07', name: 'RETOURE_TAGE', value: '14', type: 'string' },
    { id: 's08', name: 'ABSENDER_EMAIL', value: 'hallo@meinshop.de', type: 'string' },
    { id: 's09', name: 'OWNER_EMAIL', value: 'deine@email.de', type: 'string' }
  ] } } },
  output: [{ SHOP_NAME: 'Mein Shop' }]
});

const getProducts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Produkte holen', parameters: {
    method: 'GET',
    url: expr("https://{{ $('Setup').first().json.SHOP }}.myshopify.com/admin/api/2024-10/products.json?limit=50&fields=id,title,product_type,tags"),
    sendHeaders: true,
    specifyHeaders: 'keypair',
    headerParameters: { parameters: [ { name: 'X-Shopify-Access-Token', value: expr("{{ $('Setup').first().json.SHOPIFY_TOKEN }}") } ] }
  } },
  output: [{ products: [] }]
});

const build = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Prompt bauen', parameters: { mode: 'runOnceForAllItems', jsCode: `const NL = String.fromCharCode(10);
const setup = $('Setup').first().json;
const produkte = ($input.first().json.products || []).slice(0, 20).map(p => '- ' + p.title + (p.product_type ? ' (' + p.product_type + ')' : ''));
const prompt = 'Du bist Conversion-Texter fuer den Onlineshop "' + setup.SHOP_NAME + '" (Nische: ' + setup.SHOP_NISCHE + ').' + NL + NL +
  'Shop-Fakten:' + NL + '- Versandzeit: ' + setup.VERSANDZEIT + NL + '- Rueckgaberecht: ' + setup.RETOURE_TAGE + ' Tage' + NL + NL +
  'Produkt-Auszug:' + NL + produkte.join(NL) + NL + NL +
  'Erstelle eine komplette, verkaufsfoerdernde FAQ-Sektion auf Deutsch (Du-Form) fuer diesen Shop:' + NL +
  '- 10-12 haeufige Fragen, die Kunden dieser Nische VOR dem Kauf wirklich haben (Versand, Retoure, Groesse/Passform, Material/Qualitaet, Anwendung, Zahlung, Garantie, Nachhaltigkeit...)' + NL +
  '- Jede Antwort kurz, ehrlich, Einwand-aufloesend und vertrauensbildend (nutze die Shop-Fakten)' + NL +
  '- Formuliere so, dass Antworten Kaufhemmungen abbauen, nicht nur informieren' + NL + NL +
  'Antworte als sauberes, copy-paste-fertiges HTML (jede Frage als <h3>, Antwort als <p>), das man direkt in eine Shopify-Seite einsetzen kann. Ohne html/body-Geruest, kein Markdown-Codeblock.';
return [{ json: { prompt } }];` } },
  output: [{ prompt: '' }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Claude baut FAQ', parameters: {
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
    jsonBody: expr("{{ JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 3500, messages: [{ role: 'user', content: $json.prompt }] }) }}")
  } },
  output: [{ content: [] }]
});

const pack = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'FAQ verpacken', parameters: { mode: 'runOnceForEachItem', jsCode: `const blocks = $json.content || [];
const html = (blocks.find(b => b.type === 'text') || {}).text || '';
const setup = $('Setup').first().json;
const hinweis = '<div style="background:#fff7ed;border:1px solid #f97316;padding:12px;border-radius:8px;font-family:sans-serif;font-size:13px;margin-bottom:20px;">FAQ-Bauer: fertige FAQ unten. In Shopify unter Seiten eine Seite \"Haeufige Fragen\" anlegen, HTML einfuegen, im Menue/Footer verlinken.</div>';
return { json: {
  betreff: 'Fertige FAQ-Sektion - ' + setup.SHOP_NAME,
  email_html: '<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">' + hinweis + html + '</div>'
}};` } },
  output: [{ betreff: '' }]
});

const sendMail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'FAQ an dich', parameters: {
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

export default workflow('faq-bauer', '36 · FAQ-Bauer ❓🛠️')
  .add(scheduleTrigger)
  .to(setup)
  .to(getProducts)
  .to(build)
  .to(claude)
  .to(pack)
  .to(sendMail);
