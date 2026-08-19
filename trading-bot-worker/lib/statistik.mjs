// Reine Auswertungsfunktionen über bereits gespeicherte Trade-Historie -
// keine API-Calls, keine Seiteneffekte. Genutzt von worker.js (Status-
// Endpoint, Digests) für Kennzahlen, die nirgendwo sonst berechnet werden
// müssen.

// Reine Kennzahlen aus der Trade-Historie - keine Prognose, nur "was ist
// bisher passiert" (letzte MAX_TRADES_IM_STATE abgeschlossenen Trades).
export function berechneTradeStats(trades) {
  if (!trades.length) return { anzahlTrades: 0, winRateProzent: null, avgGewinnProzent: null };
  const gewinnTrades = trades.filter((t) => t.gewinnVerlustUsdt > 0).length;
  const avgGewinnProzent = trades.reduce((sum, t) => sum + t.gewinnProzent, 0) / trades.length;
  return {
    anzahlTrades: trades.length,
    winRateProzent: (gewinnTrades / trades.length) * 100,
    avgGewinnProzent,
  };
}

// Grobe Ampel-Einschätzung, ob der Paper-Bot bisher "reif genug" für
// Echtgeld WIRKT - KEINE Finanzberatung, KEINE Erfolgsgarantie, nur ein
// Hinweis basierend auf den bisherigen eigenen Paper-Zahlen. Nutzt bewusst
// NUR Daten, die der Bot selbst schon hat (kein neuer API-Call): Anzahl
// abgeschlossener Trades, Gesamt-Win-Rate, Gesamt-P&L, ob irgendein Symbol
// gerade seinen Kill-Switch ausgelöst hat. Ein aktiver Kill-Switch ist
// IMMER Rot, unabhängig von allem anderen - das war ein echter Verlust bis
// zur konfigurierten Grenze.
export function berechneReadiness(symbole, alleTrades) {
  const anzahlTrades = alleTrades.length;
  const gewinnTradesGesamt = alleTrades.filter((t) => t.gewinnVerlustUsdt > 0).length;
  const winRateProzent = anzahlTrades > 0 ? (gewinnTradesGesamt / anzahlTrades) * 100 : null;
  const gesamtKapital = symbole.reduce((sum, s) => sum + s.kapital, 0);
  const gesamtStartKapital = symbole.reduce((sum, s) => sum + s.startKapital, 0);
  const gesamtProzent = gesamtStartKapital > 0 ? ((gesamtKapital - gesamtStartKapital) / gesamtStartKapital) * 100 : 0;
  const killSwitchAktiv = symbole.some((s) => s.killSwitchAktiv);

  let ampel, grund;
  if (killSwitchAktiv) {
    ampel = 'rot';
    grund = 'Mindestens ein Symbol hat gerade seinen Kill-Switch ausgelöst (Gesamtverlust-Grenze erreicht).';
  } else if (anzahlTrades < 10) {
    ampel = 'rot';
    grund = `Erst ${anzahlTrades} abgeschlossene Trades - zu wenig Daten für eine verlässliche Einschätzung (Richtwert: mind. 30).`;
  } else if (gesamtProzent < 0) {
    ampel = 'rot';
    grund = `Insgesamt im Minus (${gesamtProzent.toFixed(1)}%) - noch nicht bereit für Echtgeld.`;
  } else if (anzahlTrades < 30 || (winRateProzent !== null && winRateProzent < 50)) {
    ampel = 'gelb';
    grund = `${anzahlTrades} Trades, Win-Rate ${winRateProzent !== null ? winRateProzent.toFixed(0) : '–'}% - positiv, aber noch nicht genug Daten oder Trefferquote für eine klare Empfehlung.`;
  } else {
    ampel = 'gruen';
    grund = `${anzahlTrades} Trades, Win-Rate ${winRateProzent.toFixed(0)}%, Gesamt ${gesamtProzent >= 0 ? '+' : ''}${gesamtProzent.toFixed(1)}% - wirkt nach bisherigen Paper-Zahlen reif für einen vorsichtigen Echtgeld-Test.`;
  }
  return { ampel, grund, anzahlTrades, winRateProzent, gesamtProzent, hinweis: 'Keine Finanzberatung, keine Erfolgsgarantie - nur eine grobe Einschätzung aus den bisherigen Paper-Zahlen.' };
}
