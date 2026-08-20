// Periodische WhatsApp-Rückblicke (Tag/Woche/Monat) und das Smart-Kapital-
// Rebalancing - alle laufen "nebenbei" im ohnehin alle 5 Minuten laufenden
// Cron mit, verschicken/handeln aber wirklich nur zum jeweils passenden
// Zeitpunkt (KV-Marken verhindern Mehrfachauslösung).

import { heute, loadState, saveState } from './state.mjs';
import { notify } from './notify.mjs';
import { berechneTradeStats, berechneReadiness } from './statistik.mjs';

export async function pruefeUndSendeTagesZusammenfassung(env, cfg) {
  const heuteStr = heute();
  const letzte = await env.TRADING_STATE.get('digest:letzterTag');
  if (letzte === heuteStr) return;

  let gesamtKapitalJetzt = 0, gesamtStartKapital = 0, offenePositionen = 0;
  const killSwitchSymbole = [];
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    gesamtKapitalJetzt += state.kapital;
    gesamtStartKapital += state.startKapital;
    if (state.position) offenePositionen++;
    if (state.killSwitchAktiv) killSwitchSymbole.push(symbol);
  }
  const gesamtProzent = gesamtStartKapital > 0 ? ((gesamtKapitalJetzt - gesamtStartKapital) / gesamtStartKapital) * 100 : 0;

  const text = `📊 Trading-Bot Tages-Update (${cfg.paperModus ? 'PAPER' : 'LIVE'}, ${cfg.exchange}):\n` +
    `Kapital gesamt: ${gesamtKapitalJetzt.toFixed(2)} USDT (Start: ${gesamtStartKapital.toFixed(2)} USDT, ${gesamtProzent >= 0 ? '+' : ''}${gesamtProzent.toFixed(2)}%)\n` +
    `Offene Positionen: ${offenePositionen}/${cfg.symbols.length}` +
    (killSwitchSymbole.length ? `\n🛑 Kill-Switch aktiv bei: ${killSwitchSymbole.join(', ')}` : '');

  await notify(env, text);
  await env.TRADING_STATE.put('digest:letzterTag', heuteStr);
}

// ISO-Kalenderwoche als Schlüssel (Jahr-KW), bleibt über Jahreswechsel hinweg
// eindeutig. Exportiert, damit lib/learning.mjs dieselbe "einmal pro Woche"-
// Logik nutzt statt sie ein zweites Mal zu implementieren.
export function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

// Einmal pro Kalenderwoche (montags) ein ausführlicherer Rückblick als das
// tägliche Update: P&L nur der letzten 7 Tage, bester/schlechtester Coin,
// Win-Rate-Trend - damit man nicht mehr manuell im Dashboard nachschauen muss,
// wie die Woche insgesamt lief. KV-Marke digest:letzteWoche verhindert
// Mehrfachversand bei mehreren Montags-Läufen.
export async function pruefeUndSendeWochenZusammenfassung(env, cfg) {
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags prüfen
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.TRADING_STATE.get('digest:letzteWoche');
  if (letzte === aktuelleWoche) return;

  const seitZeitpunkt = jetzt.getTime() - 7 * 24 * 60 * 60 * 1000;
  let gesamtKapitalJetzt = 0, gesamtStartKapital = 0;
  const proSymbolPL = [];
  const allTradesDieseWoche = [];
  const alleTradesLifetime = [];
  const symboleFuerReadiness = [];
  const proStrategiePL = {}; // strategie -> { plDieseWoche, anzahlTrades }
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    gesamtKapitalJetzt += state.kapital;
    gesamtStartKapital += state.startKapital;
    const tradesDieseWoche = (state.trades || []).filter((t) => new Date(t.ausstiegAm).getTime() >= seitZeitpunkt);
    const plDieseWoche = tradesDieseWoche.reduce((sum, t) => sum + t.gewinnVerlustUsdt, 0);
    proSymbolPL.push({ symbol, plDieseWoche, anzahlTrades: tradesDieseWoche.length });
    allTradesDieseWoche.push(...tradesDieseWoche);
    alleTradesLifetime.push(...(state.trades || []));
    symboleFuerReadiness.push({ kapital: state.kapital, startKapital: state.startKapital, killSwitchAktiv: state.killSwitchAktiv });

    const strategie = cfg.strategieProSymbol[symbol] || cfg.strategie;
    if (!proStrategiePL[strategie]) proStrategiePL[strategie] = { plDieseWoche: 0, anzahlTrades: 0 };
    proStrategiePL[strategie].plDieseWoche += plDieseWoche;
    proStrategiePL[strategie].anzahlTrades += tradesDieseWoche.length;
  }
  const gesamtProzent = gesamtStartKapital > 0 ? ((gesamtKapitalJetzt - gesamtStartKapital) / gesamtStartKapital) * 100 : 0;
  const statsWoche = berechneTradeStats(allTradesDieseWoche);

  const gehandelt = proSymbolPL.filter((s) => s.anzahlTrades > 0).sort((a, b) => b.plDieseWoche - a.plDieseWoche);
  const bester = gehandelt[0];
  const schlechtester = gehandelt.length > 1 ? gehandelt[gehandelt.length - 1] : null;

  const zeilen = [
    `📅 Trading-Bot Wochen-Rückblick (${cfg.paperModus ? 'PAPER' : 'LIVE'}, ${cfg.exchange}):`,
    `Kapital gesamt: ${gesamtKapitalJetzt.toFixed(2)} USDT (${gesamtProzent >= 0 ? '+' : ''}${gesamtProzent.toFixed(2)}% seit Start)`,
    `Trades diese Woche: ${allTradesDieseWoche.length}${statsWoche.winRateProzent !== null ? ` (Win-Rate ${statsWoche.winRateProzent.toFixed(0)}%)` : ''}`,
  ];
  if (bester) zeilen.push(`🏆 Bester Coin: ${bester.symbol} (${bester.plDieseWoche >= 0 ? '+' : ''}${bester.plDieseWoche.toFixed(2)} USDT)`);
  if (schlechtester) zeilen.push(`📉 Schlechtester Coin: ${schlechtester.symbol} (${schlechtester.plDieseWoche >= 0 ? '+' : ''}${schlechtester.plDieseWoche.toFixed(2)} USDT)`);

  // Nur relevant/interessant, wenn wirklich mehr als eine Strategie parallel
  // läuft (siehe TRADING_STRATEGIE_PRO_SYMBOL) - sonst wäre es identisch
  // zur Gesamtzeile oben.
  const strategieGruppen = Object.entries(proStrategiePL);
  if (strategieGruppen.length > 1) {
    zeilen.push('📊 Strategie-Vergleich diese Woche:');
    for (const [strategie, werte] of strategieGruppen.sort((a, b) => b[1].plDieseWoche - a[1].plDieseWoche)) {
      zeilen.push(`  ${strategie}: ${werte.plDieseWoche >= 0 ? '+' : ''}${werte.plDieseWoche.toFixed(2)} USDT (${werte.anzahlTrades} Trades)`);
    }
  }

  const readiness = berechneReadiness(symboleFuerReadiness, alleTradesLifetime);
  const readinessEmoji = { rot: '🔴', gelb: '🟡', gruen: '🟢' }[readiness.ampel];
  zeilen.push(`${readinessEmoji} Echtgeld-Readiness: ${readiness.ampel.toUpperCase()} - ${readiness.grund}`);

  await notify(env, zeilen.join('\n'));
  await env.TRADING_STATE.put('digest:letzteWoche', aktuelleWoche);
}

