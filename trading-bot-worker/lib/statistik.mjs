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

// Go-Live-Readiness-Score: zieht ALLE bisher einzeln berechneten Signale
// (Trade-Historie, Risiko-Kennzahlen, Monte-Carlo-Simulation, Auto-
// Backtest gegen echte Kerzen, Korrelationsrisiko) zu EINER Zahl (0-100)
// zusammen, statt 15 verstreute Werte einzeln lesen zu müssen. Reine
// Diagnose-Kennzahl aus bereits vorhandenen Daten - KEIN neuer API-Call,
// KEINE Vorhersage, KEIN automatischer Trigger. Ob und wann echtes Geld
// eingesetzt wird, bleibt immer eine eigene Entscheidung des Nutzers
// außerhalb dieses Bots (eigener Broker-Account, eigenes KYC).
export function berechneGoLiveScore(symbole, alleTrades, portfolioKennzahlen, korrelation) {
  const anzahlTrades = alleTrades.length;
  const gewinnTrades = alleTrades.filter((t) => t.gewinnVerlustUsdt > 0).length;
  const winRateProzent = anzahlTrades > 0 ? (gewinnTrades / anzahlTrades) * 100 : null;
  const killSwitchAktiv = symbole.some((s) => s.killSwitchAktiv);
  const teilwertungen = [];

  // 1) Stichprobengröße & Trefferquote (0-30) - genug abgeschlossene
  // Trades und eine Trefferquote über der Zufallsmarke sind die
  // Grundvoraussetzung, bevor irgendeine andere Kennzahl belastbar ist.
  let stichprobe = Math.min(20, (anzahlTrades / 50) * 20);
  if (winRateProzent !== null) stichprobe += Math.min(10, Math.max(0, ((winRateProzent - 40) / 20) * 10));
  teilwertungen.push({
    name: 'Stichprobengröße & Trefferquote', punkte: Math.round(Math.min(30, stichprobe)), maxPunkte: 30,
    hinweis: `${anzahlTrades} abgeschlossene Trades, Win-Rate ${winRateProzent !== null ? winRateProzent.toFixed(0) + '%' : '–'}`,
  });

  // 2) Profit Factor & Recovery Factor (0-25) - aus berechneRisikoKennzahlen.
  const { profitFactor, recoveryFactor } = portfolioKennzahlen;
  let risiko = 0;
  if (profitFactor !== null) risiko += Math.min(13, Math.max(0, ((profitFactor - 1) / 1.5) * 13));
  if (recoveryFactor !== null) risiko += Math.min(12, Math.max(0, (recoveryFactor / 3) * 12));
  teilwertungen.push({
    name: 'Profit Factor & Recovery Factor', punkte: Math.round(Math.min(25, risiko)), maxPunkte: 25,
    hinweis: `Profit Factor ${profitFactor !== null ? profitFactor.toFixed(2) : '–'}, Recovery Factor ${recoveryFactor !== null ? recoveryFactor.toFixed(2) : '–'}`,
  });

  // 3) Monte-Carlo-Simulation (0-25) - Durchschnitt über alle Symbole mit
  // genug eigener Historie (siehe montecarlo.mjs, MIN_TRADES = 15).
  const mcSymbole = symbole.filter((s) => s.monteCarlo);
  let monteCarlo = 0;
  let mcHinweis = 'Noch keine Monte-Carlo-Daten (mind. 15 Trades pro Symbol nötig, läuft montags).';
  if (mcSymbole.length) {
    const avgProfitabel = mcSymbole.reduce((s, sym) => s + sym.monteCarlo.wahrscheinlichkeitProfitabelProzent, 0) / mcSymbole.length;
    const avgKillSwitch = mcSymbole.reduce((s, sym) => s + sym.monteCarlo.wahrscheinlichkeitKillSwitchProzent, 0) / mcSymbole.length;
    monteCarlo = Math.min(15, (avgProfitabel / 100) * 15) + Math.min(10, Math.max(0, (1 - avgKillSwitch / 50) * 10));
    mcHinweis = `Ø ${avgProfitabel.toFixed(0)}% Wahrscheinlichkeit profitabel, Ø ${avgKillSwitch.toFixed(0)}% Wahrscheinlichkeit Kill-Switch (${mcSymbole.length}/${symbole.length} Symbole simuliert)`;
  }
  teilwertungen.push({ name: 'Monte-Carlo-Simulation', punkte: Math.round(Math.min(25, monteCarlo)), maxPunkte: 25, hinweis: mcHinweis });

  // 4) Auto-Backtest-Übereinstimmung (0-10) - simuliert die AKTUELL
  // konfigurierte Live-Strategie gegen echte Kerzen der letzten 14 Tage.
  const btSymbole = symbole.filter((s) => s.autoBacktest);
  let backtest = 0;
  let btHinweis = 'Noch keine Auto-Backtest-Daten (läuft montags).';
  if (btSymbole.length) {
    const profitableAnzahl = btSymbole.filter((s) => s.autoBacktest.gesamtReturnProzent > 0).length;
    backtest = (profitableAnzahl / btSymbole.length) * 10;
    btHinweis = `${profitableAnzahl}/${btSymbole.length} Symbole im 14-Tage-Backtest profitabel`;
  }
  teilwertungen.push({ name: 'Auto-Backtest (14 Tage, echte Kerzen)', punkte: Math.round(Math.min(10, backtest)), maxPunkte: 10, hinweis: btHinweis });

  // 5) Korrelations-/Konzentrationsrisiko (0-10) - viele stark korrelierte
  // Symbole heißt in Wahrheit: das Portfolio bewegt sich wie EIN Trade.
  let korrelationsPunkte = 10;
  let korrHinweis = 'Noch keine Korrelationsdaten vorhanden (läuft montags mit dem Auto-Backtest).';
  if (korrelation && korrelation.matrix) {
    const symboleImNamen = Object.keys(korrelation.matrix);
    let starkKorreliert = 0;
    for (let i = 0; i < symboleImNamen.length; i++) {
      for (let j = i + 1; j < symboleImNamen.length; j++) {
        const wert = korrelation.matrix[symboleImNamen[i]]?.[symboleImNamen[j]];
        if (wert !== null && wert !== undefined && Math.abs(wert) >= 0.7) starkKorreliert++;
      }
    }
    korrelationsPunkte = Math.max(0, 10 - starkKorreliert * 3);
    korrHinweis = `${starkKorreliert} Symbol-Paar(e) mit Korrelation ≥ 0.7 der letzten ${korrelation.tageZurueck ?? '?'} Tage`;
  }
  teilwertungen.push({ name: 'Korrelations-/Konzentrationsrisiko', punkte: Math.round(korrelationsPunkte), maxPunkte: 10, hinweis: korrHinweis });

  let score = teilwertungen.reduce((s, t) => s + t.punkte, 0);
  if (killSwitchAktiv) score = Math.min(score, 20); // Kill-Switch überstimmt jede Teilwertung

  let ampel, einschaetzung;
  if (killSwitchAktiv) { ampel = 'rot'; einschaetzung = 'Kill-Switch aktiv - unabhängig vom Score aktuell nicht bereit.'; }
  else if (score < 40) { ampel = 'rot'; einschaetzung = 'Noch zu früh - zu wenige oder zu schwache Signale insgesamt.'; }
  else if (score < 70) { ampel = 'gelb'; einschaetzung = 'Auf gutem Weg, aber noch keine klare Empfehlung.'; }
  else { ampel = 'gruen'; einschaetzung = 'Alle bisherigen Paper-Signale sprechen konsistent für die Strategie.'; }

  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    maxScore: 100,
    ampel,
    einschaetzung,
    teilwertungen,
    hinweis: 'Reine Diagnose aus den bisherigen Paper-Zahlen und Simulationen - KEINE Finanzberatung, KEINE Erfolgsgarantie und KEIN automatischer Trigger. Ob und wann echtes Geld eingesetzt wird, entscheidest ausschließlich du selbst, außerhalb dieses Bots, über deinen eigenen Broker-Account.',
  };
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
