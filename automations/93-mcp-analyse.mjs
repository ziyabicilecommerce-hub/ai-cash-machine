// MCP-Analyse - nimmt jedes Paket aus dem MCP-Katalog statisch auseinander:
// Metadaten (Lizenz, Pflege, Nutzung) plus Quelltext-Scan auf Warnsignale
// (Install-Skripte mit Downloads, verschleierter Code, Datenabfluss, Miner).
// Nichts wird installiert oder ausgefuehrt. Arbeitet in Portionen mit
// Zeitbudget und merkt sich den Fortschritt in mcp-hub/analyse.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tarDateien, zipDateien, ladeBytes, scanne, bewerte, qualitaetsFlags } from './lib/mcpAnalyse.mjs';

const KATALOG = 'mcp-hub/catalog.json';
const OUT = 'mcp-hub/analyse.json';
const BUDGET_MIN = Number(process.env.MCP_ANALYSE_BUDGET_MIN || 40);
const PARALLEL = Number(process.env.MCP_ANALYSE_PARALLEL || 12);
const MAX_ARCHIV = 10 * 1024 * 1024;
const TAG = 24 * 3600 * 1000;
const UA = { 'user-agent': 'ai-cash-machine-mcp-analyse' };

export function schluessel(s) {
  if (s.p?.startsWith('npm:')) return s.p;
  if (s.p?.startsWith('pypi:')) return `pypi:${s.p.slice(5).toLowerCase()}`;
  const m = (s.r || '').match(/github\.com\/([^/\s#?]+)\/([^/\s#?]+)/i);
  return m ? `gh:${m[1]}/${m[2].replace(/\.git$/i, '')}`.toLowerCase() : null;
}

async function json(url, headers = {}) {
  const res = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function ergebnis(flags, metrik) {
  return [bewerte(flags), new Date().toISOString().slice(0, 10), [...flags].sort(), metrik];
}

async function analysiereNpm(name) {
  const pfad = name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
  const [latest, kurz, dl] = await Promise.all([
    json(`https://registry.npmjs.org/${pfad}/latest`),
    json(`https://registry.npmjs.org/${pfad}`, { accept: 'application/vnd.npm.install-v1+json' }),
    json(`https://api.npmjs.org/downloads/point/last-week/${name}`).catch(() => ({})),
  ]);
  const downloads = dl.downloads ?? 0;
  const flags = qualitaetsFlags({ lizenz: latest.license, repo: latest.repository, letzteAenderung: kurz.modified, nutzung: downloads, deprecated: latest.deprecated });
  if (downloads < 20) flags.add('kaum-genutzt');
  const metrik = { dl: downloads, up: (kurz.modified || '').slice(0, 7), lic: String(latest.license || '').slice(0, 20) };
  try {
    const dateien = tarDateien(await ladeBytes(latest.dist.tarball, MAX_ARCHIV));
    for (const f of scanne(dateien, latest)) flags.add(f);
  } catch (err) {
    flags.add(err.message === 'zu-gross' ? 'zu-gross' : 'code-nicht-lesbar');
  }
  return ergebnis(flags, metrik);
}

async function analysierePypi(name) {
  const d = await json(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  const info = d.info || {};
  const zeiten = Object.values(d.releases || {}).flat().map((f) => f.upload_time_iso_8601).filter(Boolean).sort();
  const urls = Object.values(info.project_urls || {}).join(' ') + ` ${info.home_page || ''}`;
  const lizenz = info.license_expression || info.license || (info.classifiers || []).find((c) => c.startsWith('License ::'));
  const flags = qualitaetsFlags({ lizenz, repo: /github|gitlab|codeberg|bitbucket/i.test(urls), letzteAenderung: zeiten.at(-1), erstellt: zeiten[0], nutzung: zeiten.length > 3 ? 100 : 0, deprecated: info.yanked ? info.yanked_reason || 'yanked' : '' });
  const metrik = { up: (zeiten.at(-1) || '').slice(0, 7), lic: String(lizenz || '').replace('License :: OSI Approved :: ', '').slice(0, 20) };
  const datei = (d.urls || []).find((f) => f.packagetype === 'bdist_wheel') || (d.urls || []).find((f) => f.packagetype === 'sdist');
  try {
    if (!datei) throw new Error('kein-archiv');
    const bytes = await ladeBytes(datei.url, MAX_ARCHIV);
    const dateien = datei.filename.endsWith('.whl') || datei.filename.endsWith('.zip') ? zipDateien(bytes) : tarDateien(bytes);
    for (const f of scanne(dateien, null)) flags.add(f);
    if (dateien.some((x) => /(^|\/)setup\.py$/.test(x.name) && /urlopen|requests\.get|subprocess|os\.system/.test(x.text))) flags.add('install-download');
  } catch (err) {
    flags.add(err.message === 'zu-gross' ? 'zu-gross' : 'code-nicht-lesbar');
  }
  return ergebnis(flags, metrik);
}

const ghMeta = new Map();
async function ladeGithubMeta(repos, token) {
  for (let i = 0; i < repos.length; i += 50) {
    const teil = repos.slice(i, i + 50);
    const felder = teil.map((r, j) => {
      const [o, n] = r.split('/');
      return `r${j}: repository(owner: ${JSON.stringify(o)}, name: ${JSON.stringify(n)}) { stargazerCount pushedAt createdAt isArchived diskUsage licenseInfo { spdxId } }`;
    }).join('\n');
    try {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { ...UA, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query: `query {\n${felder}\n}` }),
        signal: AbortSignal.timeout(60000),
      });
      const d = await res.json();
      teil.forEach((r, j) => ghMeta.set(r, d.data?.[`r${j}`] || null));
    } catch {
      teil.forEach((r) => ghMeta.set(r, null));
    }
  }
}

async function analysiereGithub(repo) {
  const m = ghMeta.get(repo);
  if (!m) return [0, new Date().toISOString().slice(0, 10), ['repo-weg'], {}];
  const flags = qualitaetsFlags({ lizenz: m.licenseInfo?.spdxId && m.licenseInfo.spdxId !== 'NOASSERTION', repo: true, letzteAenderung: m.pushedAt, erstellt: m.createdAt, nutzung: m.stargazerCount * 10, archiviert: m.isArchived });
  const metrik = { st: m.stargazerCount, up: (m.pushedAt || '').slice(0, 7), lic: m.licenseInfo?.spdxId || '' };
  try {
    if (m.diskUsage > 30000) throw new Error('zu-gross');
    const dateien = tarDateien(await ladeBytes(`https://codeload.github.com/${repo}/tar.gz/HEAD`, MAX_ARCHIV));
    const pkg = dateien.find((d) => /^[^/]+\/package\.json$/.test(d.name));
    let manifest = null;
    try {
      manifest = pkg ? JSON.parse(pkg.text) : null;
    } catch {
      manifest = null;
    }
    for (const f of scanne(dateien, manifest)) flags.add(f);
  } catch (err) {
    flags.add(err.message === 'zu-gross' ? 'zu-gross' : 'code-nicht-lesbar');
  }
  return ergebnis(flags, metrik);
}

async function main() {
  const start = Date.now();
  const deadline = start + BUDGET_MIN * 60 * 1000;
  const katalog = JSON.parse(readFileSync(KATALOG, 'utf8'));
  const alt = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { e: {} };
  const e = alt.e || {};

  const alleSchluessel = new Set();
  const offen = [];
  for (const s of katalog.server || []) {
    const k = schluessel(s);
    if (!k || alleSchluessel.has(k)) continue;
    alleSchluessel.add(k);
    const v = e[k];
    const alter = v ? start - Date.parse(v[1]) : Infinity;
    if (!v || alter > 30 * TAG || (v[0] === 0 && alter > 7 * TAG)) offen.push(k);
  }
  console.log(`[93-mcp-analyse] ${alleSchluessel.size} Pakete insgesamt, ${offen.length} offen, Budget ${BUDGET_MIN} Min.`);

  const token = process.env.GITHUB_TOKEN || '';
  const ghOffen = offen.filter((k) => k.startsWith('gh:')).slice(0, 8000).map((k) => k.slice(3));
  if (token && ghOffen.length) await ladeGithubMeta(ghOffen, token);

  let index = 0;
  let fertig = 0;
  async function arbeiter() {
    while (index < offen.length && Date.now() < deadline) {
      const k = offen[index++];
      if (k.startsWith('gh:') && !ghMeta.has(k.slice(3))) continue;
      try {
        if (k.startsWith('npm:')) e[k] = await analysiereNpm(k.slice(4));
        else if (k.startsWith('pypi:')) e[k] = await analysierePypi(k.slice(5));
        else e[k] = await analysiereGithub(k.slice(3));
      } catch {
        e[k] = [0, new Date().toISOString().slice(0, 10), ['nicht-erreichbar'], {}];
      }
      fertig++;
    }
  }
  const lebenszeichen = setInterval(() => console.log(`[93-mcp-analyse] ${fertig} analysiert`), 60000);
  await Promise.all(Array.from({ length: PARALLEL }, arbeiter));
  clearInterval(lebenszeichen);

  for (const k of Object.keys(e)) if (!alleSchluessel.has(k)) delete e[k];
  const zaehler = { unklar: 0, unauffaellig: 0, vorsicht: 0, gefaehrlich: 0 };
  const namen = ['unklar', 'unauffaellig', 'vorsicht', 'gefaehrlich'];
  for (const v of Object.values(e)) zaehler[namen[v[0]]]++;
  const analysiert = Object.keys(e).length;
  writeFileSync(OUT, JSON.stringify({ stand: new Date().toISOString(), gesamt: alleSchluessel.size, analysiert, zaehler, e }));
  console.log(`[93-mcp-analyse] diesmal ${fertig}, insgesamt ${analysiert}/${alleSchluessel.size} analysiert:`, JSON.stringify(zaehler));
}

const BEKANNTE_FLAGS = new Set(['install-skript', 'install-download', 'eval-dekodiert', 'hex-kette', 'langer-blob', 'fremd-webhook', 'liest-geheimnisse', 'geheimnis-abfluss', 'krypto-miner', 'shell', 'keine-lizenz', 'kein-repo', 'veraltet', 'archiviert', 'deprecated', 'malware-gemeldet', 'neu-und-unbekannt', 'kaum-genutzt', 'zu-gross', 'code-nicht-lesbar', 'repo-weg', 'nicht-erreichbar']);

function validieren(quelle, ziel) {
  const roh = readFileSync(quelle, 'utf8');
  if (roh.length > 30_000_000) throw new Error('analyse.json zu gross');
  const d = JSON.parse(roh);
  const e = {};
  for (const [k, v] of Object.entries(d.e || {})) {
    if (typeof k !== 'string' || k.length > 250 || !/^(npm|pypi|gh):[\w@./-]+$/i.test(k) || !Array.isArray(v)) continue;
    const score = [0, 1, 2, 3].includes(v[0]) ? v[0] : 0;
    const datum = /^\d{4}-\d{2}-\d{2}$/.test(v[1]) ? v[1] : new Date().toISOString().slice(0, 10);
    const flags = (Array.isArray(v[2]) ? v[2] : []).filter((f) => BEKANNTE_FLAGS.has(f));
    const m = v[3] && typeof v[3] === 'object' ? v[3] : {};
    const metrik = {};
    if (Number.isInteger(m.dl) && m.dl >= 0) metrik.dl = m.dl;
    if (Number.isInteger(m.st) && m.st >= 0) metrik.st = m.st;
    if (typeof m.up === 'string' && /^(\d{4}-\d{2})?$/.test(m.up)) metrik.up = m.up;
    if (typeof m.lic === 'string') metrik.lic = m.lic.replace(/[^\w.+\- ]/g, '').slice(0, 20);
    e[k] = [score, datum, flags, metrik];
  }
  const zaehler = { unklar: 0, unauffaellig: 0, vorsicht: 0, gefaehrlich: 0 };
  const namen = ['unklar', 'unauffaellig', 'vorsicht', 'gefaehrlich'];
  for (const v of Object.values(e)) zaehler[namen[v[0]]]++;
  const gesamt = Number.isInteger(d.gesamt) ? d.gesamt : Object.keys(e).length;
  writeFileSync(ziel, JSON.stringify({ stand: new Date(d.stand).toISOString(), gesamt, analysiert: Object.keys(e).length, zaehler, e }));
  console.log(`[93-mcp-analyse] validiert: ${Object.keys(e).length} Eintraege`, JSON.stringify(zaehler));
}

if (process.argv[2] === '--validieren') {
  try {
    validieren(process.argv[3], process.argv[4]);
  } catch (err) {
    console.error('[93-mcp-analyse] Validierung fehlgeschlagen:', err.message);
    process.exit(1);
  }
} else {
  main().catch((err) => {
    console.error('[93-mcp-analyse] Fehler:', err.message);
    process.exit(1);
  });
}
