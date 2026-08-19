// Adaptives Lernen aus der EIGENEN Trade-Historie - KEIN KI-/LLM-Modell,
// reine Statistik über bereits abgeschlossene eigene Trades. Passt den
// Stop-Loss-Prozentsatz pro Symbol periodisch an die real beobachtete
// Verlust-Streuung dieses Coins an, statt für immer beim global
// konfigurierten TRADING_STOP_LOSS_PROZENT zu bleiben. Läuft wie das
// Kapital-Rebalancing einmal pro Woche (montags) im 5-Minuten-Cron mit.
//
// Sicherheits-Leitplanken:
// - Erst ab TRADING_ADAPTIVES_LERNEN_MIN_TRADES abgeschlossenen Verlust-
//   Trades für dieses Symbol (Default 10) - sonst zu wenig Daten, zu verrauscht.
// - Nie unter 1% und nie außerhalb des 0.5x-2x-Bands um den konfigurierten
//   Standard-Stop-Loss - verhindert, dass ein einzelner Ausreißer-Trade den
//   Wert auf etwas Unsinniges zieht oder er über die Zeit unkontrolliert wegdriftet.
// - Wirkt sich NUR auf NEU eröffnete Positionen aus (beim Einstieg einmalig
//   eingefroren, wie position.entryAtr) - eine bereits offene Position wird
//   nie nachträglich verändert.
// - Komplett AUS per Default (TRADING_ADAPTIVES_LERNEN = "nein"), wie alle
//   neuen Risiko-Features hier.
// - Kann NICHT wie die klassischen Filter per Einzel-Backtest validiert
//   werden (backtest.mjs simuliert aktuell einen Lauf mit fixen Parametern,
//   kein wöchentliches Nachjustieren mitten in der Simulation) - deshalb
//   erst eine Weile live im Paper-Modus beobachten, bevor man sich darauf
//   verlässt.

import { loadState, saveState } from './state.mjs';
import { notifyWhatsapp } from './notify.mjs';
import { wochenSchluessel } from './reports.mjs';

// Durchschnittlicher (absoluter) Verlust-Prozentsatz der letzten Verlust-
// Trades - Grundlage für den neuen Stop-Loss-Vorschlag. null, wenn zu wenige
// Verlust-Trades vorliegen (dann bleibt der bisherige/konfigurierte Wert
// unverändert).
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
  if (jetzt.getUTCDay() !== 1) return; // nur montags, wie Rebalancing/Wochenrückblick
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.TRADING_STATE.get('lernen:letzteWoche');
  if (letzte === aktuelleWoche) return;

  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    const neuerWert = berechneGelerntenStopLossProzent(state.trades, cfg);
    if (neuerWert === null) continue;

    const bisherigerWert = state.gelernterStopLossProzent;
    // Nur speichern/melden, wenn sich wirklich etwas ändert (>0.1 Prozentpunkte) -
    // sonst jede Woche dieselbe Nachricht trotz praktisch identischem Wert.
    if (bisherigerWert != null && Math.abs(bisherigerWert - neuerWert) < 0.1) continue;

    state.gelernterStopLossProzent = neuerWert;
    await saveState(env, symbol, state);
    await notifyWhatsapp(env, `🧠 Adaptives Lernen (${symbol}): Stop-Loss aus den letzten Verlust-Trades neu berechnet - ${neuerWert.toFixed(2)}% (vorher ${bisherigerWert != null ? bisherigerWert.toFixed(2) + '%' : `${cfg.stopLossProzent}% Standard`}). Gilt ab der nächsten neu eröffneten Position, bestehende Positionen bleiben unverändert.`);
  }

  await env.TRADING_STATE.put('lernen:letzteWoche', aktuelleWoche);
}
