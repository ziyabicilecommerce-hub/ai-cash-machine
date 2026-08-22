// Wöchentlicher Schnappschuss des Go-Live-Readiness-Scores - macht aus
// einer reinen Momentaufnahme (nur "wie steht's JETZT") einen echten
// Trend ("wird das System über Zeit tatsächlich reifer, oder nicht").
// Läuft als letzter Schritt der Montags-Wartung, NACH Auto-Backtest,
// Monte-Carlo und Signal-Digest - liest nur bereits geschriebene KV-Werte
// plus den ohnehin für jedes Symbol vorhandenen State (kein zusätzlicher
// externer API-Call, kein Preis-/Indikatoren-Abruf nötig - der Score
// braucht keine Live-Kurse). Speichert die letzten 12 Wochen, älteres
// wird verworfen statt unbegrenzt zu wachsen.

import { loadState } from './state.mjs';
import { berechneGoLiveScore, berechneRisikoKennzahlen } from './statistik.mjs';

const MAX_EINTRAEGE = 12;

function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

export async function pruefeUndSpeichereScoreVerlauf(env, cfg) {
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags, wie die anderen Wochen-Checks
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.TRADING_STATE.get('scoreverlauf:letzteWoche');
  if (letzte === aktuelleWoche) return;

  const symbole = [];
  const alleTrades = [];
  for (const symbol of cfg.symbols) {
    try {
      const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
      const trades = state.trades || [];
      alleTrades.push(...trades);

      let autoBacktest = null;
      try {
        const raw = await env.TRADING_STATE.get(`backtest:${symbol}`);
        if (raw) autoBacktest = JSON.parse(raw);
      } catch { /* fehlender/kaputter Eintrag - einfach null */ }

      let monteCarlo = null;
      try {
        const raw = await env.TRADING_STATE.get(`montecarlo:${symbol}`);
        if (raw) monteCarlo = JSON.parse(raw);
      } catch { /* fehlender/kaputter Eintrag - einfach null */ }

      symbole.push({ symbol, killSwitchAktiv: state.killSwitchAktiv, autoBacktest, monteCarlo });
    } catch (err) {
      console.error(`[trading-bot] Score-Verlauf ${symbol} fehlgeschlagen:`, err);
    }
  }

  let korrelation = null;
  try {
    const raw = await env.TRADING_STATE.get('korrelation:matrix');
    if (raw) korrelation = JSON.parse(raw);
  } catch { /* fehlender/kaputter Eintrag - einfach null */ }

  const portfolioKennzahlen = berechneRisikoKennzahlen(alleTrades);
  const score = berechneGoLiveScore(symbole, alleTrades, portfolioKennzahlen, korrelation);

  let verlauf = [];
  try {
    const raw = await env.TRADING_STATE.get('scoreverlauf');
    if (raw) verlauf = JSON.parse(raw);
  } catch { /* kaputter Eintrag - neu anfangen */ }

  verlauf.push({ woche: aktuelleWoche, datum: jetzt.toISOString(), score: score.score, ampel: score.ampel });
  if (verlauf.length > MAX_EINTRAEGE) verlauf = verlauf.slice(-MAX_EINTRAEGE);

  await env.TRADING_STATE.put('scoreverlauf', JSON.stringify(verlauf));
  await env.TRADING_STATE.put('scoreverlauf:letzteWoche', aktuelleWoche);
}
