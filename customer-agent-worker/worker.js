// Kunden-Chat-Agent für die Website, als Cloudflare Worker.
//
// Warum ein eigener Worker statt direkt aus dem Browser wie Jarvis/Brand
// Assassin/Oracle/Closer? Jene Apps sind BYOK (jeder Nutzer bringt seinen
// EIGENEN Gemini-Key) - für einen Chat, den fremde Website-Besucher
// bedienen, würde das den Key des SHOP-BESITZERS an jeden Besucher
// ausliefern. Deshalb läuft der eigentliche Gemini-Aufruf hier serverseitig:
// der Key steckt nur als Cloudflare-Secret im Worker, nie im Browser.
//
// Läuft über die dauerhaft kostenlose Gemini-API-Stufe (kein Anthropic-Key,
// keine laufenden Kosten) - Schutz gegen Ausschöpfen der kostenlosen Stufe
// durch fremde Besucher (siehe auch GEMINI_MAX_TOKENS_PRO_TAG bei den
// GitHub-Actions-Automationen):
// 1. Pro-Besucher-Rate-Limit (Nachrichten/Stunde) über KV.
// 2. Ein globales Tages-Token-Budget über KV - danach zeigt der Chat eine
//    ehrliche "gerade nicht verfügbar, bitte E-Mail" Nachricht statt einfach
//    stillschweigend weiterzulaufen.
// 3. CORS ist auf explizit erlaubte Shop-Domains beschränkt, damit nicht
//    irgendeine fremde Seite den Worker (und damit den Key) fürs eigene
//    Chat-Frontend mitbenutzt.

const GEMINI_MODEL_DEFAULT = 'gemini-2.0-flash';
const MAX_ANTWORT_TOKENS = 500;
const MAX_NACHRICHTEN_HISTORIE = 12; // letzte N Nachrichten (User+Assistant zusammen)
const MAX_NACHRICHT_ZEICHEN = 1500;
const STOREFRONT_API_VERSION = '2025-01';
const KATALOG_CACHE_KEY = 'katalog:cache';

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

