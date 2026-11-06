// Suite-Übersicht (#117): läuft im Pages-Build (jarvis-pages.yml) und schreibt uebersicht/daten.json für die App
// "Systemstatus": alle Apps, alle Workflows mit Ampel (rot ganz oben), Kennzahlen.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { appsAusBuild, appInfo, workflowName, workflowStatus, zaehlen } from './lib/suiteUebersicht.mjs';

const REPO = process.env.GITHUB_REPOSITORY || 'ziyabicilecommerce-hub/ai-cash-machine';
const TOKEN = process.env.GITHUB_TOKEN || '';
const lies = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

const apps = appsAusBuild(lies('.github/workflows/jarvis-pages.yml')).filter((a) => existsSync(`${a}/index.html`)).map((a) => appInfo(a, lies(`${a}/index.html`)));
const dateien = readdirSync('.github/workflows').filter((d) => /\.ya?ml$/.test(d));
const workflows = dateien.map((d) => ({ datei: d, name: workflowName(d, lies(`.github/workflows/${d}`)) }));

async function laeufe() {
  const alle = [];  // ohne Token klappt es beim öffentlichen Repo auch (dann mit kleinerem API-Limit)
  for (let seite = 1; seite <= 5; seite++) {  // die letzten 500 Läufe reichen für jeden Workflow, der in den letzten Tagen lief
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=100&page=${seite}&exclude_pull_requests=true`, { headers: { ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}), accept: 'application/vnd.github+json' } });
      if (!r.ok) break;
      const d = await r.json();
      alle.push(...(d.workflow_runs || []).map(({ path, conclusion, created_at, html_url }) => ({ path, conclusion, created_at, html_url })));
      if ((d.workflow_runs || []).length < 100) break;
    } catch { break; }
  }
  return alle;
}

const l = await laeufe();
const status = l.length ? workflowStatus(workflows, l) : workflows.map((w) => ({ ...w, status: 'ruhig' }));
const tests = readdirSync('tests/zentrale').filter((d) => d.endsWith('.test.mjs')).length;
const daten = {
  stand: new Date().toISOString(),
  mitStatus: l.length > 0,
  zahlen: { apps: apps.length, workflows: workflows.length, automationen: readdirSync('automations').filter((d) => /^\d+.*\.mjs$/.test(d)).length, testdateien: tests, ...zaehlen(status) },
  apps,
  workflows: status,
};
mkdirSync('uebersicht', { recursive: true });
writeFileSync('uebersicht/daten.json', `${JSON.stringify(daten)}\n`);
console.log(`[117] ${apps.length} Apps · ${workflows.length} Workflows · rot ${daten.zahlen.rot} · gelb ${daten.zahlen.gelb} · grün ${daten.zahlen.gruen}`);
