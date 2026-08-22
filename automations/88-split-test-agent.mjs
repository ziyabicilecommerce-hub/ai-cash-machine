// Split-Test-Agent - echtes A/B-Testing zwischen Ad-Sets DERSELBEN Kampagne
// (Creative/Zielgruppen-Varianten): vergleicht ROAS innerhalb jeder Kampagne
// statt nur den Gesamt-Account-ROAS wie die Notbremse (#43). Bei klarem
// Sieger/Verlierer (genug Spend auf beiden Seiten + deutlicher Unterschied)
// wird empfohlen, den Verlierer zu pausieren - bei AUTO_SPLIT_TEST_PAUSIEREN
// = "ja" wirklich pausiert (der Gewinner bleibt IMMER aktiv, egal was
// passiert - eine Kampagne darf durch diesen Agent nie komplett stillstehen).
// Neu, kein n8n-Workflow · Zeitplan: täglich.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getAdInsights, purchaseValue, pauseAd } from './lib/meta.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '88-split-test-agent';
const MAX_HISTORIE = 60;
// Wartezeit, bevor eine AUSGEFÜHRTE Pausierung gegen die echte Performance
// des Gewinners in der Woche danach ausgewertet wird - derselbe Rückkopplungs-
// Gedanke wie beim Pricing-Agent (#61): nicht nur empfehlen und vergessen,
// sondern prüfen, ob der Gewinner seine Rolle auch weiterhin verdient.
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
// reine Empfehlung zurück, egal was AUTO_SPLIT_TEST_PAUSIEREN sagt.
const SELBSTBREMSE_MIN_STICHPROBE = 3;
const SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS = 0.4;
function berechneSelbstbremse(ausgewertetAnzahl, positivAnzahl) {
  if (ausgewertetAnzahl < SELBSTBREMSE_MIN_STICHPROBE) return false;
  return positivAnzahl / ausgewertetAnzahl < SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS;
}

// Lernt aus der eigenen echten Erfolgsbilanz, statt bei jedem Lauf mit der
// immer gleichen festen Schwelle zu starten: lief die Bilanz zuletzt gut,
// reicht beim nächsten Mal ein kleinerer ROAS-Unterschied, um zu handeln
// (der Agent "traut sich mehr"); lief sie schlecht, braucht er einen
// GRÖSSEREN Unterschied (vorsichtiger). Feste, direkt aus der echten
// Erfolgsquote abgeleitete Anpassung in festen Grenzen - kein KI-Ermessen,
// kann nie unter/über die Grenzen hinauslaufen.
const ADAPTIV_MIN_STICHPROBE = 3;
const ADAPTIV_UNTERGRENZE = 0.25;
const ADAPTIV_OBERGRENZE = 0.6;
function berechneAdaptiveSchwelle(basis, ausgewertetAnzahl, positivAnzahl) {
  if (ausgewertetAnzahl < ADAPTIV_MIN_STICHPROBE) return basis;
  const erfolgsquote = positivAnzahl / ausgewertetAnzahl;
  if (erfolgsquote >= 0.7) return Math.max(ADAPTIV_UNTERGRENZE, basis - 0.1);
  if (erfolgsquote < 0.5) return Math.min(ADAPTIV_OBERGRENZE, basis + 0.15);
  return basis;
}

// Prüft AUSGEFÜHRTE Pausierungen der letzten Woche: lief der GEWINNER (bleibt
// immer aktiv) in genau den 7 Tagen danach weiterhin profitabel? Beobachtet
// nur den tatsächlichen ROAS in diesem Zeitraum - keine Behauptung, DASS die
// Pausierung des Verlierers das bewirkt hat, nur ob die Entscheidung weiterhin
// gut aussieht.
async function werteVergangeneEntscheidungenAus(state) {
  const faellig = state.historie.filter(
    (e) => e.ausgefuehrt && !e.ausgewertet && e.gewinner.adsetId && tageSeit(e.datum) >= AUSWERTUNG_WARTETAGE
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
      const row = insights.find((r) => r.adset_id === e.gewinner.adsetId);
      const spend = row ? parseFloat(row.spend || 0) : 0;
      const roasSeitdem = row && spend > 0 ? purchaseValue(row) / spend : null;

      e.ausgewertet = true;
      e.ausgewertetAm = new Date().toISOString();
      e.gewinnerRoasSeitdem = roasSeitdem !== null ? Number(roasSeitdem.toFixed(2)) : null;
      e.wirkung = roasSeitdem === null ? 'keine_daten' : roasSeitdem >= 1 ? 'gewinner_bestaetigt' : 'gewinner_schwaecher';
    } catch (err) {
      console.error(`[88-split-test-agent] Auswertung für ${e.kampagne} fehlgeschlagen:`, err.message || err);
    }
  }
  console.log(`[88-split-test-agent] ${faellig.length} vergangene Entscheidung(en) ausgewertet.`);
}