// Einmal pro Kalendermonat (am 1., analog zum wöchentlichen Rückblick) ein
// noch weiter herausgezoomtes Bild: Gesamt-P&L des ganzen Monats,
// bester/schlechtester Coin über den Monat statt nur die Woche. KV-Marke
// digest:letzterMonat (Format "JJJJ-MM") verhindert Mehrfachversand.
export async function pruefeUndSendeMonatsZusammenfassung(env, cfg) {
  const jetzt = new Date();
  if (jetzt.getUTCDate() !== 1) return; // nur am 1. des Monats prüfen
  const aktuellerMonat = `${jetzt.getUTCFullYear()}-${String(jetzt.getUTCMonth() + 1).padStart(2, '0')}`;
  const letzter = await env.TRADING_STATE.get('digest:letzterMonat');
  if (letzter === aktuellerMonat) return;

  const seitZeitpunkt = jetzt.getTime() - 30 * 24 * 60 * 60 * 1000;
  let gesamtKapitalJetzt = 0, gesamtStartKapital = 0;
  const proSymbolPL = [];
  const allTradesDiesenMonat = [];
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    gesamtKapitalJetzt += state.kapital;
    gesamtStartKapital += state.startKapital;
    const tradesDiesenMonat = (state.trades || []).filter((t) => new Date(t.ausstiegAm).getTime() >= seitZeitpunkt);
    const plDiesenMonat = tradesDiesenMonat.reduce((sum, t) => sum + t.gewinnVerlustUsdt, 0);
    proSymbolPL.push({ symbol, plDiesenMonat, anzahlTrades: tradesDiesenMonat.length });
    allTradesDiesenMonat.push(...tradesDiesenMonat);
  }
  const gesamtProzent = gesamtStartKapital > 0 ? ((gesamtKapitalJetzt - gesamtStartKapital) / gesamtStartKapital) * 100 : 0;
  const statsMonat = berechneTradeStats(allTradesDiesenMonat);

  const gehandelt = proSymbolPL.filter((s) => s.anzahlTrades > 0).sort((a, b) => b.plDiesenMonat - a.plDiesenMonat);
  const bester = gehandelt[0];
  const schlechtester = gehandelt.length > 1 ? gehandelt[gehandelt.length - 1] : null;

  const zeilen = [
    `🗓️ Trading-Bot Monats-Rückblick (${cfg.paperModus ? 'PAPER' : 'LIVE'}, ${cfg.exchange}):`,
    `Kapital gesamt: ${gesamtKapitalJetzt.toFixed(2)} USDT (${gesamtProzent >= 0 ? '+' : ''}${gesamtProzent.toFixed(2)}% seit Start)`,
    `Trades diesen Monat: ${allTradesDiesenMonat.length}${statsMonat.winRateProzent !== null ? ` (Win-Rate ${statsMonat.winRateProzent.toFixed(0)}%)` : ''}`,
  ];
  if (bester) zeilen.push(`🏆 Bester Coin: ${bester.symbol} (${bester.plDiesenMonat >= 0 ? '+' : ''}${bester.plDiesenMonat.toFixed(2)} USDT)`);
  if (schlechtester) zeilen.push(`📉 Schlechtester Coin: ${schlechtester.symbol} (${schlechtester.plDiesenMonat >= 0 ? '+' : ''}${schlechtester.plDiesenMonat.toFixed(2)} USDT)`);

  await notify(env, zeilen.join('\n'));
  await env.TRADING_STATE.put('digest:letzterMonat', aktuellerMonat);
}

