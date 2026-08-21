// Reine Korrelations-Mathematik (Pearson) - keine API-Calls, keine
// Seiteneffekte. Pendant zu trading-bot-worker/lib/korrelation.mjs. Wird
// von lib/autobacktest.mjs mit den dort ohnehin schon wöchentlich
// geladenen historischen Kerzen aufgerufen (bewusst KEIN eigener
// Klines-Abruf hier, um die externen Anfragen pro Lauf nicht zu
// verdoppeln) und liefert eine Symbol×Symbol-Matrix der Kursrenditen-
// Korrelation der letzten AUTO_BACKTEST_TAGE Tage.

function berechneReturns(closes) {
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1]) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return returns;
}

function pearsonKorrelation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 20) return null;
  const ax = a.slice(-n), bx = b.slice(-n);
  const meanA = ax.reduce((s, v) => s + v, 0) / n;
  const meanB = bx.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = ax[i] - meanA, db = bx[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB);
  return denom === 0 ? null : num / denom;
}

export function berechneKorrelationsMatrix(closesProSymbol) {
  const symbole = Object.keys(closesProSymbol);
  const returnsProSymbol = {};
  for (const s of symbole) returnsProSymbol[s] = berechneReturns(closesProSymbol[s]);

  const matrix = {};
  for (const a of symbole) {
    matrix[a] = {};
    for (const b of symbole) {
      matrix[a][b] = a === b ? 1 : pearsonKorrelation(returnsProSymbol[a], returnsProSymbol[b]);
    }
  }
  return matrix;
}
