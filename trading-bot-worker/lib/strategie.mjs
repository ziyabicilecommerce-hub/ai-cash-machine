// Reine Strategie-Logik (keine API-Calls, kein State-Schreiben, keine
// Seiteneffekte) - läuft IDENTISCH im Live-Worker (worker.js) und im
// Backtest (../backtest.mjs). Absichtlich hier ausgelagert, statt in beiden
// Dateien separat zu implementieren: ein Backtest-Ergebnis ist nur dann
// aussagekräftig, wenn er wirklich exakt dieselbe Entscheidungslogik nutzt,
// die auch live handelt - sonst testet man eine andere Strategie, als die,
// die tatsächlich läuft.

export function emaSeries(closes, period) {
  const k = 2 / (period + 1);
  const out = [closes[0]];
  for (let i = 1; i < closes.length; i++) out.push(closes[i] * k + out[i - 1] * (1 - k));
  return out;
}

export function rsiSeries(closes, period) {
  const rsi = new Array(closes.length).fill(null);
  if (closes.length <= period) return rsi;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

export function atrSeries(highs, lows, closes, period) {
  const trs = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const atr = new Array(trs.length).fill(null);
  if (trs.length < period) return atr;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i];
  atr[period - 1] = sum / period;
  for (let i = period; i < trs.length; i++) atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period;
  return atr;
}

// Gleitender Mittelwert + oberes/unteres Band (Mittelwert ± stdDevMultiplikator
// Standardabweichungen) über die letzten `period` Kerzen. null, solange nicht
// genug Kerzen vorliegen.
export function bollingerSeries(closes, period, stdDevMultiplikator) {
  const mittel = new Array(closes.length).fill(null);
  const oberesBand = new Array(closes.length).fill(null);
  const unteresBand = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const fenster = closes.slice(i - period + 1, i + 1);
    const avg = fenster.reduce((a, b) => a + b, 0) / period;
    const variance = fenster.reduce((a, b) => a + (b - avg) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    mittel[i] = avg;
    oberesBand[i] = avg + stdDevMultiplikator * stdDev;
    unteresBand[i] = avg - stdDevMultiplikator * stdDev;
  }
  return { mittel, oberesBand, unteresBand };
}

// Höchster Höchstkurs / tiefster Tiefstkurs der letzten `period` Kerzen VOR
// der aktuellen (Index i selbst zählt nicht mit) - klassischer Donchian-
// Kanal für Breakout-Strategien ("Turtle Trader"): Ausbruch = aktueller
// Kurs schließt ÜBER dem höchsten Hoch der jüngsten Vergangenheit.
export function donchianKanal(highs, lows, index, period) {
  const start = index - period;
  if (start < 0) return { oben: null, unten: null };
  let oben = -Infinity, unten = Infinity;
  for (let i = start; i < index; i++) {
    oben = Math.max(oben, highs[i]);
    unten = Math.min(unten, lows[i]);
  }
  return { oben, unten };
}

// Berechnet aus einem Fenster von Kerzen (closes/highs/lows, letzter Eintrag
// = aktuelle Kerze) alle für die Entscheidung nötigen Indikator-Werte, für
// alle drei unterstützten Strategien (cfg.strategie: 'ema-crossover'
// [Default, Trendfolge], 'bollinger-mean-reversion' [Rückkehr zum
// Mittelwert] oder 'donchian-breakout' [Ausbruch aus der jüngsten Spanne]).
export function berechneIndikatoren(closes, highs, lows, cfg) {
  const fastSeries = emaSeries(closes, cfg.emaSchnell);
  const slowSeries = emaSeries(closes, cfg.emaLangsam);
  const rsi = rsiSeries(closes, cfg.rsiPeriode);
  const atr = atrSeries(highs, lows, closes, 14);
  const n = closes.length;
  const diffJetzt = fastSeries[n - 1] - slowSeries[n - 1];
  const diffVorher = fastSeries[n - 2] - slowSeries[n - 2];
  const preis = closes[n - 1];
  const rsiJetzt = rsi[n - 1];
  const atrJetzt = atr[n - 1];

  // Flash-Crash-Erkennung: wie stark ist der Kurs seit dem höchsten Hoch der
  // letzten flashCrashFensterKerzen-Kerzen bereits gefallen? Negativer Wert
  // = Rückgang in Prozent. Braucht keinen externen API-Call (nutzt dieselben
  // Kerzen, die ohnehin schon geladen sind) - wichtig gerade bei
  // bollinger-mean-reversion, das "überverkauft" sonst genau in einem
  // Flash-Crash/Börsenfehler als Kaufsignal missverstehen könnte.
  const flashFenster = Math.max(1, cfg.flashCrashFensterKerzen || 4);
  const flashStart = Math.max(0, n - 1 - flashFenster);
  const juengstesHoch = Math.max(...highs.slice(flashStart, n));
  const flashCrashDropProzent = juengstesHoch > 0 ? ((preis - juengstesHoch) / juengstesHoch) * 100 : 0;

  const ergebnis = {
    crossUp: diffVorher <= 0 && diffJetzt > 0,
    crossDown: diffVorher >= 0 && diffJetzt < 0,
    preis,
    rsiJetzt,
    atrJetzt,
    volatilitaetProzent: atrJetzt !== null ? (atrJetzt / preis) * 100 : null,
    flashCrashDropProzent,
    bollingerMittel: null,
    bollingerOben: null,
    bollingerUnten: null,
    donchianEinstiegOben: null,
    donchianAusstiegUnten: null,
  };

  if (cfg.strategie === 'bollinger-mean-reversion') {
    const { mittel, oberesBand, unteresBand } = bollingerSeries(closes, cfg.bollingerPeriode, cfg.bollingerStdDev);
    ergebnis.bollingerMittel = mittel[n - 1];
    ergebnis.bollingerOben = oberesBand[n - 1];
    ergebnis.bollingerUnten = unteresBand[n - 1];
  }

  if (cfg.strategie === 'donchian-breakout') {
    ergebnis.donchianEinstiegOben = donchianKanal(highs, lows, n - 1, cfg.donchianEntryPeriode).oben;
    ergebnis.donchianAusstiegUnten = donchianKanal(highs, lows, n - 1, cfg.donchianExitPeriode).unten;
  }

  return ergebnis;
}

