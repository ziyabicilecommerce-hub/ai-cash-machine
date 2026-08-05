// Oracle Auto-Briefing - lässt das tägliche KI-Briefing aus der Oracle-App
// automatisch laufen und per WhatsApp verschicken, statt nur beim Öffnen der
// App im Browser generiert zu werden. Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Nutzt exakt denselben Prompt wie buildPrompt() in oracle/index.html (4
// Abschnitte LAGE/ANALYSE/BEFEHL/PROGNOSE) und dieselbe Datenquelle
// (finance-cockpit/data.json, gefüttert von #01 Gewinn-Radar) - damit das
// Ergebnis inhaltlich identisch zur App-Version ist. Die App selbst bleibt
// unverändert live und interaktiv (inkl. "Neu generieren"-Button).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { askClaude } from './lib/claude.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FINANCE_DATA_FILE = join(__dirname, '..', 'finance-cockpit', 'data.json');

function fmtMoney(v, waehrung) {
  return `${Number(v).toFixed(2)} ${waehrung || 'EUR'}`;
}

function buildPrompt(latest, trendPct, isStale) {
  const NL = '\n';
  return `Du bist eine KI-Analyseeinheit, die tägliche Kurzbriefings im Stil einer Operationszentrale schreibt — knapp, direkt, faktenbasiert, keine leere Effekthascherei und keine generischen Business-Floskeln.${NL}${NL}ECHTE ZAHLEN (letzter erfasster Tag: ${latest.datum}):${NL}- Umsatz: ${fmtMoney(latest.umsatz, latest.waehrung)} (${trendPct === null ? 'noch zu wenig Historie für einen Trend' : trendPct >= 0 ? '+' + trendPct.toFixed(1) + '% ggü. 7-Tage-Schnitt' : trendPct.toFixed(1) + '% ggü. 7-Tage-Schnitt'})${NL}- Geschätzter Gewinn: ${fmtMoney(latest.gewinn, latest.waehrung)}${NL}- Bestellungen: ${latest.bestellungen}${NL}- Bestseller: ${(latest.topProdukte && latest.topProdukte[0]) ? latest.topProdukte[0].name : 'keine Verkäufe erfasst'}${NL}${isStale ? '- WICHTIG: Diese Daten sind seit über 36h nicht aktualisiert worden — die Automation läuft vermutlich nicht mehr.' : ''}${NL}${NL}Schreibe ein Briefing mit GENAU diesen 4 Abschnitten, jeweils 1-3 knackige Sätze, auf Deutsch, Du-Form, wie ein Lagebericht. Jeder Satz muss einen echten Zahlenbezug oder eine konkrete Handlung enthalten, keine Allgemeinplätze:${NL}${NL}LAGE: [aktuelle Situation in einem Satz]${NL}ANALYSE: [was treibt die Zahlen gerade — nutze die echten Zahlen]${NL}BEFEHL: [EINE konkrete, sofort umsetzbare Handlung für heute]${NL}PROGNOSE: [was passiert, wenn nichts sich ändert, vs. wenn der Befehl befolgt wird]${NL}${NL}Antworte NUR mit den 4 Zeilen im exakten Format "LAGE: ...", "ANALYSE: ...", "BEFEHL: ...", "PROGNOSE: ...", jede auf eigener Zeile, kein Markdown, keine Einleitung, keine Anführungszeichen.`;
}

async function main() {
  if (!existsSync(FINANCE_DATA_FILE)) {
    console.log('[59-oracle-auto-briefing] Noch kein finance-cockpit/data.json vorhanden (Gewinn-Radar noch nicht gelaufen) - übersprungen.');
    return;
  }

  const data = JSON.parse(readFileSync(FINANCE_DATA_FILE, 'utf-8'));
  const history = (data.history || []).filter((h) => h && h.datum);
  if (!history.length) {
    console.log('[59-oracle-auto-briefing] Leere Historie - übersprungen.');
    return;
  }

  const latest = history[history.length - 1];
  let trendPct = null;
  if (history.length >= 4) {
    const prior = history.slice(0, -1).slice(-7);
    const avg = prior.reduce((s, h) => s + h.umsatz, 0) / prior.length;
    if (avg > 0) trendPct = ((latest.umsatz - avg) / avg) * 100;
  }
  const updatedAt = data.updatedAt ? new Date(data.updatedAt) : null;
  const isStale = updatedAt ? (Date.now() - updatedAt.getTime()) / 3600000 > 36 : false;

  const antwort = await askClaude(buildPrompt(latest, trendPct, isStale), { maxTokens: 500 });

  const sections = { lage: '', analyse: '', befehl: '', prognose: '' };
  const map = { LAGE: 'lage', ANALYSE: 'analyse', BEFEHL: 'befehl', PROGNOSE: 'prognose' };
  for (const line of antwort.split('\n')) {
    const m = line.match(/^(LAGE|ANALYSE|BEFEHL|PROGNOSE):\s*(.*)$/i);
    if (m) sections[map[m[1].toUpperCase()]] = m[2].trim();
  }

  const text = [
    `🔮 *Oracle-Briefing* - ${latest.datum}`,
    `Umsatz ${fmtMoney(latest.umsatz, latest.waehrung)} · Gewinn ${fmtMoney(latest.gewinn, latest.waehrung)} · ${latest.bestellungen} Bestellungen`,
    sections.lage ? `LAGE: ${sections.lage}` : '',
    sections.analyse ? `ANALYSE: ${sections.analyse}` : '',
    sections.befehl ? `BEFEHL: ${sections.befehl}` : '',
    sections.prognose ? `PROGNOSE: ${sections.prognose}` : '',
  ].filter(Boolean).join('\n\n');

  await notifyWhatsapp(text);
  console.log(`[59-oracle-auto-briefing] Briefing für ${latest.datum} versendet.`);
}

main().catch((err) => {
  console.error('[59-oracle-auto-briefing] Fehler:', err);
  process.exit(1);
});