async function main() {
  const autoAn = config.AUTO_SPLIT_TEST_PAUSIEREN === 'ja';
  const minSpend = parseFloat(config.SPLIT_TEST_MIN_SPEND_PRO_ADSET || '20');
  const minUnterschiedBasis = parseFloat(config.SPLIT_TEST_MIN_UNTERSCHIED_PROZENT || '40') / 100;

  const insights = await getAdInsights({
    level: 'adset',
    datePreset: 'last_7d',
    fields: 'campaign_id,campaign_name,adset_id,adset_name,spend,action_values',
    limit: 200,
  });

  const kampagnen = {};
  for (const row of insights) {
    const spend = parseFloat(row.spend || 0);
    if (spend <= 0) continue;
    const roas = purchaseValue(row) / spend;
    const eintrag = { adsetId: row.adset_id, name: row.adset_name, spend, roas };
    if (!kampagnen[row.campaign_id]) kampagnen[row.campaign_id] = { name: row.campaign_name, adsets: [] };
    kampagnen[row.campaign_id].adsets.push(eintrag);
  }

  const state = loadState(STATE_KEY);
  state.historie = state.historie || [];
  await werteVergangeneEntscheidungenAus(state);
  saveState(STATE_KEY, state);

  const ausgewertetVorlauf = state.historie.filter((e) => e.ausgewertet);
  const bestaetigtVorlauf = ausgewertetVorlauf.filter((e) => e.wirkung === 'gewinner_bestaetigt');
  const selbstgebremst = berechneSelbstbremse(ausgewertetVorlauf.length, bestaetigtVorlauf.length);
  const autoAnEffektiv = autoAn && !selbstgebremst;
  const minUnterschiedEffektiv = berechneAdaptiveSchwelle(minUnterschiedBasis, ausgewertetVorlauf.length, bestaetigtVorlauf.length);

  const ergebnisse = [];
  for (const [campaignId, k] of Object.entries(kampagnen)) {
    // Braucht mind. 2 Ad-Sets mit jeweils genug Spend für einen verlässlichen
    // Vergleich - sonst würde ein Ad-Set mit 2€ Spend zufällig als "Verlierer"
    // markiert werden, obwohl es einfach noch zu wenig Daten hat.
    const belastbar = k.adsets.filter((a) => a.spend >= minSpend);
    if (belastbar.length < 2) continue;

    belastbar.sort((a, b) => b.roas - a.roas);
    const gewinner = belastbar[0];
    const verlierer = belastbar[belastbar.length - 1];
    if (gewinner.roas <= 0) continue; // beide performen schlecht - kein "Gewinner", das ist ein Fall für die Notbremse
    const unterschiedProzent = verlierer.roas > 0
      ? (gewinner.roas - verlierer.roas) / verlierer.roas
      : 1; // Verlierer hat 0 Käufe trotz Spend -> maximal klarer Unterschied

    if (unterschiedProzent < minUnterschiedEffektiv) continue;

    const erwarteterMehrertrag = verlierer.spend * (gewinner.roas - verlierer.roas);
    let pausiert = false;
    if (autoAnEffektiv) {
      try {
        await pauseAd(verlierer.adsetId);
        pausiert = true;
      } catch (err) {
        console.error(`[88-split-test-agent] Pausieren fehlgeschlagen für ${verlierer.name}:`, err.message || err);
      }
    }

    ergebnisse.push({
      kampagne: k.name,
      gewinner: { name: gewinner.name, roas: Number(gewinner.roas.toFixed(2)), spend: Number(gewinner.spend.toFixed(2)), adsetId: gewinner.adsetId },
      verlierer: { name: verlierer.name, roas: Number(verlierer.roas.toFixed(2)), spend: Number(verlierer.spend.toFixed(2)), adsetId: verlierer.adsetId },
      unterschiedProzent: Math.round(unterschiedProzent * 100),
      risiko: belastbar.length >= 3 || (gewinner.spend + verlierer.spend) >= minSpend * 4 ? 'niedrig' : 'mittel',
      erwarteteAuswirkung: `+${erwarteterMehrertrag.toFixed(2)} € geschätzter Mehrertrag pro Woche, wenn das Verlierer-Budget zum Gewinner wandert`,
      ausgefuehrt: pausiert,
      datum: new Date().toISOString(),
    });
  }

  if (ergebnisse.length) {
    state.historie.unshift(...ergebnisse);
    if (state.historie.length > MAX_HISTORIE) state.historie = state.historie.slice(0, MAX_HISTORIE);
    saveState(STATE_KEY, state);
  }

  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  const ausgewertet = state.historie.filter((e) => e.ausgewertet);
  const bestaetigt = ausgewertet.filter((e) => e.wirkung === 'gewinner_bestaetigt');
  writeFileSync(join(COMMAND_DIR, 'split-test.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    autoAn: autoAnEffektiv,
    historie: state.historie,
    erfolgsBilanz: { ausgewertet: ausgewertet.length, bestaetigt: bestaetigt.length, brauchtBlick: ausgewertet.length - bestaetigt.length },
    selbstgebremst,
    adaptiveSchwelle: { basisProzent: Math.round(minUnterschiedBasis * 100), effektivProzent: Math.round(minUnterschiedEffektiv * 100) },
  }, null, 2));

  if (!ergebnisse.length) {
    console.log('[88-split-test-agent] Keine Kampagne mit klarem Sieger/Verlierer.');
    return;
  }

  const zeilen = ergebnisse.map((e) =>
    `- ${e.kampagne}: "${e.gewinner.name}" (ROAS ${e.gewinner.roas}) schlägt "${e.verlierer.name}" (ROAS ${e.verlierer.roas}) um ${e.unterschiedProzent}% - ${e.ausgefuehrt ? 'Verlierer pausiert' : 'nur empfohlen'}`);
  const bremsHinweis = selbstgebremst
    ? `🛑 SELBSTBREMSE AKTIV: nur ${bestaetigtVorlauf.length}/${ausgewertetVorlauf.length} letzte Pausierungen liefen gut (< ${Math.round(SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS * 100)}%) - heute NUR Empfehlung, auch wenn AUTO_SPLIT_TEST_PAUSIEREN an ist.`
    : autoAnEffektiv ? 'AUTO_SPLIT_TEST_PAUSIEREN ist AN: Verlierer werden automatisch pausiert.' : 'AUTO_SPLIT_TEST_PAUSIEREN steht auf nein - nur Empfehlung.';
  const schwelleHinweis = minUnterschiedEffektiv !== minUnterschiedBasis
    ? `${NL}📐 Schwelle heute angepasst: ${Math.round(minUnterschiedEffektiv * 100)}% statt Standard ${Math.round(minUnterschiedBasis * 100)}% (aus der eigenen Erfolgsbilanz gelernt).`
    : '';
  await notifyTelegram(`🧪 SPLIT-TEST-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}${bremsHinweis}${schwelleHinweis}${NL}${NL}${zeilen.join(NL)}`);

  console.log(`[88-split-test-agent] ${ergebnisse.length} klare Ergebnis(se), ${ergebnisse.filter((e) => e.ausgefuehrt).length} Verlierer pausiert${selbstgebremst ? ' (selbstgebremst)' : ''} (Schwelle: ${Math.round(minUnterschiedEffektiv * 100)}%).`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[88-split-test-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[88-split-test-agent] Fehler:', err);
  process.exit(1);
});