// Reduziert die Positionsgröße für ein Symbol, das zuletzt schlecht lief -
// NIE über 1.0 hinaus (kann also nie die konfigurierte maxPositionProzent-
// Grenze überschreiten, nur innerhalb dieser Grenze umverteilen). Braucht
// mindestens performanceSizingMinTrades abgeschlossene Trades, sonst wird
// noch nicht reagiert (zu wenig Daten für ein verlässliches Signal) - Faktor
// dann 1.0 (unverändert). Win-Rate 50% = neutral (Faktor 1.0), darunter
// linear absinkend bis zum konfigurierten Minimum.
export function berechnePerformanceFaktor(kuerzlicheTrades, cfg) {
  if (!cfg.performanceSizing) return 1;
  const trades = (kuerzlicheTrades || []).slice(-20);
  if (trades.length < cfg.performanceSizingMinTrades) return 1;
  const gewinnTrades = trades.filter((t) => t.gewinnVerlustUsdt > 0).length;
  const winRateProzent = (gewinnTrades / trades.length) * 100;
  if (winRateProzent >= 50) return 1;
  const faktor = winRateProzent / 50;
  return Math.max(cfg.performanceSizingMinFaktor, faktor);
}

// Liefert null (nicht kaufen) oder { investBetrag } (in Quote-Währung, z.B. USDT).
export function entscheideKauf({ kapital, cfg, indikatoren, positionenPlatzFrei, handelsSperreHeute, kuerzlicheTrades }) {
  if (handelsSperreHeute || !positionenPlatzFrei) return null;

  const { rsiJetzt, volatilitaetProzent } = indikatoren;
  const rsiOk = cfg.rsiUeberkauft <= 0 || rsiJetzt === null || rsiJetzt < cfg.rsiUeberkauft;
  let signalOk;

  if (cfg.strategie === 'bollinger-mean-reversion') {
    // Einstieg, wenn der Kurs unter das untere Band fällt (überverkauft) -
    // Wette auf Rückkehr zum Mittelwert, statt auf einen Trend.
    signalOk = indikatoren.bollingerUnten !== null && indikatoren.preis <= indikatoren.bollingerUnten && rsiOk;
  } else if (cfg.strategie === 'donchian-breakout') {
    // Einstieg, wenn der Kurs über das höchste Hoch der letzten
    // donchianEntryPeriode-Kerzen ausbricht - Wette auf einen NEUEN Trend,
    // statt auf eine Rückkehr zum Mittelwert oder einen bereits laufenden.
    signalOk = indikatoren.donchianEinstiegOben !== null && indikatoren.preis > indikatoren.donchianEinstiegOben && rsiOk;
  } else {
    const volaOk = cfg.minVolatilitaetProzent <= 0 || volatilitaetProzent === null || volatilitaetProzent >= cfg.minVolatilitaetProzent;
    signalOk = indikatoren.crossUp && rsiOk && volaOk;
  }
  if (!signalOk) return null;

  // Gilt strategieübergreifend (nicht nur für bollinger-mean-reversion, das
  // am meisten davon profitiert): bricht der Kurs innerhalb weniger Kerzen
  // extrem ein (Default 8% in 1h bei 15m-Kerzen), ist das eher ein
  // Flash-Crash/Börsenfehler als eine normale Kaufgelegenheit - Käufe werden
  // für diesen Lauf pausiert, unabhängig vom sonstigen Signal.
  if (cfg.flashCrashFilter && indikatoren.flashCrashDropProzent <= -cfg.flashCrashMaxDropProzent) {
    return null;
  }

  let investBetrag = (kapital * cfg.maxPositionProzent) / 100;
  if (cfg.volaSizing && volatilitaetProzent !== null && volatilitaetProzent > 0) {
    const skalierung = Math.max(cfg.volaSizingMinFaktor, Math.min(1, cfg.volaSizingReferenzProzent / volatilitaetProzent));
    investBetrag *= skalierung;
  }
  investBetrag *= berechnePerformanceFaktor(kuerzlicheTrades, cfg);
  return { investBetrag };
}

