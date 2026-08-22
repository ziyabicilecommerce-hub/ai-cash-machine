// Meta-Ads-Auto-Skalierer - erhöht täglich das Budget von Ad-Sets, die das
// ROAS-Ziel schlagen. Original: n8n Workflow "42_Meta_Ads_Auto_Skalierer".
// Ergänzt um echtes Rückkopplungs-Gedächtnis wie #61/#63/#64/#88: prüft
// AUSGEFÜHRTE Skalierungen 7 Tage später gegen die echte Performance danach
// (ein größeres Budget kann die Effizienz auch drücken, statt es einfach
// anzunehmen) und fällt bei schlechter eigener Bilanz automatisch auf reine
// Empfehlung zurück (Selbstbremse) - dasselbe Sicherheitsprinzip wie bei
// den anderen Handlungs-Agenten. Zeitplan: täglich 08:45.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getAdInsights, getAdSets, purchaseValue, updateAdSetBudget } from './lib/meta.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '42-meta-ads-auto-skalierer';
const MAX_HISTORIE = 60;
// Gleicher Rückkopplungs-Gedanke wie bei #64 Ads-Autopilot: eine Budget-
// Erhöhung trägt ein eigenes Risiko (Zielgruppen-Sättigung, sinkende
// Grenz-Effizienz) - erst nach 7 Tagen echter Daten zeigt sich, ob das
// Ad-Set die Skalierung auch verdient hat.
const AUSWERTUNG_WARTETAGE = 7;
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');

function tageSeit(datumStr) {
  return (Date.now() - new Date(datumStr).getTime()) / (1000 * 3600 * 24);
}

function isoDatum(d) {
  return d.toISOString().slice(0, 10);
}

// Selbstbremse: feste Zahlen-Schwelle im Code (kein KI-Ermessen) - lief die
// eigene Erfolgsbilanz zuletzt schlecht, fällt der Agent DIESEN Lauf auf
// reine Empfehlung zurück, egal was AUTO_SKALIEREN sagt.
const SELBSTBREMSE_MIN_STICHPROBE = 3;
const SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS = 0.4;
function berechneSelbstbremse(ausgewertetAnzahl, positivAnzahl) {
  if (ausgewertetAnzahl < SELBSTBREMSE_MIN_STICHPROBE) return false;
  return positivAnzahl / ausgewertetAnzahl < SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS;
}

// Prüft AUSGEFÜHRTE Skalierungen: lief das Ad-Set mit dem höheren Budget in
// den 7 Tagen danach weiterhin profitabel? Reine Beobachtung der echten
// Performance danach, keine Kausalitäts-Behauptung.
async function werteVergangeneEntscheidungenAus(state) {
  const faellig = state.historie.filter(
    (e) => e.ausgefuehrt && !e.ausgewertet && tageSeit(e.datum) >= AUSWERTUNG_WARTETAGE
  );
  if (!faellig.length) return;

  for (const e of faellig) {
    const seit = new Date(e.datum);
    const bis = new Date(seit.getTime() + AUSWERTUNG_WARTETAGE * 86400000);
    try {
      const insights = await getAdInsights({
        level: 'adset',
        timeRange: { since: isoDatum(seit), until: isoDatum(bis) },
        fields: 'adset_id,spend,action_values',
        limit: 50,
      });
      const row = insights.find((r) => r.adset_id === e.adsetId);
      const spend = row ? parseFloat(row.spend || 0) : 0;
      const roasSeitdem = row && spend > 0 ? purchaseValue(row) / spend : null;

      e.ausgewertet = true;
      e.ausgewertetAm = new Date().toISOString();
      e.roasSeitdem = roasSeitdem !== null ? Number(roasSeitdem.toFixed(2)) : null;
      e.wirkung = roasSeitdem === null ? 'keine_daten' : roasSeitdem >= 1 ? 'skalierung_bestaetigt' : 'skalierung_schwaecher';
    } catch (err) {
      console.error(`[42-meta-ads-auto-skalierer] Auswertung für ${e.name} fehlgeschlagen:`, err.message || err);
    }
  }
  console.log(`[42-meta-ads-auto-skalierer] ${faellig.length} vergangene Entscheidung(en) ausgewertet.`);
}

function veroeffentliche(state, selbstgebremst) {
  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  const ausgewertet = state.historie.filter((e) => e.ausgewertet);
  const bestaetigt = ausgewertet.filter((e) => e.wirkung === 'skalierung_bestaetigt');
  writeFileSync(join(COMMAND_DIR, 'auto-skalierer.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    historie: state.historie,
    erfolgsBilanz: { ausgewertet: ausgewertet.length, bestaetigt: bestaetigt.length, brauchtBlick: ausgewertet.length - bestaetigt.length },
    selbstgebremst,
  }, null, 2));
}

