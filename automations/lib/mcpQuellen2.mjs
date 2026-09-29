// Weitere internationale MCP-Quellen fuer den Katalog (#91) - alle oeffentlich, ohne Key:
// Smithery, Hugging Face Spaces, Docker Hub, NuGet (.NET), crates.io (Rust), Packagist (PHP),
// RubyGems, Maven Central (Java), GitLab, Codeberg. Nicht dabei (Stand 09/2026):
// Glama (Key + Lizenzpflicht), PulseMCP v0beta (abgeschaltet), Gitee (anonym leer).
const UA = { 'user-agent': 'ai-cash-machine-mcp-katalog', accept: 'application/json' };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const kurz = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 140);
// "mcp" als eigenes Wort (nicht mcp4901-Chips) oder ausgeschrieben.
const IST_MCP = /model[\s_-]?context[\s_-]?protocol|\bmcp\b|mcp[\s_-]?server|[\s_-]mcp$|^mcp[\s_-]/i;

async function hole(url, { text = false } = {}) {
  for (let versuch = 0; versuch < 4; versuch++) {
    let res;
    try {
      res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
    } catch {
      await warte(3000 * (versuch + 1));
      continue;
    }
    if (res.ok) return { daten: text ? await res.text() : await res.json(), kopf: res.headers };
    if (res.status === 429 || res.status >= 500) {
      await warte(Math.min(Number(res.headers.get('retry-after')) * 1000 || 5000 * (versuch + 1), 65000));
      continue;
    }
    throw new Error(`${url} -> HTTP ${res.status}`);
  }
  throw new Error(`${url} -> nach 4 Versuchen fehlgeschlagen`);
}

const naechsterLink = (kopf) => (String(kopf.get('link') || '').match(/<([^>]+)>;\s*rel="next"/) || [])[1] || '';

export async function smithery() {
  const out = new Map();
  for (let seite = 1; seite <= 500; seite++) {
    const { daten } = await hole(`https://registry.smithery.ai/servers?pageSize=100&page=${seite}`);
    for (const s of daten.servers || []) {
      if (!s.qualifiedName || s.unlisted) continue;
      out.set(s.qualifiedName, { n: s.displayName || s.qualifiedName, id: `smithery/${s.qualifiedName}`, d: kurz(s.description), q: 'smithery', r: s.homepage || `https://smithery.ai/server/${s.qualifiedName}`, k: 2 });
    }
    const p = daten.pagination || {};
    if (!(daten.servers || []).length || (p.totalPages && seite >= p.totalPages)) break;
    await warte(300);
  }
  return [...out.values()];
}

export async function huggingface() {
  const out = [];
  let url = 'https://huggingface.co/api/spaces?filter=mcp-server&limit=1000';
  for (let i = 0; url && i < 100; i++) {
    const { daten, kopf } = await hole(url);
    for (const s of daten || []) out.push({ n: s.id.split('/')[1] || s.id, id: `hf/${s.id}`, d: '', q: 'huggingface', r: `https://huggingface.co/spaces/${s.id}`, s: s.likes || 0, k: 2 });
    url = naechsterLink(kopf);
    await warte(700);
  }
  return out;
}

export async function dockerHub() {
  const out = new Map();
  for (let seite = 1; seite <= 100; seite++) {
    let daten;
    try {
      ({ daten } = await hole(`https://hub.docker.com/v2/search/repositories/?query=mcp&page_size=100&page=${seite}`));
    } catch {
      break;
    }
    for (const r of daten.results || []) {
      if (!IST_MCP.test(`${r.repo_name} ${r.short_description || ''}`)) continue;
      out.set(r.repo_name, { n: r.repo_name, id: `dockerhub/${r.repo_name}`, d: kurz(r.short_description), q: 'dockerhub', r: `https://hub.docker.com/r/${r.repo_name.includes('/') ? r.repo_name : `_/${r.repo_name}`}`, p: `oci:${r.repo_name}`, s: r.star_count || 0, k: 2 });
    }
    if (!daten.next) break;
    await warte(400);
  }
  return [...out.values()];
}

export async function nuget() {
  const out = new Map();
  for (const q of ['packagetype:McpServer', 'mcp', 'model context protocol']) {
    for (let skip = 0; skip < 3000; skip += 1000) {
      const { daten } = await hole(`https://azuresearch-usnc.nuget.org/query?q=${encodeURIComponent(q)}&take=1000&skip=${skip}&prerelease=true`);
      for (const p of daten.data || []) {
        const typen = (p.packageTypes || []).map((t) => t.name);
        if (!typen.includes('McpServer') && !IST_MCP.test(`${p.id} ${p.description || ''} ${(p.tags || []).join(' ')}`)) continue;
        out.set(p.id.toLowerCase(), { n: p.title || p.id, id: `nuget/${p.id}`, d: kurz(p.description), q: 'nuget', r: p.projectUrl || `https://www.nuget.org/packages/${p.id}`, p: `nuget:${p.id}`, k: 2 });
      }
      if ((daten.data || []).length < 1000) break;
    }
  }
  return [...out.values()];
}