// Liefert { verkaufen, grund, hoechsterPreisSeitEinstieg }. hoechsterPreisSeitEinstieg
// muss auch bei verkaufen=false zurückgeschrieben werden (Trailing-Stop-Basis).
// Stop-Loss/Trailing-Stop/Take-Profit gelten als Risiko-/Gewinn-Grenze IMMER,
// unabhängig von der Strategie - nur das "normale" Ausstiegssignal unterscheidet sich.
export function entscheideVerkauf({ position, cfg, indikatoren }) {
  const { preis } = indikatoren;
  const hoechsterPreisSeitEinstieg = Math.max(position.hoechsterPreisSeitEinstieg || position.entryPreis, preis);
  const fixedStopLossPreis = position.entryPreis * (1 - cfg.stopLossProzent / 100);
  const gewinnProzentSeitEinstieg = ((hoechsterPreisSeitEinstieg - position.entryPreis) / position.entryPreis) * 100;
  const trailingAktiv = cfg.trailingStopAbProzent > 0 && gewinnProzentSeitEinstieg >= cfg.trailingStopAbProzent;
  const stopLossPreis = trailingAktiv
    ? Math.max(fixedStopLossPreis, hoechsterPreisSeitEinstieg * (1 - cfg.stopLossProzent / 100))
    : fixedStopLossPreis;

  if (preis <= stopLossPreis) {
    return { verkaufen: true, grund: trailingAktiv ? 'Trailing-Stop' : 'Stop-Loss', hoechsterPreisSeitEinstieg };
  }

  // Festes Gewinnziel (Default 0 = aus): sichert einen Trade sofort ab,
  // sobald er X% im Plus ist, statt auf ein strategie-eigenes Ausstiegs-
  // signal zu warten - kann bei einer schnellen Umkehr Gewinn sichern, den
  // man sonst (z.B. bei bollinger-mean-reversion bis zum Mittelband) wieder
  // hergeben würde. Nur relevant, wenn niedriger als der Trailing-Stop
  // greifen würde - dann gewinnt ohnehin das zuerst erreichte Kriterium.
  if (cfg.takeProfitProzent > 0) {
    const takeProfitPreis = position.entryPreis * (1 + cfg.takeProfitProzent / 100);
    if (preis >= takeProfitPreis) {
      return { verkaufen: true, grund: 'Take-Profit', hoechsterPreisSeitEinstieg };
    }
  }

  if (cfg.strategie === 'bollinger-mean-reversion') {
    // Ziel erreicht, sobald der Kurs zurück zum Mittelwert (oder darüber) ist.
    const zielErreicht = indikatoren.bollingerMittel !== null && preis >= indikatoren.bollingerMittel;
    return { verkaufen: zielErreicht, grund: 'Mittelband erreicht', hoechsterPreisSeitEinstieg };
  }

  if (cfg.strategie === 'donchian-breakout') {
    // Klassischer Turtle-Ausstieg: kürzerer Kanal als beim Einstieg, damit
    // ein laufender Trend nicht sofort beim ersten kleinen Rücksetzer
    // verkauft wird, aber ein echter Trendbruch trotzdem zügig erkannt wird.
    const ausstieg = indikatoren.donchianAusstiegUnten !== null && preis < indikatoren.donchianAusstiegUnten;
    return { verkaufen: ausstieg, grund: 'Donchian-Ausstieg', hoechsterPreisSeitEinstieg };
  }

  return { verkaufen: indikatoren.crossDown, grund: 'EMA-Crossover', hoechsterPreisSeitEinstieg };
}
