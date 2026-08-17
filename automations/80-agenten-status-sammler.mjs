// Agenten-Status-Sammler - fasst den echten Live-Status ALLER Automationen
// (aus der GitHub Actions API) in einer Datei zusammen, die die neue
// "CASHMACHINE AGENTS" App live anzeigt: eine sichtbare "KI-Belegschaft"
// statt einer trockenen Liste von 79 Skriptnamen. Nutzt den von GitHub
// Actions automatisch bereitgestellten GITHUB_TOKEN (braucht zusätzlich
// "actions: read" - deshalb eigener, NICHT über den geteilten
// _automation-runner.yml laufender Workflow, um die Berechtigungen der
// anderen 79 Automationen nicht anzufassen). Neu, kein n8n-Workflow ·
// Zeitplan: alle 6 Stunden.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DATA_FILE = join(__dirname, '..', 'agents', 'data.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;

async function githubApi(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API Fehler ${res.status} bei ${path}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!GITHUB_TOKEN || !REPO) {
    console.log('[80-agenten-status-sammler] GITHUB_TOKEN/GITHUB_REPOSITORY nicht verfügbar (nur innerhalb GitHub Actions nutzbar) - übersprungen.');
    return;
  }

  const alle = await githubApi(`/repos/${REPO}/actions/workflows?per_page=100`);
  const automationWorkflows = (alle.workflows || []).filter((w) => /automation-\d+-/.test(w.path));

  const agenten = [];
  for (const wf of automationWorkflows) {
    let letzterLauf = null;
    let verlauf = [];
    try {
      // per_page=5 statt 1: die letzten 5 Läufe ergeben ein Zuverlässigkeits-
      // Muster (z.B. "4x OK, 1x Fehler" statt nur den aktuellen Snapshot) -
      // macht flackernde/instabile Automationen sichtbar, die im reinen
      // Zuletzt-Status untergehen würden.
      const runsRes = await githubApi(`/repos/${REPO}/actions/workflows/${wf.id}/runs?per_page=5`);
      const runs = runsRes.workflow_runs || [];
      const run = runs[0];
      if (run) {
        letzterLauf = {
          status: run.status,
          conclusion: run.conclusion,
          startedAt: run.run_started_at,
          htmlUrl: run.html_url,
        };
      }
      verlauf = runs.map((r) => r.conclusion);
    } catch (err) {
      console.error(`[80-agenten-status-sammler] Konnte Läufe für "${wf.name}" nicht laden:`, err.message);
    }

    const nummerMatch = wf.name.match(/^(\d+)\s*·\s*(.+)$/);
    agenten.push({
      nummer: nummerMatch ? parseInt(nummerMatch[1], 10) : null,
      name: nummerMatch ? nummerMatch[2] : wf.name,
      workflowUrl: wf.html_url,
      letzterLauf,
      verlauf,
    });
  }

  agenten.sort((a, b) => (a.nummer || 999) - (b.nummer || 999));

  const dir = dirname(AGENTS_DATA_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(AGENTS_DATA_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), agenten }, null, 2));

  console.log(`[80-agenten-status-sammler] Status von ${agenten.length} Agenten gesammelt.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[80-agenten-status-sammler] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[80-agenten-status-sammler] Fehler:', err);
  process.exit(1);
});
