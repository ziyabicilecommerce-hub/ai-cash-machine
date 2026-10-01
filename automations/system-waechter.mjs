// System-Waechter (alle 3 Stunden): prueft alle Workflows der letzten 48 h, startet abgestuerzte Laeufe
// wichtiger Agenten einmal neu und meldet neue Probleme per Telegram. Ergebnis: zentrale/daten/system.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { auswerten, neuStarten, schluessel, RHYTHMUS } from './lib/systemWaechter.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const ZIEL = 'zentrale/daten/system.json';
const REPO = process.env.GITHUB_REPOSITORY || 'ziyabicilecommerce-hub/ai-cash-machine';
const api = (pfad, opt = {}) => fetch(`https://api.github.com/repos/${REPO}${pfad}`, { ...opt, headers: { accept: 'application/vnd.github+json', 'user-agent': 'cashmachine-system-waechter', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}), ...(opt.headers || {}) } });

async function laeufeHolen() {
  const seit = new Date(Date.now() - 48 * 36e5).toISOString().slice(0, 19);
  const alle = [];
  for (let seite = 1; seite <= 10; seite++) {
    const res = await api(`/actions/runs?per_page=100&page=${seite}&created=%3E%3D${seit}`);
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const d = await res.json();
    alle.push(...(d.workflow_runs || []));
    if ((d.workflow_runs || []).length < 100) break;
  }
  return alle;
}

async function main() {
  const alt = existsSync(ZIEL) ? JSON.parse(readFileSync(ZIEL, 'utf8')) : { probleme: [] };
  const laeufe = await laeufeHolen();
  // Fuer wichtige Agenten ohne Lauf im Fenster den letzten Lauf ueberhaupt holen (haengt er?).
  const letzte = {};
  for (const [name, [, datei]] of Object.entries(RHYTHMUS)) {
    if (laeufe.some((r) => r.name === name && r.head_branch === 'main')) continue;
    const res = await api(`/actions/workflows/${datei}/runs?branch=main&per_page=1`);
    const r = res.ok ? (await res.json()).workflow_runs?.[0] : null;
    if (r) letzte[name] = r.created_at;
  }
  const { workflows, probleme } = auswerten(laeufe, { letzte });
  const neugestartet = [];
  for (const w of neuStarten(workflows)) {
    const res = await api(`/actions/runs/${w.runId}/rerun-failed-jobs`, { method: 'POST' });
    if (res.status === 201) neugestartet.push(w.name);
    console.log(`[system] ${w.name}: Neustart ${res.status === 201 ? 'ausgelöst' : `nicht möglich (${res.status})`}`);
  }
  const ok = workflows.filter((w) => w.ergebnis === 'success').length;
  console.log(`[system] ${workflows.length} Workflows · ${ok} ok · ${probleme.length} Probleme · ${neugestartet.length} neu gestartet`);
  for (const p of probleme) console.log(`[system] ⚠️ ${p.name}: ${p.text}`);
  mkdirSync('zentrale/daten', { recursive: true });
  writeFileSync(ZIEL, JSON.stringify({ stand: new Date().toISOString(), gesamt: workflows.length, ok, probleme, neugestartet, workflows }, null, 1) + '\n');
  const vorher = new Set((alt.probleme || []).map(schluessel));
  const neu = probleme.filter((p) => !vorher.has(schluessel(p)));
  if (neu.length || neugestartet.length) {
    await notifyTelegram(`🛡️ System-Wächter\n\n${neu.map((p) => `⚠️ ${p.name}: ${p.text}`).join('\n')}${neugestartet.length ? `\n\n🔁 Automatisch neu gestartet: ${neugestartet.join(', ')}` : ''}`);
  }
}

main().catch((err) => { console.error('[system]', err.message); process.exit(1); });