// ================= SMART-KAPITAL-REBALANCING (optional, Default AUS) =================
// Jeder Coin startet mit gleich viel Kapital, wächst danach aber unabhängig
// über seine eigenen Trades (Compounding). Was OHNE Rebalancing NICHT
// passiert: ein Coin, der konstant schlecht läuft, bekommt nie WENIGER
// Spielraum als ein Coin, der konstant gut läuft - beide traden für immer
// mit ihrem jeweils eigenen (unterschiedlich gewachsenen) Kapital weiter.
// Dieses Feature schiebt einmal pro Woche (montags, gleicher Tag wie der
// Wochenrückblick) einen kleinen Anteil vom aktuell SCHLECHTESTEN zum
// aktuell BESTEN Coin - "Kapital folgt dem, was gerade funktioniert",
// statt stur bei der ursprünglichen Gleichverteilung zu bleiben.
//
// Sicherheits-Leitplanken:
// - Nur Coins mit mindestens rebalancingMinTrades abgeschlossenen Trades
//   zählen mit (zu wenig Daten sonst zu verrauscht für eine Entscheidung).
// - Ein Coin mit gerade OFFENER Position wird nie angefasst (Kapital ist
//   "in der Position", nicht frei verschiebbar).
// - Verschiebt nur rebalancingAnteilProzent des AKTUELLEN Kapitals des
//   schlechtesten Coins (Default 10%) - kein Alles-oder-Nichts, wirkt sich
//   erst über mehrere Wochen spürbar aus.
// - Ändert NUR, wie viel Kapital jeder Coin für seine EIGENEN künftigen
//   Positionsgrößen hat - rührt Stop-Loss/Kill-Switch/Take-Profit nicht an.
export async function pruefeUndFuehreKapitalRebalancing(env, cfg) {
  if (!cfg.rebalancing) return;
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags, wie der Wochenrückblick
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.TRADING_STATE.get('rebalance:letzteWoche');
  if (letzte === aktuelleWoche) return;

  const states = {};
  for (const symbol of cfg.symbols) {
    states[symbol] = await loadState(env, symbol, cfg.startKapitalProSymbol);
  }
  const eligible = cfg.symbols
    .filter((s) => !states[s].position && (states[s].trades || []).length >= cfg.rebalancingMinTrades)
    .map((s) => ({ symbol: s, pnlProzent: ((states[s].kapital - states[s].startKapital) / states[s].startKapital) * 100 }))
    .sort((a, b) => b.pnlProzent - a.pnlProzent);

  // Braucht mindestens 2 vergleichbare Coins UND einen echten Unterschied
  // zwischen ihnen - sonst gäbe es nichts Sinnvolles zu verschieben.
  if (eligible.length < 2 || eligible[0].pnlProzent <= eligible[eligible.length - 1].pnlProzent) {
    await env.TRADING_STATE.put('rebalance:letzteWoche', aktuelleWoche);
    return;
  }

  const bester = eligible[0];
  const schlechtester = eligible[eligible.length - 1];
  const schlechtesterState = states[schlechtester.symbol];
  const besterState = states[bester.symbol];
  const betrag = (schlechtesterState.kapital * cfg.rebalancingAnteilProzent) / 100;
  if (betrag <= 0) {
    await env.TRADING_STATE.put('rebalance:letzteWoche', aktuelleWoche);
    return;
  }

  schlechtesterState.kapital -= betrag;
  besterState.kapital += betrag;
  await saveState(env, schlechtester.symbol, schlechtesterState);
  await saveState(env, bester.symbol, besterState);

  await notify(env, `🔄 Smart-Rebalancing: ${betrag.toFixed(2)} USDT von ${schlechtester.symbol} (${schlechtester.pnlProzent >= 0 ? '+' : ''}${schlechtester.pnlProzent.toFixed(1)}%) zu ${bester.symbol} (${bester.pnlProzent >= 0 ? '+' : ''}${bester.pnlProzent.toFixed(1)}%) verschoben - Kapital folgt dem, was gerade funktioniert.`);
  await env.TRADING_STATE.put('rebalance:letzteWoche', aktuelleWoche);
}
