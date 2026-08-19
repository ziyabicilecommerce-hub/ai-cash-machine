// Ads-Autopilot-Agent - führt eine echte Budget-Umschichtung zwischen dem
// besten und dem schwächsten aktiven Ad-Set aus, statt wie Ad Commander (#56)
// nur eine Empfehlung auf Kampagnen-Ebene auszusprechen. Ergänzt (nicht
// ersetzt) #42 Auto-Skalierer (erhöht nur Gewinner, ohne Budget woanders
// wegzunehmen) und #43 Notbremse (stoppt nur, verschiebt nichts). Der
// Autopilot ist der einzige, der wirklich Budget von SCHWACH zu STARK
// UMSCHICHTET. Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Sicherheitsgrenzen: nur EIN Shift pro Lauf (bester <- schwächster
// Ad-Set), gedeckelt auf ADS_AUTOPILOT_MAX_SHIFT_PROZENT des schwächsten
// Budgets, niemals unter eine Mindest-Budget-Grenze. Wie bei den anderen
// budget-bewegenden Agenten standardmäßig NUR EMPFEHLUNG, bis
// AUTO_BUDGET_UMSCHICHTEN explizit auf "ja" steht.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getAdInsights, getAdSets, purchaseValue, updateAdSetBudget } from './lib/meta.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const MINDEST_BUDGET_CENT = 500; // nie unter 5.00 (Währungseinheit) drücken
const STATE_KEY = '64-ads-autopilot-agent';
const MAX_HISTORIE = 60;
// Gleicher Rückkopplungs-Gedanke wie bei #61 Pricing-Agent und #88
// Split-Test-Agent: eine Budget-Erhöhung trägt ein eigenes Risiko
// (Zielgruppen-Sättigung, sinkende Grenz-Effizienz) - erst nach 7 Tagen
// echter Daten zeigt sich, ob das Ad-Set die Verstärkung auch verdient hat.
const AUSWERTUNG_WARTETAGE = 7;
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');

function tageSeit(datumStr) {
  return (Date.now() - new Date(datumStr).getTime()) / (1000 * 3600 * 24);
}

function isoDatum(d) {
  return d.toISOString().slice(0, 10);
}

// Prüft AUSGEFÜHRTE Budget-Umschichtungen: lief das VERSTÄRKTE Ad-Set (mehr
// Budget) in den 7 Tagen danach weiterhin profitabel, oder hat die größere
// Zielgruppe/das größere Budget die Effizienz gedrückt? Reine Beobachtung
// der echten Performance danach, keine Kausalitäts-Behauptung.
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
      const row = insights.find((r) => r.adset_id === e.bester.id);
      const spend = row ? parseFloat(row.spend || 0) : 0;
      const roasSeitdem = row && spend > 0 ? purchaseValue(row) / spend : null;

      e.ausgewertet = true;
      e.ausgewertetAm = new Date().toISOString();
      e.besterRoasSeitdem = roasSeitdem !== null ? Number(roasSeitdem.toFixed(2)) : null;
      e.wirkung = roasSeitdem === null ? 'keine_daten' : roasSeitdem >= 1 ? 'verstaerkung_bestaetigt' : 'verstaerkung_schwaecher';
    } catch (err) {
      console.error(`[64-ads-autopilot-agent] Auswertung für ${e.bester.name} fehlgeschlagen:`, err.message || err);
    }
  }
  console.log(`[64-ads-autopilot-agent] ${faellig.length} vergangene Entscheidung(en) ausgewertet.`);
}

function veroeffentliche(state) {
  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  const ausgewertet = state.historie.filter((e) => e.ausgewertet);
  const bestaetigt = ausgewertet.filter((e) => e.wirkung === 'verstaerkung_bestaetigt');
  writeFileSync(join(COMMAND_DIR, 'ads-autopilot.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    historie: state.historie,
    erfolgsBilanz: { ausgewertet: ausgewertet.length, bestaetigt: bestaetigt.length, brauchtBlick: ausgewertet.length - bestaetigt.length },
  }, null, 2));
}

