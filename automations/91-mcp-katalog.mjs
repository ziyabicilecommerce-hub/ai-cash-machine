// MCP-Katalog - sammelt woechentlich alle oeffentlich gelisteten MCP-Server
// aus der offiziellen MCP-Registry (registry.modelcontextprotocol.io) und
// dem Glama-Verzeichnis, sortiert sie nach Kategorien und markiert, welche
// ohne API-Key / Konto nutzbar sind. Ergebnis landet in mcp-hub/catalog.json
// und wird von der MCP-Hub-Seite angezeigt.
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'mcp-hub/catalog.json';
const MAX_SEITEN = 400;

const KATEGORIEN = [
  ['ki-video', /\b(video|text-to-video|t2v|i2v|runway|kling|veo|sora|luma|pika|hailuo|seedance|wan2|ltx|animat)/i],
  ['ki-bild', /\b(image gen|image-gen|text-to-image|stable diffusion|sdxl|flux|midjourney|dall-?e|ideogram|imagen|comfyui|replicate|fal\.ai|photo edit|background remov|upscal)/i],
  ['ki-audio', /\b(tts|text-to-speech|speech|voice|elevenlabs|music|audio|podcast|transcri|whisper)/i],
  ['social-media', /\b(instagram|tiktok|youtube|facebook|twitter|\bx\.com|threads|bluesky|linkedin|pinterest|reddit|mastodon|social media|metricool|buffer|hootsuite|telegram|discord|whatsapp)/i],
  ['e-commerce', /\b(shopify|woocommerce|amazon|ebay|etsy|stripe|paypal|checkout|e-?commerce|product catalog|inventory|order)/i],
  ['marketing-seo', /\b(seo|marketing|ads|advertis|google ads|meta ads|analytics|campaign|crm|hubspot|mailchimp|newsletter|lead)/i],
  ['email-kommunikation', /\b(email|e-mail|gmail|outlook|smtp|sms|twilio|slack|teams)/i],
  ['web-suche-scraping', /\b(search|scrap|crawl|browser|puppeteer|playwright|firecrawl|web fetch|serp)/i],
  ['finanzen-crypto', /\b(finance|stock|trading|crypto|bitcoin|ethereum|blockchain|defi|wallet|binance|forex|accounting|invoice)/i],
  ['daten-datenbank', /\b(database|postgres|mysql|sqlite|mongodb|redis|supabase|bigquery|snowflake|sql|spreadsheet|sheets|airtable|notion)/i],
  ['ki-llm-agenten', /\b(llm|openai|anthropic|claude|gemini|mistral|ollama|agent|rag|embedding|memory|prompt)/i],
  ['entwicklung', /\b(github|gitlab|git\b|docker|kubernetes|aws|azure|gcp|cloudflare|vercel|netlify|code|devops|ci\/cd|sentry|jira|linear)/i],
  ['produktivitaet', /\b(calendar|todo|task|project|drive|docs|dropbox|obsidian|trello|asana|clickup|zapier|n8n|make\.com)/i],
];

function kategorie(text) {
  for (const [name, re] of KATEGORIEN) if (re.test(text)) return name;
  return 'sonstiges';
}

async function holeJson(url) {
  for (let versuch = 0; versuch < 3; versuch++) {
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'ai-cash-machine-mcp-katalog' } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (versuch + 1)));
      continue;
    }
    throw new Error(`${url} -> HTTP ${res.status}`);
  }
  throw new Error(`${url} -> nach 3 Versuchen fehlgeschlagen`);
}

function brauchtKeyOffiziell(s) {
  const remotes = s.remotes || [];
  const pakete = s.packages || [];
  const remoteMitAuth = remotes.some((r) => (r.headers || []).some((h) => h.isRequired || h.isSecret));
  const paketMitSecret = pakete.some((p) => (p.environmentVariables || []).some((e) => e.isSecret || (e.isRequired && /key|token|secret|password/i.test(e.name || ''))));
  return remoteMitAuth || paketMitSecret;
}

