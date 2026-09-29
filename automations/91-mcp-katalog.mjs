// MCP-Katalog - sammelt woechentlich alle oeffentlich gelisteten MCP-Server
// aus der offiziellen MCP-Registry (registry.modelcontextprotocol.io),
// GitHub-Topics, npm, PyPI, dem Docker-MCP-Katalog, den Awesome-MCP-Listen sowie
// international Smithery, Hugging Face, Docker Hub, NuGet, crates.io, Packagist,
// RubyGems, Maven Central, GitLab und Codeberg, fuehrt Duplikate zusammen,
// sortiert sie nach Kategorien und markiert, welche laut Registry-Eintrag
// keinen API-Key verlangen (OAuth-Logins stehen dort oft nicht drin). Ergebnis landet in mcp-hub/catalog.json
// und wird von der MCP-Hub-Seite angezeigt.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { githubTopics, npmPakete, pypiPakete, dockerKatalog, awesomeListen, repoSchluessel } from './lib/mcpQuellen.mjs';
import { smithery, huggingface, dockerHub, nuget, crates, packagist, rubygems, maven, gitlab, codeberg } from './lib/mcpQuellen2.mjs';

const OUT = 'mcp-hub/catalog.json';
const MAX_SEITEN = 400;
const ZEIT_BUDGET_MIN = Number(process.env.MCP_ZEIT_BUDGET_MIN || 40);

const KATEGORIEN = [
  ['ki-video', /\b(video|text-to-video|t2v|i2v|runway|kling|veo|sora|luma|pika|hailuo|seedance|wan2|ltx|animat)/i],
  ['ki-bild', /(generat\w* (an )?images?|images? generat|image edit|\bimage gen|image-gen|text-to-image|stable diffusion|sdxl|flux|midjourney|dall-?e|ideogram|imagen|comfyui|replicate|fal\.ai|photo edit|background remov|upscal)/i],
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
        d: (s.description || '').replace(/\s+/g, ' ').trim().slice(0, 140),
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

function zusammenfuehren(alle) {
  const gesehen = new Map();
  for (const e of alle) {
    const schluessel = repoSchluessel(e.r) || `${e.q}:${(e.id || e.n || '').toLowerCase()}`;
    const v = gesehen.get(schluessel);
    if (!v) {
      gesehen.set(schluessel, { ...e, q: [e.q] });
      continue;
    }
    if (!v.q.includes(e.q)) v.q.push(e.q);
    if (e.q === 'offiziell') Object.assign(v, { n: e.n, id: e.id, k: e.k, d: e.d || v.d });
    for (const f of ['d', 'u', 'p', 'r', 'id']) if (!v[f] && e[f]) v[f] = e[f];
    if ((e.s || 0) > (v.s || 0)) v.s = e.s;
    if (v.k === 2 && e.k !== 2) v.k = e.k;
  }
  return [...gesehen.values()];
}

// Gleicher Schluessel wie in 93-mcp-analyse.mjs (npm-/PyPI-Paket, sonst GitHub-Repo).
function analyseSchluessel(s) {
  if (s.p?.startsWith('npm:')) return s.p;
  if (s.p?.startsWith('pypi:')) return `pypi:${s.p.slice(5).toLowerCase()}`;
  const m = (s.r || '').match(/github\.com\/([^/\s#?]+)\/([^/\s#?]+)/i);
  return m ? `gh:${m[1]}/${m[2].replace(/\.git$/i, '')}`.toLowerCase() : null;
}

// Laut Paket-Analyse (#93) "unklar" (0) oder "starkes Warnsignal" (3) -> fliegt raus.
function aussortieren(server) {
  if (!existsSync('mcp-hub/analyse.json')) return { server, weg: 0 };
  const e = JSON.parse(readFileSync('mcp-hub/analyse.json', 'utf8')).e || {};
  const behalten = server.filter((s) => { const k = analyseSchluessel(s); const st = k ? e[k]?.[0] : undefined; return st !== 0 && st !== 3; });
  return { server: behalten, weg: server.length - behalten.length };
}

function kompakt(e) {
  const o = { n: e.n, c: e.c, q: e.q.join(','), k: e.k };
  if (e.id && e.id !== e.n) o.id = e.id;
  for (const f of ['d', 'r', 'u', 'p']) if (e[f]) o[f] = e[f];
  if (e.s) o.s = e.s;
  return o;
}

async function main() {
  const quellen = {};
  let alle = [];
  const token = process.env.GITHUB_TOKEN || '';
  const deadline = Date.now() + ZEIT_BUDGET_MIN * 60 * 1000;
  const quellenListe = [
    ['offiziell', offizielleRegistry], ['docker', () => dockerKatalog(token)],
    ['awesome', awesomeListen], ['npm', npmPakete], ['pypi', pypiPakete],
    ['smithery', smithery], ['huggingface', huggingface], ['dockerhub', dockerHub], ['nuget', nuget], ['crates', crates],
    ['packagist', packagist], ['rubygems', rubygems], ['maven', maven], ['gitlab', gitlab], ['codeberg', codeberg],
    ['github', () => githubTopics(token, deadline)],
  ];
  for (const [name, fn] of quellenListe) {
    try {
      const liste = await fn();
      quellen[name] = liste.length;
      if (liste.zeitlimit) quellen[`${name}-zeitlimit`] = `nach ${ZEIT_BUDGET_MIN} Min. gestoppt`;
      alle = alle.concat(liste);
      console.log(`[91-mcp-katalog] ${name}: ${liste.length} Server`);
    } catch (err) {
      quellen[name] = `Fehler: ${err.message}`;
      console.log(`[91-mcp-katalog] ${name} fehlgeschlagen: ${err.message}`);
    }
  }

  const sortiert = aussortieren(zusammenfuehren(alle).filter((e) => e.n));
  quellen.aussortiert = sortiert.weg;
  console.log(`[91-mcp-katalog] ${sortiert.weg} unklare/gefaehrliche Server aussortiert`);
  const server = sortiert.server
    .map((e) => ({ ...e, c: kategorie(`${e.n} ${e.id || ''} ${e.d || ''}`) }));
  server.sort((a, b) => (b.s || 0) - (a.s || 0) || (b.q.includes('offiziell') - a.q.includes('offiziell')) || a.n.localeCompare(b.n));

  if (server.length === 0) throw new Error('Keine MCP-Server gefunden - Katalog wird nicht ueberschrieben.');

  const zaehler = {};
  for (const s of server) zaehler[s.c] = (zaehler[s.c] || 0) + 1;

  mkdirSync('mcp-hub', { recursive: true });
  writeFileSync(OUT, JSON.stringify({ stand: new Date().toISOString(), quellen, anzahl: server.length, ohneKey: server.filter((s) => s.k === 0).length, kategorien: zaehler, server: server.map(kompakt) }));
  console.log(`[91-mcp-katalog] ${server.length} eindeutige Server, ${server.filter((s) => s.k === 0).length} ohne Key-Pflicht`);
  console.log('[91-mcp-katalog] Kategorien:', JSON.stringify(zaehler));
}

main().catch((err) => {
  console.error('[91-mcp-katalog] Fehler:', err.message);
  process.exit(1);
});
