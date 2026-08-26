// Ads-Manager - tägliches Meta-Ads-Briefing mit Kill/Skalier-Empfehlungen (+ optional Auto-Pause)
// Original: n8n Workflow "11_Ads_Manager" · Zeitplan: täglich 08:30
//
// Ergänzt um echtes Rückkopplungs-Gedächtnis wie #61/#63/#64/#88/#42/#67: eine
// Kill-Entscheidung ist eine Prognose ("die Ad bleibt schlecht"), keine
// Tatsache - deshalb prüft der Agent 14 Tage später die einzige ehrliche,
// direkt beobachtbare Größe: hat der Shop-Betreiber die gekillte Ad von Hand
// wieder aktiviert (Widerspruch zur KI-Entscheidung) oder blieb sie aus (vom
// Menschen akzeptiert)? Keine erfundene "war die Kill-Entscheidung richtig"-
// Bewertung, nur die reale Beobachtung. Bei schlechter eigener Bilanz fällt
// der Agent automatisch auf reine Empfehlung zurück (Selbstbremse) - gleiches
// Sicherheitsprinzip wie bei den anderen Handlungs-Agenten.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getAdInsights, purchaseCount, purchaseValue, pauseAd, getAdStatus } from './lib/meta.mjs';
import { askKI } from './lib/ki.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '11-ads-manager';
const MAX_HISTORIE = 60;
// Erst nach 14 Tagen hat ein Shop-Betreiber realistisch die Chance gehabt,
// eine gekillte Ad zu bemerken und ggf. selbst wieder zu aktivieren.
const AUSWERTUNG_WARTETAGE = 14;
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');

function tageSeit(datumStr) {
  return (Date.now() - new Date(datumStr).getTime()) / (1000 * 3600 * 24);
}

// Selbstbremse: feste Zahlen-Schwelle im Code (kein KI-Ermessen) - wurden
// zuletzt zu viele Kills vom Menschen widerrufen, fällt der Agent DIESEN Lauf
// auf reine Empfehlung zurück, egal was AUTO_PAUSE sagt.
const SELBSTBREMSE_MIN_STICHPROBE = 3;
const SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS = 0.4;
function berechneSelbstbremse(ausgewertetAnzahl, positivAnzahl) {
  if (ausgewertetAnzahl < SELBSTBREMSE_MIN_STICHPROBE) return false;
  return positivAnzahl / ausgewertetAnzahl < SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS;
}

// Prüft AUSGEFÜHRTE Kills: lief die Ad seitdem noch pausiert, oder hat der
// Mensch sie wieder aktiviert (= ehrliches Signal, dass der Kill falsch lag)?
async function werteVergangeneEntscheidungenAus(state) {
  const faellig = state.historie.filter(
    (e) => e.ausgefuehrt && !e.ausgewertet && tageSeit(e.datum) >= AUSWERTUNG_WARTETAGE
  );
  if (!faellig.length) return;

  for (const e of faellig) {
    try {
      const status = await getAdStatus(e.adId);
      const aktiv = status.effective_status === 'ACTIVE' || status.status === 'ACTIVE';
      e.ausgewertet = true;
      e.ausgewertetAm = new Date().toISOString();
      e.wirkung = aktiv ? 'kill_rueckgaengig_gemacht' : 'kill_bestaetigt';
    } catch (err) {
      console.error(`[11-ads-manager] Auswertung für ${e.name} fehlgeschlagen:`, err.message || err);
    }
  }
  console.log(`[11-ads-manager] ${faellig.length} vergangene Kill-Entscheidung(en) ausgewertet.`);
}

function veroeffentliche(state, selbstgebremst) {
  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  const ausgewertet = state.historie.filter((e) => e.ausgewertet);
  const bestaetigt = ausgewertet.filter((e) => e.wirkung === 'kill_bestaetigt');
  writeFileSync(join(COMMAND_DIR, 'ads-manager.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    historie: state.historie,
    erfolgsBilanz: { ausgewertet: ausgewertet.length, bestaetigt: bestaetigt.length, brauchtBlick: ausgewertet.length - bestaetigt.length },
    selbstgebremst,
  }, null, 2));
}

