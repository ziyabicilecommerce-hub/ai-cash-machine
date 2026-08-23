// Preis-Radar: vergleicht den aktuellen Kurs jedes konfigurierten Coins
// GLEICHZEITIG auf Binance, Kraken UND Coinbase - unabhängig davon, welche
// Börse der Bot gerade tatsächlich handelt. Rein informativ, löst NIE einen
// Trade aus - zeigt, ob eine Börse gerade spürbar teurer/günstiger ist als
// die anderen (der bekannte "Coinbase-Premium"-Effekt z.B.). Nutzt die 3
// bereits vorhandenen, öffentlichen Exchange-Adapter (lib/exchanges.mjs) -
// alles Marktdaten-Endpoints ohne Auth, keine neuen API-Keys nötig. Läuft
// höchstens 1x pro Tag (dieselbe Kadenz wie Scanner/Copy-Trading) - ein
// tägliches Preisgefälle-Bild statt eines Live-Arbitrage-Feeds, das wäre
// bei 3 Börsen × 8 Coins pro Dashboard-Refresh (alle 30s) zu viele Anfragen.

import { EXCHANGES } from './exchanges.mjs';

// Basiswährung -> Symbol-Format je Börse. Eigene, explizite Tabelle statt
// Ableitung per String-Magie aus dem konfigurierten TRADING_SYMBOLS-Format.
const SYMBOLE_PRO_BOERSE = {
  BTC: { binance: 'BTCUSDT', kraken: 'XBTUSDT', coinbase: 'BTC-USD' },
  ETH: { binance: 'ETHUSDT', kraken: 'ETHUSDT', coinbase: 'ETH-USD' },
  SOL: { binance: 'SOLUSDT', kraken: 'SOLUSDT', coinbase: 'SOL-USD' },
  XRP: { binance: 'XRPUSDT', kraken: 'XRPUSDT', coinbase: 'XRP-USD' },
  ADA: { binance: 'ADAUSDT', kraken: 'ADAUSDT', coinbase: 'ADA-USD' },
  DOGE: { binance: 'DOGEUSDT', kraken: 'DOGEUSDT', coinbase: 'DOGE-USD' },
  DOT: { binance: 'DOTUSDT', kraken: 'DOTUSDT', coinbase: 'DOT-USD' },
  LTC: { binance: 'LTCUSDT', kraken: 'LTCUSDT', coinbase: 'LTC-USD' },
};

// cfg.symbols sind im Format der AKTUELL konfigurierten Börse (z.B. bei
// Kraken "XBTUSDT" statt "BTCUSDT") - hier wird daraus die Basiswährung
// abgeleitet, damit für JEDE der 3 Börsen automatisch das richtige
// Symbol-Format genutzt wird, unabhängig vom Live-Handelsformat.
function basiswaehrungAusSymbol(symbol) {
  if (symbol === 'XBTUSDT') return 'BTC';
  const ohneTrenner = symbol.replace(/-.*$/, '');
  const roh = ohneTrenner.replace(/USDT$/, '').replace(/USD$/, '');
  return roh || null;
}

export async function pruefeUndAktualisierePreisRadar(env, cfg) {
  const heuteStr = new Date().toISOString().slice(0, 10);
  const letzterTag = await env.TRADING_STATE.get('preisradar:letzterTag');
  if (letzterTag === heuteStr) return;

  const ergebnisse = [];
  const basiswaehrungen = [...new Set(cfg.symbols.map(basiswaehrungAusSymbol).filter(Boolean))];

  for (const basis of basiswaehrungen) {
    const symbolePeBoerse = SYMBOLE_PRO_BOERSE[basis];
    if (!symbolePeBoerse) continue;
    const preise = {};
    for (const [boerse, symbol] of Object.entries(symbolePeBoerse)) {
      try {
        const { closes } = await EXCHANGES[boerse].getKlines(symbol);
        if (closes.length) preise[boerse] = closes[closes.length - 1];
      } catch (err) {
        console.error(`[trading-bot] Preis-Radar ${basis}/${boerse} fehlgeschlagen:`, err);
      }
    }
    const werte = Object.values(preise);
    if (werte.length < 2) continue; // braucht mind. 2 Börsen für einen Vergleich
    const min = Math.min(...werte);
    const max = Math.max(...werte);
    const spreadProzent = min > 0 ? ((max - min) / min) * 100 : 0;
    ergebnisse.push({ basis, preise, spreadProzent });
  }

  ergebnisse.sort((a, b) => b.spreadProzent - a.spreadProzent);

  await env.TRADING_STATE.put('preisradar:letzte', JSON.stringify({ datum: new Date().toISOString(), ergebnisse }));
  await env.TRADING_STATE.put('preisradar:letzterTag', heuteStr);
}