export async function crates() {
  const out = new Map();
  for (const q of ['mcp', 'model-context-protocol']) {
    // crates.io liefert hoechstens 10 Seiten a 100 Treffer pro Suche.
    for (let seite = 1; seite <= 10; seite++) {
      let daten;
      try {
        ({ daten } = await hole(`https://crates.io/api/v1/crates?q=${encodeURIComponent(q)}&per_page=100&page=${seite}`));
      } catch {
        break;
      }
      for (const c of daten.crates || []) {
        if (!IST_MCP.test(`${c.name} ${c.description || ''}`)) continue;
        out.set(c.name, { n: c.name, id: `crates/${c.name}`, d: kurz(c.description), q: 'crates', r: c.repository || `https://crates.io/crates/${c.name}`, p: `cargo:${c.name}`, k: 2 });
      }
      if ((daten.crates || []).length < 100) break;
      await warte(1100);
    }
  }
  return [...out.values()];
}

export async function packagist() {
  const out = new Map();
  let url = 'https://packagist.org/search.json?q=mcp&per_page=100';
  for (let i = 0; url && i < 50; i++) {
    const { daten } = await hole(url);
    for (const p of daten.results || []) {
      if (!IST_MCP.test(`${p.name} ${p.description || ''}`)) continue;
      out.set(p.name, { n: p.name, id: `packagist/${p.name}`, d: kurz(p.description), q: 'packagist', r: p.repository || p.url, p: `composer:${p.name}`, s: p.favers || 0, k: 2 });
    }
    url = daten.next || '';
    await warte(300);
  }
  return [...out.values()];
}

export async function rubygems() {
  const out = new Map();
  for (let seite = 1; seite <= 40; seite++) {
    const { daten } = await hole(`https://rubygems.org/api/v1/search.json?query=mcp&page=${seite}`);
    for (const g of daten || []) {
      if (!IST_MCP.test(`${g.name} ${g.info || ''}`)) continue;
      out.set(g.name, { n: g.name, id: `gem/${g.name}`, d: kurz(g.info), q: 'rubygems', r: g.source_code_uri || g.homepage_uri || g.project_uri, p: `gem:${g.name}`, k: 2 });
    }
    if ((daten || []).length < 30) break;
    await warte(400);
  }
  return [...out.values()];
}

export async function maven() {
  const out = new Map();
  for (let start = 0; start < 2000; start += 200) {
    const { daten } = await hole(`https://search.maven.org/solrsearch/select?q=mcp&rows=200&start=${start}&wt=json`);
    const docs = daten.response?.docs || [];
    for (const d of docs) {
      if (!IST_MCP.test(`${d.g}.${d.a}`.replace(/\./g, ' '))) continue;
      out.set(d.id, { n: d.a, id: `maven/${d.id}`, d: `Java/Maven: ${d.g}`, q: 'maven', r: `https://central.sonatype.com/artifact/${d.g}/${d.a}`, p: `maven:${d.g}:${d.a}`, k: 2 });
    }
    if (docs.length < 200) break;
    await warte(500);
  }
  return [...out.values()];
}

export async function gitlab() {
  const out = new Map();
  for (const q of ['mcp-server', 'mcp server', 'model context protocol']) {
    for (let seite = 1; seite <= 20; seite++) {
      let daten;
      try {
        ({ daten } = await hole(`https://gitlab.com/api/v4/projects?search=${encodeURIComponent(q)}&per_page=100&page=${seite}&order_by=star_count&simple=true`));
      } catch {
        break;
      }
      for (const p of daten || []) {
        if (!IST_MCP.test(`${p.name} ${p.description || ''} ${(p.topics || []).join(' ')}`)) continue;
        out.set(p.web_url, { n: p.name, id: `gitlab/${p.path_with_namespace}`, d: kurz(p.description), q: 'gitlab', r: p.web_url, s: p.star_count || 0, k: 2 });
      }
      if ((daten || []).length < 100) break;
      await warte(700);
    }
  }
  return [...out.values()];
}

export async function codeberg() {
  const out = new Map();
  for (let seite = 1; seite <= 40; seite++) {
    const { daten } = await hole(`https://codeberg.org/api/v1/repos/search?q=mcp&limit=50&page=${seite}`);
    const repos = daten.data || [];
    for (const r of repos) {
      if (!IST_MCP.test(`${r.name} ${r.description || ''} ${(r.topics || []).join(' ')}`)) continue;
      out.set(r.html_url, { n: r.name, id: `codeberg/${r.full_name}`, d: kurz(r.description), q: 'codeberg', r: r.html_url, s: r.stars_count || 0, k: 2 });
    }
    if (repos.length < 50) break;
    await warte(400);
  }
  return [...out.values()];
}
