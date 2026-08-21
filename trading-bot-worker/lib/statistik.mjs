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

function stddev(werte) {
  if (werte.length < 2) return null;
  const mittel = werte.reduce((s, w) => s + w, 0) / werte.length;
  const varianz = werte.reduce((s, w) => s + (w - mittel) ** 2, 0) / (werte.length - 1);
  return Math.sqrt(varianz);
}

// Erweiterte Risiko-/Performance-Kennzahlen über die Trade-Historie - reine
// Statistik, keine Prognose. Sharpe/Sortino sind BEWUSST NICHT die
// klassischen annualisierten Lehrbuch-Kennzahlen (dafür bräuchte es
// gleichmäßig getaktete Perioden-Renditen, z.B. täglich - Trades sind
// unregelmäßig getaktet) - stattdessen eine "pro Trade"-Variante (Ø Rendite
// pro Trade / Streuung der Rendite über alle abgeschlossenen Trades), klar
// so benannt (sharpeProTrade/sortinoProTrade), um sie nicht mit der
// Standard-Definition zu verwechseln.
export function berechneRisikoKennzahlen(trades) {
  if (!trades.length) {
    return { profitFactor: null, expectancyUsdt: null, avgGewinnUsdt: null, avgVerlustUsdt: null, sharpeProTrade: null, sortinoProTrade: null, recoveryFactor: null };
  }
  const gewinne = trades.filter((t) => t.gewinnVerlustUsdt > 0);
  const verluste = trades.filter((t) => t.gewinnVerlustUsdt < 0);
  const summeGewinne = gewinne.reduce((s, t) => s + t.gewinnVerlustUsdt, 0);
  const summeVerluste = verluste.reduce((s, t) => s + t.gewinnVerlustUsdt, 0);
  const profitFactor = summeVerluste === 0 ? null : summeGewinne / Math.abs(summeVerluste);
  const expectancyUsdt = trades.reduce((s, t) => s + t.gewinnVerlustUsdt, 0) / trades.length;
  const avgGewinnUsdt = gewinne.length ? summeGewinne / gewinne.length : null;
  const avgVerlustUsdt = verluste.length ? summeVerluste / verluste.length : null;

  const renditen = trades.map((t) => t.gewinnProzent);
  const mittelRendite = renditen.reduce((s, r) => s + r, 0) / renditen.length;
  const streuung = stddev(renditen);
  const sharpeProTrade = streuung ? mittelRendite / streuung : null;
  const negativeRenditen = renditen.filter((r) => r < 0);
  const downsideStreuung = negativeRenditen.length >= 2 ? stddev(negativeRenditen) : null;
  const sortinoProTrade = downsideStreuung ? mittelRendite / downsideStreuung : null;

  // Recovery Factor: Netto-Ergebnis relativ zum größten Rückgang vom
  // bisherigen Höchststand (aus der Trade-Reihenfolge rekonstruiert, in
  // absoluter Währung - unabhängig vom tatsächlichen Kapitalstand).
  let kapitalReferenz = 0, peak = 0, maxDrawdownUsdt = 0;
  const sortiert = [...trades].sort((a, b) => new Date(a.ausstiegAm) - new Date(b.ausstiegAm));
  for (const t of sortiert) {
    kapitalReferenz += t.gewinnVerlustUsdt;
    peak = Math.max(peak, kapitalReferenz);
    maxDrawdownUsdt = Math.max(maxDrawdownUsdt, peak - kapitalReferenz);
  }
  const nettoErgebnisUsdt = trades.reduce((s, t) => s + t.gewinnVerlustUsdt, 0);
  const recoveryFactor = maxDrawdownUsdt > 0 ? nettoErgebnisUsdt / maxDrawdownUsdt : null;

  return { profitFactor, expectancyUsdt, avgGewinnUsdt, avgVerlustUsdt, sharpeProTrade, sortinoProTrade, recoveryFactor };
}
