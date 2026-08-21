// Multi-Timeframe-Filter (Pendant zum Krypto-Bot, dort
// hoehererZeitrahmenIstAufwaerts() in lib/marktdaten.mjs) - bestätigt ein
// Kaufsignal auf dem Trading-Timeframe (Default 15m) nur, wenn der
// übergeordnete Trend (Default 4h) ebenfalls aufwärts zeigt (EMA schnell >
// EMA langsam), statt gegen den größeren Trend zu kaufen. War im Krypto-Bot
// NICHT kryptospezifisch (anders als Fear&Greed/BTC-Dominanz) - hier nur
// deshalb bisher nicht dabei, weil der erste Wurf schlanker gehalten wurde.
//
// Nutzt Alpacas eigenen "4Hour"-Timeframe (schon in lib/alpaca.mjs
// unterstützt, kein neuer API-Aufruf-Typ nötig) statt eines zusätzlichen
// Datenanbieters.

import { emaSeries } from './strategie.mjs';
import { getKlines } from './alpaca.mjs';

export async function hoehererZeitrahmenIstAufwaerts(env, symbol, cfg) {
  try {
    const { closes } = await getKlines(env, symbol, cfg.mtfIntervalMinuten);
    const benoetigt = cfg.emaLangsam + 2;
    if (closes.length < benoetigt) return true; // zu wenig Historie - Filter nicht blockierend anwenden
    const fastSeries = emaSeries(closes, cfg.emaSchnell);
    const slowSeries = emaSeries(closes, cfg.emaLangsam);
    const n = closes.length - 1;
    return fastSeries[n] > slowSeries[n];
  } catch {
    return true; // Ausfall darf den Bot nie blockieren, nur den Filter deaktivieren
  }
}
