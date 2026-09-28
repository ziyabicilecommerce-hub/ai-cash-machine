// Zusaetzliche oeffentliche MCP-Verzeichnisse fuer den MCP-Katalog (#91).
// Jede Quelle liefert Eintraege im Katalog-Format; k: 2 = Key-Pflicht unbekannt.
const UA = { 'user-agent': 'ai-cash-machine-mcp-katalog', accept: 'application/json' };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function hole(url, { json = true, headers = {} } = {}) {
  for (let versuch = 0; versuch < 4; versuch++) {
    const res = await fetch(url, { headers: { ...UA, ...headers } });
    if (res.ok) return json ? res.json() : res.text();
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      const ms = reset ? Math.min(Math.max(reset * 1000 - Date.now(), 1000), 65000) : 3000 * (versuch + 1);
      await warte(ms);
      continue;
    }
    throw new Error(`${url} -> HTTP ${res.status}`);
  }
  throw new Error(`${url} -> nach 4 Versuchen fehlgeschlagen`);
}

export function repoSchluessel(url) {
  if (!url) return '';
  const m = String(url).match(/github\.com[/:]([^/\s#?]+)\/([^/\s#?]+)/i);
  if (m) return `github.com/${m[1]}/${m[2].replace(/\.git$/i, '')}`.toLowerCase();
  return String(url).toLowerCase().replace(/^git\+/, '').replace(/^https?:\/\/(www\.)?/, '').replace(/\.git$/, '').replace(/\/$/, '');
}

const kurz = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 140);

export async function pulseMcp() {
  const out = [];
  let url = 'https://api.pulsemcp.com/v0beta/servers?count_per_page=5000&offset=0';
  for (let seite = 0; url && seite < 50; seite++) {
    const data = await hole(url);
    for (const s of data.servers || []) {
      out.push({
        n: s.name, d: kurz(s.short_description), q: 'pulsemcp',
        r: s.source_code_url || s.external_url || s.url || '',
        u: (s.remotes || [])[0]?.url_direct || '',
        p: s.package_name ? `${s.package_registry || ''}:${s.package_name}` : '',
        s: s.github_stars || 0, k: 2,
      });
    }
    url = data.next || '';
  }
  return out;
}

export async function githubTopics(token, deadline = Infinity) {
  if (!token) throw new Error('GITHUB_TOKEN fehlt');
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
  const sterne = ['>=500', '100..499', '50..99', '20..49', '10..19', '5..9', '3..4', '2', '1', '0'];
  const jahre = ['2024-01-01..2025-03-31', '2025-04-01..2025-06-30', '2025-07-01..2025-09-30', '2025-10-01..2025-12-31', '2026-01-01..2026-04-30', '2026-05-01..2026-12-31'];
  const gesehen = new Map();
  let abgebrochen = false;
  suche:
  for (const topic of ['mcp-server', 'model-context-protocol', 'mcp']) {
    for (const st of sterne) {
      const slices = ['0', '1', '2'].includes(st) ? jahre : [''];
      for (const zeit of slices) {
        const q = `topic:${topic} stars:${st}${zeit ? ` created:${zeit}` : ''} archived:false`;
        for (let page = 1; page <= 10; page++) {
          if (Date.now() > deadline) {
            abgebrochen = true;
            break suche;
          }
          const data = await hole(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=100&page=${page}`, { headers });
          await warte(2200);
          for (const r of data.items || []) {
            gesehen.set(r.full_name.toLowerCase(), {
              n: r.name, id: r.full_name, d: kurz(r.description), q: 'github',
              r: r.html_url, s: r.stargazers_count || 0, k: 2,
            });
          }
          if ((data.items || []).length < 100) break;
        }
      }
    }
  }
  const liste = [...gesehen.values()];
  liste.zeitlimit = abgebrochen;
  return liste;
}

export async function npmPakete() {
  const gesehen = new Map();
  for (const text of ['keywords:mcp-server', 'keywords:mcp', 'keywords:modelcontextprotocol', 'keywords:model-context-protocol', 'mcp server']) {
    for (let from = 0; from < 10000; from += 250) {
      let data;
      try {
        data = await hole(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=250&from=${from}`);
      } catch {
        break;
      }
      const objekte = data.objects || [];
      for (const o of objekte) {
        const p = o.package || {};
        const name = p.name || '';
        const beschr = `${name} ${p.description || ''} ${(p.keywords || []).join(' ')}`;
        if (!/mcp|model context protocol|modelcontextprotocol/i.test(beschr)) continue;
        gesehen.set(name, {
          n: name, d: kurz(p.description), q: 'npm',
          r: p.links?.repository || p.links?.homepage || '', p: `npm:${name}`, k: 2,
        });
      }
      if (objekte.length < 250) break;
      await warte(300);
    }
  }
  return [...gesehen.values()];
}

export async function pypiPakete() {
  const html = await hole('https://pypi.org/simple/', { json: false, headers: { accept: 'text/html' } });
  const namen = [...html.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]).filter((n) => /(^|[-_.])mcp([-_.]|$)|mcp-server|mcp_server/i.test(n));
  return namen.map((n) => ({ n, d: '', q: 'pypi', r: `https://pypi.org/project/${n}/`, p: `pypi:${n}`, k: 2 }));
}

export async function dockerKatalog(token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const baum = await hole('https://api.github.com/repos/docker/mcp-registry/git/trees/main?recursive=1', { headers });
  const dateien = (baum.tree || []).map((t) => t.path).filter((p) => /^servers\/[^/]+\/server\.yaml$/.test(p));
  const out = [];
  for (let i = 0; i < dateien.length; i += 20) {
    const teil = await Promise.all(dateien.slice(i, i + 20).map(async (pfad) => {
      try {
        const yaml = await hole(`https://raw.githubusercontent.com/docker/mcp-registry/main/${pfad}`, { json: false });
        const feld = (k) => (yaml.match(new RegExp(`^\\s*${k}:\\s*["']?(.+?)["']?\\s*$`, 'm')) || [])[1] || '';
        const name = pfad.split('/')[1];
        return {
          n: feld('title') || name, id: `docker/${name}`, d: kurz(feld('description')), q: 'docker',
          r: feld('project') || feld('source') || `https://github.com/docker/mcp-registry/tree/main/servers/${name}`,
          p: feld('image') ? `oci:${feld('image')}` : '', k: /secrets:/.test(yaml) ? 1 : 0,
        };
      } catch {
        return null;
      }
    }));
    out.push(...teil.filter(Boolean));
  }
  return out;
}

export async function awesomeListen() {
  const listen = [
    'punkpeye/awesome-mcp-servers/main/README.md',
    'appcypher/awesome-mcp-servers/main/README.md',
    'wong2/awesome-mcp-servers/main/README.md',
    'modelcontextprotocol/servers/main/README.md',
  ];
  const gesehen = new Map();
  for (const l of listen) {
    let md;
    try {
      md = await hole(`https://raw.githubusercontent.com/${l}`, { json: false });
    } catch {
      continue;
    }
    for (const zeile of md.split('\n')) {
      const m = zeile.match(/^\s*[-*]\s+(?:<[^>]+>\s*)*\*{0,2}\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\*{0,2}(.*)$/);
      if (!m || !/github\.com\/[^/]+\/[^/)#]+/.test(m[2])) continue;
      const d = m[3].replace(/^[\s\-–—:📇🐍🏎️🦀#☕🌊🏠☁️🍎🪟🐧🎖️]+/u, '').replace(/[`*_]/g, '');
      const key = repoSchluessel(m[2]);
      if (!gesehen.has(key)) gesehen.set(key, { n: m[1].replace(/[`*]/g, ''), d: kurz(d), q: 'awesome', r: m[2], k: 2 });
    }
  }
  return [...gesehen.values()];
}
