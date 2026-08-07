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

// Berechnet aus einem Fenster von Kerzen (closes/highs/lows, letzter Eintrag
// = aktuelle Kerze) alle für die Entscheidung nötigen Indikator-Werte.
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
  return {
    crossUp: diffVorher <= 0 && diffJetzt > 0,
    crossDown: diffVorher >= 0 && diffJetzt < 0,
    preis,
    rsiJetzt,
    atrJetzt,
    volatilitaetProzent: atrJetzt !== null ? (atrJetzt / preis) * 100 : null,
  };
}

// Liefert null (nicht kaufen) oder { investBetrag } (in Quote-Währung, z.B. USDT).
export function entscheideKauf({ kapital, cfg, indikatoren, positionenPlatzFrei, handelsSperreHeute }) {
  const { crossUp, rsiJetzt, volatilitaetProzent } = indikatoren;
  const rsiOk = cfg.rsiUeberkauft <= 0 || rsiJetzt === null || rsiJetzt < cfg.rsiUeberkauft;
  const volaOk = cfg.minVolatilitaetProzent <= 0 || volatilitaetProzent === null || volatilitaetProzent >= cfg.minVolatilitaetProzent;
  if (handelsSperreHeute || !crossUp || !rsiOk || !volaOk || !positionenPlatzFrei) return null;

  let investBetrag = (kapital * cfg.maxPositionProzent) / 100;
  if (cfg.volaSizing && volatilitaetProzent !== null && volatilitaetProzent > 0) {
    const skalierung = Math.max(cfg.volaSizingMinFaktor, Math.min(1, cfg.volaSizingReferenzProzent / volatilitaetProzent));
    investBetrag *= skalierung;
  }
  return { investBetrag };
}

// Liefert { verkaufen, grund, hoechsterPreisSeitEinstieg }. hoechsterPreisSeitEinstieg
// muss auch bei verkaufen=false zurückgeschrieben werden (Trailing-Stop-Basis).
export function entscheideVerkauf({ position, cfg, indikatoren }) {
  const { crossDown, preis } = indikatoren;
  const hoechsterPreisSeitEinstieg = Math.max(position.hoechsterPreisSeitEinstieg || position.entryPreis, preis);
  const fixedStopLossPreis = position.entryPreis * (1 - cfg.stopLossProzent / 100);
  const gewinnProzentSeitEinstieg = ((hoechsterPreisSeitEinstieg - position.entryPreis) / position.entryPreis) * 100;
  const trailingAktiv = cfg.trailingStopAbProzent > 0 && gewinnProzentSeitEinstieg >= cfg.trailingStopAbProzent;
  const stopLossPreis = trailingAktiv
    ? Math.max(fixedStopLossPreis, hoechsterPreisSeitEinstieg * (1 - cfg.stopLossProzent / 100))
    : fixedStopLossPreis;

  const verkaufen = crossDown || preis <= stopLossPreis;
  const grund = preis <= stopLossPreis ? (trailingAktiv ? 'Trailing-Stop' : 'Stop-Loss') : 'EMA-Crossover';
  return { verkaufen, grund, hoechsterPreisSeitEinstieg };
}
