// Adaptives Lernen aus der EIGENEN Trade-Historie - KEIN KI-/LLM-Modell,
// reine Statistik über bereits abgeschlossene eigene Trades. Passt den
// Stop-Loss-Prozentsatz pro Symbol periodisch an die real beobachtete
// Verlust-Streuung dieser Aktie an, statt für immer beim global
// konfigurierten STOCKS_STOP_LOSS_PROZENT zu bleiben. Wortgleiches Pendant
// zu trading-bot-worker/lib/learning.mjs (Krypto-Bot) - hier eigenständig,
// weil dieser Worker unabhängig deploybar ist (kein geteiltes node_modules).
// wochenSchluessel() ist hier inline statt aus reports.mjs importiert, weil
// der Stocks-Bot (bewusst schlanker Start) keine Wochen-/Monats-Reports hat.
//
// Läuft nur, wenn der Markt gerade offen ist (runAll() im Worker prüft das
// schon vorher) - reicht für "einmal pro Woche", da Alpaca ohnehin nur
// während Handelszeiten läuft.
//
// Sicherheits-Leitplanken (identisch zum Krypto-Bot):
// - Erst ab STOCKS_ADAPTIVES_LERNEN_MIN_TRADES abgeschlossenen Verlust-
//   Trades für dieses Symbol (Default 10) - sonst zu wenig Daten, zu verrauscht.
// - Nie unter 1% und nie außerhalb des 0.5x-2x-Bands um den konfigurierten
//   Standard-Stop-Loss.
// - Wirkt sich NUR auf NEU eröffnete Positionen aus (beim Einstieg einmalig
//   eingefroren) - eine bereits offene Position wird nie nachträglich verändert.
// - Komplett AUS per Default (STOCKS_ADAPTIVES_LERNEN = "nein").

import { loadState, saveState } from './state.mjs';
import { notify } from './notify.mjs';

function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

function berechneGelerntenStopLossProzent(trades, cfg) {
  const verlustTrades = (trades || []).filter((t) => t.gewinnVerlustUsdt < 0);
  if (verlustTrades.length < cfg.adaptivesLernenMinTrades) return null;
  const avgVerlustProzent = verlustTrades.reduce((sum, t) => sum + Math.abs(t.gewinnProzent), 0) / verlustTrades.length;
  const minimum = Math.max(1, cfg.stopLossProzent * 0.5);
  const maximum = cfg.stopLossProzent * 2;
  return Math.min(maximum, Math.max(minimum, avgVerlustProzent));
}

export async function pruefeUndFuehreAdaptivesLernen(env, cfg) {
  if (!cfg.adaptivesLernen) return;
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.STOCKS_STATE.get('lernen:letzteWoche');
  if (letzte === aktuelleWoche) return;

  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    const neuerWert = berechneGelerntenStopLossProzent(state.trades, cfg);
    if (neuerWert === null) continue;

    const bisherigerWert = state.gelernterStopLossProzent;
    if (bisherigerWert != null && Math.abs(bisherigerWert - neuerWert) < 0.1) continue;

    state.gelernterStopLossProzent = neuerWert;
    await saveState(env, symbol, state);
    await notify(env, `🧠 Adaptives Lernen (${symbol}): Stop-Loss aus den letzten Verlust-Trades neu berechnet - ${neuerWert.toFixed(2)}% (vorher ${bisherigerWert != null ? bisherigerWert.toFixed(2) + '%' : `${cfg.stopLossProzent}% Standard`}). Gilt ab der nächsten neu eröffneten Position, bestehende Positionen bleiben unverändert.`);
  }

  await env.STOCKS_STATE.put('lernen:letzteWoche', aktuelleWoche);
}