async function main() {
  if (!config.META_ACCESS_TOKEN || !config.META_AD_ACCOUNT_ID) {
    console.log('[64-ads-autopilot-agent] META_ACCESS_TOKEN/META_AD_ACCOUNT_ID nicht konfiguriert - übersprungen.');
    return;
  }

  const minSpend = parseFloat(config.ADS_AUTOPILOT_MIN_SPEND || '15');
  const maxShift = parseFloat(config.ADS_AUTOPILOT_MAX_SHIFT_PROZENT || '15') / 100;
  const autoAn = config.AUTO_BUDGET_UMSCHICHTEN === 'ja';

  const state = loadState(STATE_KEY);
  state.historie = state.historie || [];
  await werteVergangeneEntscheidungenAus(state);
  saveState(STATE_KEY, state);

  const insights = await getAdInsights({
    level: 'adset',
    datePreset: 'last_7d',
    fields: 'adset_id,adset_name,spend,action_values',
  });
  const adsets = await getAdSets({ fields: 'id,name,daily_budget,status,effective_status' });
  const budgetMap = {};
  for (const a of adsets) budgetMap[a.id] = a;

  const kandidaten = [];
  for (const row of insights) {
    const as = budgetMap[row.adset_id];
    if (!as || !as.daily_budget || (as.effective_status || as.status) !== 'ACTIVE') continue;
    const spend = parseFloat(row.spend || 0);
    if (spend < minSpend) continue;
    const roas = spend > 0 ? purchaseValue(row) / spend : 0;
    kandidaten.push({ id: row.adset_id, name: row.adset_name, roas, budget: parseInt(as.daily_budget, 10) });
  }

  if (kandidaten.length < 2) {
    console.log(`[64-ads-autopilot-agent] Nur ${kandidaten.length} Ad-Set(s) mit genug Spend - nichts zum Umschichten.`);
    veroeffentliche(state);
    return;
  }

  kandidaten.sort((a, b) => b.roas - a.roas);
  const bester = kandidaten[0];
  const schwaechster = kandidaten[kandidaten.length - 1];

  if (bester.id === schwaechster.id || bester.roas <= schwaechster.roas) {
    console.log('[64-ads-autopilot-agent] Kein klarer Unterschied zwischen bestem und schwächstem Ad-Set - nichts umgeschichtet.');
    veroeffentliche(state);
    return;
  }

  let shiftCent = Math.round(schwaechster.budget * maxShift);
  const schwaechsterNeu = schwaechster.budget - shiftCent;
  if (schwaechsterNeu < MINDEST_BUDGET_CENT) {
    shiftCent = schwaechster.budget - MINDEST_BUDGET_CENT;
  }
  if (shiftCent <= 0) {
    console.log('[64-ads-autopilot-agent] Schwächstes Ad-Set schon an der Mindest-Budget-Grenze - nichts umgeschichtet.');
    veroeffentliche(state);
    return;
  }

  const besterNeu = bester.budget + shiftCent;
  const schwaechsterFinal = schwaechster.budget - shiftCent;

  const text = `📊 ADS-AUTOPILOT-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}Bestes Ad-Set: ${bester.name} | ROAS ${bester.roas.toFixed(2)} | Budget ${(bester.budget / 100).toFixed(2)} -> ${(besterNeu / 100).toFixed(2)}${NL}Schwächstes Ad-Set: ${schwaechster.name} | ROAS ${schwaechster.roas.toFixed(2)} | Budget ${(schwaechster.budget / 100).toFixed(2)} -> ${(schwaechsterFinal / 100).toFixed(2)}${NL}${NL}${autoAn ? 'AUTO_BUDGET_UMSCHICHTEN ist AN: Budgets werden jetzt live umgeschichtet!' : 'AUTO_BUDGET_UMSCHICHTEN steht auf nein - nur Empfehlung, ich ändere nichts.'}`;
  await notifyTelegram(text);

  let ausgefuehrt = false;
  if (autoAn) {
    try {
      await updateAdSetBudget(bester.id, besterNeu);
      await updateAdSetBudget(schwaechster.id, schwaechsterFinal);
      ausgefuehrt = true;
    } catch (err) {
      console.error('[64-ads-autopilot-agent] Budget-Update fehlgeschlagen:', err.message || err);
    }
  }

  state.historie.unshift({
    datum: new Date().toISOString(),
    bester: { id: bester.id, name: bester.name, roas: Number(bester.roas.toFixed(2)), budgetAlt: bester.budget, budgetNeu: besterNeu },
    schwaechster: { id: schwaechster.id, name: schwaechster.name, roas: Number(schwaechster.roas.toFixed(2)), budgetAlt: schwaechster.budget, budgetNeu: schwaechsterFinal },
    shiftCent,
    grund: `Bestes Ad-Set (ROAS ${bester.roas.toFixed(2)}) bekommt Budget vom schwächsten (ROAS ${schwaechster.roas.toFixed(2)}).`,
    erwarteteAuswirkung: `Verschiebt ${(shiftCent / 100).toFixed(2)} € Tagesbudget zum performanteren Ad-Set.`,
    ausgefuehrt,
  });
  if (state.historie.length > MAX_HISTORIE) state.historie = state.historie.slice(0, MAX_HISTORIE);
  saveState(STATE_KEY, state);
  veroeffentliche(state);

  console.log(`[64-ads-autopilot-agent] Shift ${(shiftCent / 100).toFixed(2)} von "${schwaechster.name}" zu "${bester.name}" ${ausgefuehrt ? 'ausgeführt' : 'empfohlen'}.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[64-ads-autopilot-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[64-ads-autopilot-agent] Fehler:', err);
  process.exit(1);
});