async function offizielleRegistry() {
  const eintraege = new Map();
  let cursor = '';
  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    const url = `https://registry.modelcontextprotocol.io/v0/servers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await holeJson(url);
    for (const item of data.servers || []) {
      const s = item.server || item;
      const meta = (item._meta || {})['io.modelcontextprotocol.registry/official'] || {};
      if (meta.status && meta.status !== 'active') continue;
      if (meta.isLatest === false) continue;
      const remote = (s.remotes || [])[0];
      const paket = (s.packages || [])[0];
      eintraege.set(s.name, {
        n: s.title || s.name,
        id: s.name,
        d: (s.description || '').slice(0, 220),
        q: 'offiziell',
        r: s.repository?.url || '',
        u: remote?.url || '',
        p: paket ? `${paket.registryType || paket.registry_type || ''}:${paket.identifier || paket.name || ''}` : '',
        k: brauchtKeyOffiziell(s) ? 1 : 0,
      });
    }
    cursor = data.metadata?.nextCursor || data.metadata?.next_cursor || '';
    if (!cursor) break;
  }
  return [...eintraege.values()];
}

async function glama() {
  const eintraege = [];
  let after = '';
  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    const url = `https://glama.ai/api/mcp/v1/servers?first=100${after ? `&after=${encodeURIComponent(after)}` : ''}`;
    const data = await holeJson(url);
    for (const s of data.servers || []) {
      const envPflicht = s.environmentVariablesJsonSchema?.required || [];
      eintraege.push({
        n: s.name,
        id: s.namespace ? `${s.namespace}/${s.slug}` : s.id,
        d: (s.description || '').slice(0, 220),
        q: 'glama',
        r: s.repository?.url || '',
        u: s.url || '',
        p: '',
        k: envPflicht.some((e) => /key|token|secret|password/i.test(e)) ? 1 : 0,
      });
    }
    after = data.pageInfo?.hasNextPage ? data.pageInfo.endCursor : '';
    if (!after) break;
  }
  return eintraege;
}

async function main() {
  const quellen = {};
  let alle = [];
  for (const [name, fn] of [['offiziell', offizielleRegistry], ['glama', glama]]) {
    try {
      const liste = await fn();
      quellen[name] = liste.length;
      alle = alle.concat(liste);
      console.log(`[91-mcp-katalog] ${name}: ${liste.length} Server`);
    } catch (err) {
      quellen[name] = `Fehler: ${err.message}`;
      console.log(`[91-mcp-katalog] ${name} fehlgeschlagen: ${err.message}`);
    }
  }

  const gesehen = new Map();
  for (const e of alle) {
    const schluessel = (e.r || e.id || e.n).toLowerCase().replace(/\.git$/, '').replace(/\/$/, '');
    const vorher = gesehen.get(schluessel);
    if (!vorher || (vorher.q === 'glama' && e.q === 'offiziell')) gesehen.set(schluessel, e);
  }
  const server = [...gesehen.values()].map((e) => ({ ...e, c: kategorie(`${e.n} ${e.id} ${e.d}`) }));
  server.sort((a, b) => a.n.localeCompare(b.n));

  if (server.length === 0) throw new Error('Keine MCP-Server gefunden - Katalog wird nicht ueberschrieben.');

  const zaehler = {};
  for (const s of server) zaehler[s.c] = (zaehler[s.c] || 0) + 1;

  mkdirSync('mcp-hub', { recursive: true });
  writeFileSync(OUT, JSON.stringify({ stand: new Date().toISOString(), quellen, anzahl: server.length, ohneKey: server.filter((s) => !s.k).length, kategorien: zaehler, server }));
  console.log(`[91-mcp-katalog] ${server.length} eindeutige Server, ${server.filter((s) => !s.k).length} ohne Key-Pflicht`);
  console.log('[91-mcp-katalog] Kategorien:', JSON.stringify(zaehler));
}

main().catch((err) => {
  console.error('[91-mcp-katalog] Fehler:', err.message);
  process.exit(1);
});