async function main() {
  const roasZiel = parseFloat(config.ROAS_ZIEL || '2.0');
  const minSpend = parseFloat(config.MIN_SPEND || '15');
  const skalier = parseFloat(config.SKALIER_PROZENT || '20') / 100;
  const maxCent = parseFloat(config.MAX_TAGESBUDGET || '100') * 100;
  const autoSkalieren = config.AUTO_SKALIEREN === 'ja';

  const state = loadState(STATE_KEY);
  state.historie = state.historie || [];
  await werteVergangeneEntscheidungenAus(state);
  saveState(STATE_KEY, state);

  const ausgewertetVorlauf = state.historie.filter((e) => e.ausgewertet);
  const bestaetigtVorlauf = ausgewertetVorlauf.filter((e) => e.wirkung === 'skalierung_bestaetigt');
  const selbstgebremst = berechneSelbstbremse(ausgewertetVorlauf.length, bestaetigtVorlauf.length);
  const autoSkalierenEffektiv = autoSkalieren && !selbstgebremst;

  const insights = await getAdInsights({
    level: 'adset',
    datePreset: 'yesterday',
    fields: 'adset_id,adset_name,spend,action_values',
  });
  const adsets = await getAdSets({ fields: 'id,name,daily_budget,status,effective_status' });
  const budgetMap = {};
  for (const a of adsets) budgetMap[a.id] = a;

  const gewinner = [];
  for (const row of insights) {
    const spend = parseFloat(row.spend || 0);
    const rev = purchaseValue(row);
    const roas = spend > 0 ? rev / spend : 0;
    if (spend < minSpend || roas < roasZiel) continue;
    const as = budgetMap[row.adset_id];
    if (!as || !as.daily_budget) continue;
    if ((as.effective_status || as.status) !== 'ACTIVE') continue;
    const alt = parseInt(as.daily_budget);
    let neu = Math.round(alt * (1 + skalier));
    if (neu > maxCent) neu = maxCent;
    if (neu <= alt) continue;
    gewinner.push({ adsetId: row.adset_id, name: row.adset_name, roas, alt, neu });
  }

  const bremsHinweis = selbstgebremst
    ? `🛑 SELBSTBREMSE AKTIV: nur ${bestaetigtVorlauf.length}/${ausgewertetVorlauf.length} letzte Skalierungen liefen gut (< ${Math.round(SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS * 100)}%) - heute NUR Empfehlung, auch wenn AUTO_SKALIEREN an ist.`
    : autoSkalierenEffektiv ? 'AUTO_SKALIEREN ist AN: Budgets werden jetzt automatisch erhöht!' : 'AUTO_SKALIEREN steht auf nein - nur Empfehlung, ich ändere nichts.';

  let text;
  if (gewinner.length === 0) {
    text = `META AUTO-SKALIERER - ${config.SHOP_NAME}${NL}${NL}Keine Ad-Sets über ROAS-Ziel (${roasZiel}) mit Spielraum. Nichts zu skalieren heute.`;
  } else {
    const zeilen = gewinner.map((g) => `- ${g.name} | ROAS ${g.roas.toFixed(2)} | Budget ${(g.alt / 100).toFixed(2)} -> ${(g.neu / 100).toFixed(2)}`);
    text = `META AUTO-SKALIERER - ${config.SHOP_NAME}${NL}--------------------${NL}Gewinner-Ad-Sets (ROAS >= ${roasZiel}):${NL}${zeilen.join(NL)}${NL}${NL}${bremsHinweis}`;
  }
  await notifyTelegram(text);

  if (autoSkalierenEffektiv) {
    for (const g of gewinner) {
      try {
        await updateAdSetBudget(g.adsetId, g.neu);
      } catch (err) {
        console.error(`[42-meta-ads-auto-skalierer] Budget-Update fehlgeschlagen für ${g.name}:`, err.message || err);
      }
    }
  }

  const datum = new Date().toISOString();
  state.historie.unshift(...gewinner.map((g) => ({
    adsetId: g.adsetId,
    name: g.name,
    roas: Number(g.roas.toFixed(2)),
    budgetAlt: g.alt,
    budgetNeu: g.neu,
    datum,
    ausgefuehrt: autoSkalierenEffektiv,
  })));
  if (state.historie.length > MAX_HISTORIE) state.historie = state.historie.slice(0, MAX_HISTORIE);
  saveState(STATE_KEY, state);
  veroeffentliche(state, selbstgebremst);

  console.log(`[42-meta-ads-auto-skalierer] ${gewinner.length} Gewinner gefunden${selbstgebremst ? ' (selbstgebremst)' : ''}, autoSkalierenEffektiv=${autoSkalierenEffektiv}.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[42-meta-ads-auto-skalierer] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[42-meta-ads-auto-skalierer] Fehler:', err);
  process.exit(1);
});