async function main() {
  const state = loadState(STATE_KEY);
  state.historie = state.historie || [];
  await werteVergangeneEntscheidungenAus(state);
  saveState(STATE_KEY, state);

  const ausgewertetVorlauf = state.historie.filter((e) => e.ausgewertet);
  const bestaetigtVorlauf = ausgewertetVorlauf.filter((e) => e.wirkung === 'kill_bestaetigt');
  const selbstgebremst = berechneSelbstbremse(ausgewertetVorlauf.length, bestaetigtVorlauf.length);
  const autoPauseEffektiv = config.AUTO_PAUSE === 'ja' && !selbstgebremst;

  const ads = await getAdInsights({
    fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,actions,action_values',
  });

  const roasZiel = parseFloat(config.ROAS_ZIEL);
  const minSpend = parseFloat(config.MIN_SPEND_FUER_BEWERTUNG);

  if (ads.length === 0) {
    await notifyTelegram(`ADS-MANAGER - ${config.SHOP_NAME}${NL}${NL}Gestern liefen keine Ads (oder noch keine Daten). Nichts zu tun.`);
    veroeffentliche(state, selbstgebremst);
    console.log('[11-ads-manager] Keine Ads gefunden');
    return;
  }

  const bewertet = [];
  const killListe = [];

  for (const a of ads) {
    const spend = parseFloat(a.spend || 0);
    const rev = purchaseValue(a);
    const k = purchaseCount(a);
    const roas = spend > 0 ? rev / spend : 0;
    let status = 'BEOBACHTEN';
    if (spend >= minSpend && roas >= roasZiel) status = 'SKALIEREN';
    if (spend >= minSpend && roas < 1) {
      status = 'KILLEN';
      killListe.push({ ad_id: a.ad_id, ad_name: a.ad_name, spend: spend.toFixed(2), roas: roas.toFixed(2) });
    }
    bewertet.push(
      `- [${status}] "${a.ad_name}" (Kampagne: ${a.campaign_name}) | Spend: ${spend.toFixed(2)} | Käufe: ${k} | Umsatz: ${rev.toFixed(2)} | ROAS: ${roas.toFixed(2)} | CTR: ${a.ctr || '0'}% | CPC: ${a.cpc || '0'}`
    );
  }

  const prompt = `Du bist Senior Media Buyer und managst die Meta-Ads vom Onlineshop "${config.SHOP_NAME}". Ziel-ROAS: ${roasZiel}. Hier die Performance von GESTERN (vorklassifiziert):${NL}${NL}${bewertet.join(NL)}${NL}${NL}Gib mir dein tägliches Ads-Briefing auf Deutsch:${NL}1. LAGE in einem Satz (Gesamtspend vs. Gesamtumsatz, läuft es?)${NL}2. ENTSCHEIDUNGEN pro auffälliger Ad: killen / skalieren (+20-30% Budget) / beobachten - mit 1-Satz-Begründung. Bei Skalier-Kandidaten: konkreter Budget-Vorschlag.${NL}3. MUSTER: Was haben die Gewinner gemeinsam, was die Verlierer? (Hook? Zielgruppe? Format?)${NL}4. EIN Test für morgen.${NL}Sei knapp und direkt, keine Floskeln. Klartext ohne Markdown, Emojis als Trenner.`;

  const briefing = await askKI(prompt, { maxTokens: 2500 });

  let killInfo = '';
  if (killListe.length > 0) {
    killInfo = `${NL}${NL}Kill-Kandidaten (ROAS unter 1):${NL}${killListe
      .map((k) => `- ${k.ad_name} (Spend ${k.spend}, ROAS ${k.roas})`)
      .join(NL)}`;
    const bremsHinweis = selbstgebremst
      ? `🛑 SELBSTBREMSE AKTIV: nur ${bestaetigtVorlauf.length}/${ausgewertetVorlauf.length} letzte Kills wurden vom Menschen akzeptiert (< ${Math.round(SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS * 100)}%) - heute NUR Empfehlung, auch wenn AUTO_PAUSE an ist.`
      : autoPauseEffektiv
        ? 'AUTO-PAUSE ist AN: Diese Ads werden jetzt automatisch pausiert!'
        : 'AUTO_PAUSE steht auf nein - ich pausiere nichts, nur Empfehlung.';
    killInfo += `${NL}${NL}${bremsHinweis}`;
  }

  const voll = `ADS-MANAGER - ${config.SHOP_NAME}${NL}--------------------${NL}${NL}${briefing}${killInfo}`;
  for (let i = 0; i < voll.length; i += 3900) {
    await notifyTelegram(voll.slice(i, i + 3900));
  }

  if (autoPauseEffektiv) {
    for (const k of killListe) {
      try {
        await pauseAd(k.ad_id);
      } catch (err) {
        console.error(`[11-ads-manager] Pause fehlgeschlagen für ${k.ad_name}:`, err.message || err);
      }
    }
  }

  const datum = new Date().toISOString();
  state.historie.unshift(...killListe.map((k) => ({
    adId: k.ad_id,
    name: k.ad_name,
    roas: Number(k.roas),
    spend: Number(k.spend),
    datum,
    ausgefuehrt: autoPauseEffektiv,
  })));
  if (state.historie.length > MAX_HISTORIE) state.historie = state.historie.slice(0, MAX_HISTORIE);
  saveState(STATE_KEY, state);
  veroeffentliche(state, selbstgebremst);

  console.log(`[11-ads-manager] Briefing versendet, ${killListe.length} Kill-Kandidat(en)${selbstgebremst ? ' (selbstgebremst)' : ''}, autoPauseEffektiv=${autoPauseEffektiv}.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[11-ads-manager] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[11-ads-manager] Fehler:', err);
  process.exit(1);
});
