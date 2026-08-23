// "Bist du besser als der Markt?" - vergleicht die eigene Paper-Portfolio-
// Rendite mit einem simplen Buy-&-Hold DERSELBEN Symbole seit dem jeweils
// ersten eigenen Trade, gewichtet nach Startkapital-Anteil. Beantwortet die
// klassische Frage "hat die aktive Strategie überhaupt einen Vorteil
// gegenüber Kaufen-und-Liegenlassen?" - reiner Nachher-Vergleich, ändert nie
// eine Order. Nur 2 öffentliche Klines-Abrufe pro konfiguriertem Symbol,
// 1x pro Woche - kein zusätzliches Rate-Limit-Risiko. Läuft als Teil der
// Montags-Wartung.

import { loadState } from './state.mjs';
import { EXCHANGES } from './exchanges.mjs';

function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

export async function pruefeUndAktualisiereBenchmark(env, cfg) {
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags, wie die anderen Wochen-Checks
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.TRADING_STATE.get('benchmark:letzteWoche');
  if (letzte === aktuelleWoche) return;

  let gesamtKapital = 0, gesamtStart = 0;
  let startKapitalMitTrades = 0, gewichteteBuyHoldSumme = 0;
  const proSymbol = [];

  for (const symbol of cfg.symbols) {
    const adapter = EXCHANGES[cfg.exchangeProSymbol[symbol] || cfg.exchange];
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    const trades = state.trades || [];
    gesamtKapital += state.kapital;
    gesamtStart += state.startKapital;
    if (!trades.length) continue;
    const ersterTrade = trades.reduce((min, t) => (new Date(t.einstiegAm) < new Date(min.einstiegAm) ? t : min), trades[0]);
    try {
      const buyHold = await adapter.getBuyHoldRendite(symbol, ersterTrade.einstiegAm);
      if (buyHold) {
        startKapitalMitTrades += state.startKapital;
        gewichteteBuyHoldSumme += buyHold.renditeProzent * state.startKapital;
        proSymbol.push({ symbol, seit: ersterTrade.einstiegAm, buyHoldRenditeProzent: buyHold.renditeProzent });
      }
    } catch (err) {
      console.error(`[trading-bot] Benchmark ${symbol} fehlgeschlagen:`, err);
    }
  }

  if (!proSymbol.length || gesamtStart <= 0 || !startKapitalMitTrades) return; // noch keine Trade-Historie - kein sinnvoller Vergleich möglich

  const botRenditeProzent = ((gesamtKapital / gesamtStart) - 1) * 100;
  const buyHoldRenditeProzent = gewichteteBuyHoldSumme / startKapitalMitTrades;

  await env.TRADING_STATE.put('benchmark:letzte', JSON.stringify({
    datum: jetzt.toISOString(),
    botRenditeProzent,
    buyHoldRenditeProzent,
    proSymbol,
  }));
  await env.TRADING_STATE.put('benchmark:letzteWoche', aktuelleWoche);
}
