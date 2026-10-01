// Engpass-Chef (taeglich 03:35 UTC, vor Labor und Fabrik): misst die echte Leistung jedes Agenten im
// Fliessband, findet den Engpass (NEULAND-Rechnung), verschiebt das KI-Kontingent zwischen Labor und
// Fabrik (automations/state/agenten-plan.json) und schickt eine kurze Tagesansage.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { messen, entscheiden, AGENTEN } from './lib/agentenKette.mjs';
import { PLAN } from './lib/agentenPlan.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const SEITE = 'zentrale/daten/engpass.json';
const lesen = (p, leer) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : leer; } catch { return leer; } };

async function main() {
  const alt = lesen(PLAN, {});
  const seite = lesen(SEITE, { verlauf: [] });
  const ziel = Math.min(10, Math.max(1, Number(process.env.AGENTEN_ZIEL) || alt.naechstesZiel || 5));
  const m = messen();
  const e = entscheiden(m, { ziel, altPlan: alt.plan || {} });
  const stand = new Date().toISOString();
  mkdirSync('automations/state', { recursive: true });
  writeFileSync(PLAN, JSON.stringify({ stand, plan: e.plan, naechstesZiel: e.durchsatz >= ziel ? e.plan.fabrikAnzahl : ziel, engpass: e.engpass.id, grund: e.grund }, null, 1) + '\n');
  // Hinter dem Engpass wartet die Kette: 0 dort ist eine Folge, kein eigener Fehler.
  const reihe = ['fabrik', 'pruefer', 'poster', 'sammler'];
  const status = (id) => (id === e.engpass.id ? 'engpass' : reihe.indexOf(id) > reihe.indexOf(e.engpass.id) && !m.leistung[id] ? 'wartet' : 'laeuft');
  const zeilen = Object.entries(AGENTEN).map(([id, a]) => `${{ engpass: '🔴', wartet: '⚪', laeuft: '🟢' }[status(id)]} ${a.name}: ${m.leistung[id]} ${a.einheit}/Tag`);
  const heute = stand.slice(0, 10);
  const verlauf = [...(seite.verlauf || []).filter((v) => v.datum !== heute), { datum: heute, durchsatz: e.durchsatz, engpass: e.engpass.id, ...m.leistung }].slice(-60);
  mkdirSync('zentrale/daten', { recursive: true });
  writeFileSync(SEITE, JSON.stringify({
    stand, ziel, agenten: Object.entries(AGENTEN).map(([id, a]) => ({ id, ...a, leistung: m.leistung[id], status: status(id) })),
    kanaele: m.kanaele, laborQuote: m.laborQuote, engpass: e.engpass, durchsatz: e.durchsatz,
    plan: e.plan, grund: e.grund, aufgabe: e.aufgabe, kiAnfragen: e.kiAnfragen,
    kette: e.analyse.vorher.schritte.map((s) => ({ id: s.id, name: s.name, kapazitaet: s.kapazitaet })), verlauf,
  }, null, 1) + '\n');
  const text = `🏭 Agenten-Fließband · Ziel ${ziel} Videos/Tag\n\n${zeilen.join('\n')}\n\nEngpass: ${e.engpass.name}\n${e.grund}\nPlan morgen: Fabrik ${e.plan.fabrikAnzahl}, Labor ${e.plan.laborAnzahl}${e.aufgabe ? `\n\n👉 Deine Aufgabe: ${e.aufgabe.titel} - ${e.aufgabe.text}` : ''}`;
  console.log(text);
  await notifyTelegram(text);
}

main().catch((err) => { console.error('[engpass-chef]', err.message); process.exit(1); });
