// System-Waechter (alle 3 Stunden): prueft alle Workflows der letzten 48 h, startet abgestuerzte Laeufe
// wichtiger Agenten einmal neu und meldet neue Probleme per Telegram. Ergebnis: zentrale/daten/system.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { auswerten, neuStarten, schluessel, RHYTHMUS } from './lib/systemWaechter.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { diagnose } from './lib/fehlerDoktor.mjs';

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

// Log des abgestuerzten Jobs holen (letzte 400 Zeilen) - Grundlage fuer den Fehler-Doktor.
async function logHolen(runId) {
  const jobs = await api(`/actions/runs/${runId}/jobs?filter=latest`);
  if (!jobs.ok) return '';
  const job = ((await jobs.json()).jobs || []).find((j) => j.conclusion === 'failure' || j.conclusion === 'timed_out' || j.conclusion === 'cancelled');
  if (!job) return '';
  const res = await api(`/actions/jobs/${job.id}/logs`);
  return res.ok ? (await res.text()).split('\n').slice(-400).join('\n') : '';
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
  // Fehler-Doktor: Ursache jedes Absturzes aus dem Log - selbst heilbare (Netz, Konflikt, KI-Limit) neu starten.
  for (const p of probleme.filter((x) => x.art === 'absturz')) {
    const w = workflows.find((x) => x.name === p.name);
    try { p.diagnose = diagnose(await logHolen(w.runId)); } catch (err) { console.log(`[system] Log ${p.name}: ${err.message}`); }
  }
  const heilbar = workflows.filter((w) => probleme.some((p) => p.name === w.name && p.diagnose?.selbst) && w.versuch === 1 && Date.now() - Date.parse(w.letzterLauf) < 12 * 36e5);
  const neugestartet = [];
  for (const w of [...new Set([...neuStarten(workflows), ...heilbar])]) {
    const res = await api(`/actions/runs/${w.runId}/rerun-failed-jobs`, { method: 'POST' });
    if (res.status === 201) neugestartet.push(w.name);
    console.log(`[system] ${w.name}: Neustart ${res.status === 201 ? 'ausgelöst' : `nicht möglich (${res.status})`}`);
  }
  const ok = workflows.filter((w) => w.ergebnis === 'success').length;
  console.log(`[system] ${workflows.length} Workflows · ${ok} ok · ${probleme.length} Probleme · ${neugestartet.length} neu gestartet`);
  for (const p of probleme) console.log(`[system] ⚠️ ${p.name}: ${p.text}${p.diagnose ? ` -> ${p.diagnose.text} (${p.diagnose.selbst ? 'heilt sich selbst' : 'braucht dich'}): ${p.diagnose.beleg}` : ''}`);
  mkdirSync('zentrale/daten', { recursive: true });
  writeFileSync(ZIEL, JSON.stringify({ stand: new Date().toISOString(), gesamt: workflows.length, ok, probleme, neugestartet, workflows }, null, 1) + '\n');
  const vorher = new Set((alt.probleme || []).map(schluessel));
  const neu = probleme.filter((p) => !vorher.has(schluessel(p)));
  if (neu.length || neugestartet.length) {
    await notifyTelegram(`🛡️ System-Wächter\n\n${neu.map((p) => `⚠️ ${p.name}: ${p.diagnose ? `${p.diagnose.text}\n   → ${p.diagnose.selbst ? '🔁 ' : '👉 '}${p.diagnose.loesung}` : p.text}`).join('\n')}${neugestartet.length ? `\n\n🔁 Automatisch neu gestartet: ${neugestartet.join(', ')}` : ''}`);
  }
}

main().catch((err) => { console.error('[system]', err.message); process.exit(1); });