// Holt den aktuellen Produktkatalog über die öffentliche Shopify Storefront
// API (KEIN Admin-API-Key nötig - der Storefront-Token ist von Shopify
// bewusst für die client-seitige Nutzung freigegeben, hier läuft er trotzdem
// serverseitig mit, damit der Worker den Aufruf selbst cachen kann). Ergebnis
// wird in KV zwischengespeichert, damit nicht jede Chat-Nachricht einen
// eigenen Storefront-Aufruf auslöst. Scheitert der Aufruf, gibt die Funktion
// null zurück - der Chat läuft dann einfach ohne Katalog-Kontext weiter,
// bricht aber nie deswegen ab.
async function holeKatalog(env) {
  if (!env.SHOPIFY_STORE_DOMAIN || !env.SHOPIFY_STOREFRONT_TOKEN) return null;

  try {
    const cached = await env.CHAT_STATE.get(KATALOG_CACHE_KEY, 'json');
    if (cached) return cached;

    const maxProdukte = parseInt(env.KATALOG_MAX_PRODUKTE || '25', 10);
    const query = `query Katalog($erste: Int!) {
      products(first: $erste, sortKey: BEST_SELLING) {
        edges { node { title handle description priceRange { minVariantPrice { amount currencyCode } } } }
      }
    }`;

    const res = await fetch(`https://${env.SHOPIFY_STORE_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Shopify-Storefront-Access-Token': env.SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query, variables: { erste: maxProdukte } }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const basisUrl = (env.SHOP_PUBLIC_URL || `https://${env.SHOPIFY_STORE_DOMAIN}`).replace(/\/$/, '');
    const produkte = (data?.data?.products?.edges || [])
      .map(({ node }) => ({
        titel: node.title,
        url: `${basisUrl}/products/${node.handle}`,
        preis: node.priceRange?.minVariantPrice
          ? `${node.priceRange.minVariantPrice.amount} ${node.priceRange.minVariantPrice.currencyCode}`
          : null,
        beschreibung: (node.description || '').slice(0, 140),
      }))
      .filter((p) => p.titel);

    const ttl = parseInt(env.KATALOG_CACHE_TTL_SEKUNDEN || '1800', 10);
    await env.CHAT_STATE.put(KATALOG_CACHE_KEY, JSON.stringify(produkte), { expirationTtl: ttl });
    return produkte;
  } catch (err) {
    console.error('[customer-agent] Katalog-Fetch-Fehler:', err);
    return null;
  }
}

function buildSystemPrompt(env, katalog) {
  const shopName = env.SHOP_NAME || 'diesem Shop';
  const nische = env.SHOP_NISCHE ? ` (${env.SHOP_NISCHE})` : '';
  const versand = env.VERSANDZEIT || 'in der Regel wenige Werktage';
  const retoure = env.RETOURE_TAGE || '14';
  const supportEmail = env.SUPPORT_EMAIL || null;

  const teile = [
    `Du bist der Kunden-Chat-Assistent von "${shopName}"${nische} auf dessen Website. Du bist freundlich, kurz und hilfsbereit, auf Deutsch, Du-Form.`,
    `Allgemeine Shop-Infos, die du nennen darfst: Versandzeit ${versand}. Rückgaberecht ${retoure} Tage.`,
    `Sehr wichtig: Du hast KEINEN Zugriff auf echte Bestelldaten, Kontodaten oder Lagerbestände dieses Gesprächs. Erfinde NIEMALS eine Bestellnummer, einen Lieferstatus, eine Tracking-Nummer. Bei allem, was eine echte Bestellung, ein Konto oder eine Reklamation betrifft, sagst du das ehrlich und verweist an den menschlichen Support${supportEmail ? ` (${supportEmail})` : ''}.`,
    `Halte Antworten kurz (max. 3-4 Sätze), außer der Kunde bittet explizit um mehr Details.`,
  ];

  if (katalog && katalog.length) {
    const zeilen = katalog
      .map((p) => `- ${p.titel}${p.preis ? ` (${p.preis})` : ''}: ${p.url}${p.beschreibung ? ` — ${p.beschreibung}` : ''}`)
      .join('\n');
    teile.push(
      `Aktueller Produktkatalog (echte Preise/Links - empfiehl AUSSCHLIESSLICH Produkte aus dieser Liste, erfinde niemals andere):\n${zeilen}`,
      `Wenn ein Besucher unsicher wirkt, nach einer Empfehlung fragt oder Interesse an einer Kategorie zeigt, schlage aktiv 1-2 passende Produkte aus der Liste oben vor (mit Preis und Link) statt nur abzuwarten. Geh auf typische Kaufeinwände (Preis, Lieferzeit, Vertrauen) ehrlich mit den echten Angaben oben ein - sei dabei beratend, nie aufdringlich oder reißerisch.`,
    );
  } else {
    teile.push(`Bei allgemeinen Fragen zu Produkten, Versand, Rückgabe oder dem Shop allgemein hilfst du direkt und normal weiter.`);
  }

  return teile.join('\n\n');
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

  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Chat ist nicht konfiguriert (GEMINI_API_KEY fehlt)' }), { status: 503, headers: { ...cors, 'content-type': 'application/json' } });
  }

  const katalog = await holeKatalog(env);
  const model = env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT;

  // Gemini kennt keine "assistant"-Rolle wie Anthropic, sondern "model".
  const contents = nachrichten.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: buildSystemPrompt(env, katalog) }] },
        generationConfig: { maxOutputTokens: MAX_ANTWORT_TOKENS },
      }),
    }
  );

  if (!geminiRes.ok) {
    const fehlerText = await geminiRes.text();
    console.error('[customer-agent] Gemini-Fehler:', geminiRes.status, fehlerText);
    return new Response(
      JSON.stringify({ reply: 'Entschuldige, gerade gibt es ein technisches Problem. Bitte versuch es gleich nochmal.' }),
      { status: 200, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }

  const data = await geminiRes.json();
  if (data.usageMetadata) {
    await aktualisiereTagesBudget(env, (data.usageMetadata.promptTokenCount || 0) + (data.usageMetadata.candidatesTokenCount || 0));
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const reply = parts.map((p) => p.text || '').join('').trim() || 'Entschuldige, dazu fällt mir gerade nichts ein.';
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
