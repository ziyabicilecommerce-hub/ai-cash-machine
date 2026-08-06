// Kunden-Chat-Agent für die Website, als Cloudflare Worker.
//
// Warum ein eigener Worker statt direkt aus dem Browser wie Jarvis/Brand
// Assassin/Oracle/Closer? Jene Apps sind BYOK (jeder Nutzer bringt seinen
// EIGENEN Anthropic-Key) - für einen Chat, den fremde Website-Besucher
// bedienen, würde das den Key des SHOP-BESITZERS an jeden Besucher
// ausliefern. Deshalb läuft der eigentliche Claude-Aufruf hier serverseitig:
// der Key steckt nur als Cloudflare-Secret im Worker, nie im Browser.
//
// Schutz gegen Kosten-Explosion durch fremde Besucher (siehe auch
// CLAUDE_MAX_TOKENS_PRO_TAG bei den GitHub-Actions-Automationen):
// 1. Pro-Besucher-Rate-Limit (Nachrichten/Stunde) über KV.
// 2. Ein globales Tages-Token-Budget über KV - danach zeigt der Chat eine
//    ehrliche "gerade nicht verfügbar, bitte E-Mail" Nachricht statt einfach
//    weiter Geld zu verbrennen.
// 3. CORS ist auf explizit erlaubte Shop-Domains beschränkt, damit nicht
//    irgendeine fremde Seite den Worker (und damit den Key) fürs eigene
//    Chat-Frontend mitbenutzt.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';
const MAX_ANTWORT_TOKENS = 500;
const MAX_NACHRICHTEN_HISTORIE = 12; // letzte N Nachrichten (User+Assistant zusammen)
const MAX_NACHRICHT_ZEICHEN = 1500;

function heute() {
  return new Date().toISOString().slice(0, 10);
}

function corsHeaders(origin, erlaubteOrigins) {
  const matched = erlaubteOrigins.includes(origin) ? origin : null;
  if (!matched) return null;
  return {
    'Access-Control-Allow-Origin': matched,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
}

function erlaubteOriginsAus(env) {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

async function pruefeRateLimit(env, besucherId) {
  const limit = parseInt(env.RATE_LIMIT_PRO_STUNDE || '20', 10);
  const stundenBucket = new Date().toISOString().slice(0, 13); // yyyy-mm-ddThh
  const key = `rate:${besucherId}:${stundenBucket}`;
  const aktuell = parseInt((await env.CHAT_STATE.get(key)) || '0', 10);
  if (aktuell >= limit) return false;
  await env.CHAT_STATE.put(key, String(aktuell + 1), { expirationTtl: 3600 });
  return true;
}

async function pruefeTagesBudget(env) {
  const limit = parseInt(env.MAX_TOKENS_PRO_TAG || '200000', 10);
  if (!limit) return true;
  const key = `budget:${heute()}`;
  const bisher = parseInt((await env.CHAT_STATE.get(key)) || '0', 10);
  return bisher < limit;
}

async function aktualisiereTagesBudget(env, tokens) {
  const key = `budget:${heute()}`;
  const bisher = parseInt((await env.CHAT_STATE.get(key)) || '0', 10);
  await env.CHAT_STATE.put(key, String(bisher + tokens), { expirationTtl: 172800 });
}

function buildSystemPrompt(env) {
  const shopName = env.SHOP_NAME || 'diesem Shop';
  const nische = env.SHOP_NISCHE ? ` (${env.SHOP_NISCHE})` : '';
  const versand = env.VERSANDZEIT || 'in der Regel wenige Werktage';
  const retoure = env.RETOURE_TAGE || '14';
  const supportEmail = env.SUPPORT_EMAIL || null;

  return [
    `Du bist der Kunden-Chat-Assistent von "${shopName}"${nische} auf dessen Website. Du bist freundlich, kurz und hilfsbereit, auf Deutsch, Du-Form.`,
    `Allgemeine Shop-Infos, die du nennen darfst: Versandzeit ${versand}. Rückgaberecht ${retoure} Tage.`,
    `Sehr wichtig: Du hast KEINEN Zugriff auf echte Bestelldaten, Kontodaten oder Lagerbestände dieses Gesprächs. Erfinde NIEMALS eine Bestellnummer, einen Lieferstatus, eine Tracking-Nummer oder einen konkreten Preis, den du nicht sicher weißt. Bei allem, was eine echte Bestellung, ein Konto oder eine Reklamation betrifft, sagst du das ehrlich und verweist an den menschlichen Support${supportEmail ? ` (${supportEmail})` : ''}.`,
    `Bei allgemeinen Fragen zu Produkten, Versand, Rückgabe oder dem Shop allgemein hilfst du direkt und normal weiter. Halte Antworten kurz (max. 3-4 Sätze), außer der Kunde bittet explizit um mehr Details.`,
  ].join('\n\n');
}

function bereinigeNachrichten(rohNachrichten) {
  if (!Array.isArray(rohNachrichten)) return [];
  const bereinigt = rohNachrichten
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_NACHRICHT_ZEICHEN) }));
  return bereinigt.slice(-MAX_NACHRICHTEN_HISTORIE);
}

