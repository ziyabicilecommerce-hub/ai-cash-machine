// Monte-Carlo-Simulation der EIGENEN Trade-Historie (Pendant zum
// Krypto-Bot). Bootstrap-Resampling (zieht zufällig, mit Zurücklegen, aus
// den echten abgeschlossenen Trades dieses Symbols) simuliert tausende
// plausible Zukunftspfade, statt eine einzelne Prognose zu behaupten.
// Zeigt eine Bandbreite möglicher Ergebnisse (Perzentile) UND die
// Wahrscheinlichkeit, den eigenen Kill-Switch in den nächsten Trades zu
// erreichen.
//
// WICHTIG, unmissverständlich: KEINE Vorhersage, keine KI, reine Statistik
// unter der Annahme, dass künftige Trades sich ÄHNLICH VERTEILEN wie die
// bisherigen. Bei wenigen Trades entsprechend unzuverlässig (siehe
// MIN_TRADES). Rein informativ: verändert NIE Kapital oder Position.
//
// Läuft wöchentlich (montags) mit den anderen Wochen-Checks - reine
// In-Memory-Rechnung, kein externer API-Call.

import { loadState } from './state.mjs';

const SIMULATIONEN = 2000;
const ZUKUENFTIGE_TRADES = 30;
const MIN_TRADES = 15;

function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

function simuliereEinenPfad(renditenProzent, startKapital, gesamtverlustSchwelleProzent) {
  let kapital = startKapital;
  let killSwitchGetroffen = false;
  for (let i = 0; i < ZUKUENFTIGE_TRADES; i++) {
    if (killSwitchGetroffen) break;
    const zufaelligeRendite = renditenProzent[Math.floor(Math.random() * renditenProzent.length)];
    kapital *= 1 + zufaelligeRendite / 100;
    if (((kapital - startKapital) / startKapital) * 100 <= -gesamtverlustSchwelleProzent) killSwitchGetroffen = true;
  }
  return { kapitalEnde: kapital, killSwitchGetroffen };
}

function perzentil(sortiert, p) {
  const index = Math.min(sortiert.length - 1, Math.max(0, Math.floor(p * sortiert.length)));
  return sortiert[index];
}

function simuliere(trades, startKapital, gesamtverlustSchwelleProzent) {
  const renditenProzent = trades.map((t) => t.gewinnProzent);
  const endWerte = [];
  let killSwitchTreffer = 0;
  for (let i = 0; i < SIMULATIONEN; i++) {
    const { kapitalEnde, killSwitchGetroffen } = simuliereEinenPfad(renditenProzent, startKapital, gesamtverlustSchwelleProzent);
    endWerte.push(kapitalEnde);
    if (killSwitchGetroffen) killSwitchTreffer++;
  }
  endWerte.sort((a, b) => a - b);
  return {
    anzahlSimulationen: SIMULATIONEN,
    anzahlZukuenftigeTrades: ZUKUENFTIGE_TRADES,
    basisTrades: trades.length,
    startKapital,
    p5: perzentil(endWerte, 0.05),
    p25: perzentil(endWerte, 0.25),
    p50: perzentil(endWerte, 0.5),
    p75: perzentil(endWerte, 0.75),
    p95: perzentil(endWerte, 0.95),
    wahrscheinlichkeitProfitabelProzent: (endWerte.filter((k) => k > startKapital).length / SIMULATIONEN) * 100,
    wahrscheinlichkeitKillSwitchProzent: (killSwitchTreffer / SIMULATIONEN) * 100,
  };
}

export async function pruefeUndAktualisiereMonteCarlo(env, cfg) {
  if (!cfg.monteCarlo) return;
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return;
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.STOCKS_STATE.get('montecarlo:letzteWoche');
  if (letzte === aktuelleWoche) return;

  for (const symbol of cfg.symbols) {
    try {
      const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
      const trades = state.trades || [];
      if (trades.length < MIN_TRADES) continue;
      const ergebnis = simuliere(trades, state.kapital, cfg.maxGesamtverlustProzent);
      await env.STOCKS_STATE.put(`montecarlo:${symbol}`, JSON.stringify({ ...ergebnis, berechnetAm: jetzt.toISOString() }));
    } catch (err) {
      console.error(`[stocks-bot] Monte-Carlo ${symbol} fehlgeschlagen:`, err);
    }
  }
  await env.STOCKS_STATE.put('montecarlo:letzteWoche', aktuelleWoche);
}