async function handleChat(request, env) {
  const origin = request.headers.get('Origin') || '';
  const erlaubteOrigins = erlaubteOriginsAus(env);
  const cors = corsHeaders(origin, erlaubteOrigins);
  if (!cors) return new Response('Origin nicht erlaubt', { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger Request-Body' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });
  }

  const nachrichten = bereinigeNachrichten(body.messages);
  if (!nachrichten.length || nachrichten[nachrichten.length - 1].role !== 'user') {
    return new Response(JSON.stringify({ error: 'Letzte Nachricht muss vom User sein' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });
  }

  const besucherId = (body.sessionId && String(body.sessionId).slice(0, 100)) || request.headers.get('CF-Connecting-IP') || 'unbekannt';

  const budgetOk = await pruefeTagesBudget(env);
  if (!budgetOk) {
    return new Response(
      JSON.stringify({ reply: `Der Chat ist gerade stark ausgelastet. Bitte schreib uns direkt an${env.SUPPORT_EMAIL ? ` ${env.SUPPORT_EMAIL}` : ' unseren Support'} - wir melden uns schnellstmöglich!` }),
      { status: 200, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }

  const rateOk = await pruefeRateLimit(env, besucherId);
  if (!rateOk) {
    return new Response(
      JSON.stringify({ reply: 'Du hast gerade viele Nachrichten geschickt - bitte warte kurz einen Moment und versuch es dann nochmal.' }),
      { status: 200, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Chat ist nicht konfiguriert (ANTHROPIC_API_KEY fehlt)' }), { status: 503, headers: { ...cors, 'content-type': 'application/json' } });
  }

  const anthropicRes = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_ANTWORT_TOKENS,
      system: buildSystemPrompt(env),
      messages: nachrichten,
    }),
  });

  if (!anthropicRes.ok) {
    const fehlerText = await anthropicRes.text();
    console.error('[customer-agent] Anthropic-Fehler:', anthropicRes.status, fehlerText);
    return new Response(
      JSON.stringify({ reply: 'Entschuldige, gerade gibt es ein technisches Problem. Bitte versuch es gleich nochmal.' }),
      { status: 200, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }

  const data = await anthropicRes.json();
  if (data.usage) {
    await aktualisiereTagesBudget(env, (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0));
  }

  const reply = (data.content || []).map((block) => block.text || '').join('').trim() || 'Entschuldige, dazu fällt mir gerade nichts ein.';
  return new Response(JSON.stringify({ reply }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname === '/chat') {
      const origin = request.headers.get('Origin') || '';
      const cors = corsHeaders(origin, erlaubteOriginsAus(env));
      if (!cors) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === 'POST' && url.pathname === '/chat') {
      return handleChat(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
