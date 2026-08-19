// Externe, kostenlose Marktdaten-Quellen (kein API-Key nötig) für die
// optionalen Kauf-Filter in worker.js: 24h-Preisbestätigung (5 Börsen
// gemittelt), Fear & Greed Index, BTC-Dominanz, Mehrfach-Zeitrahmen-
// Bestätigung. Jede Funktion fällt bei Ausfall auf null/true (nicht
// blockierend) zurück statt den Bot zu blockieren - ein Datenausfall bei
// einer optionalen Zusatzbestätigung darf nie den Handel lahmlegen.

import { emaSeries } from './strategie.mjs';

// ================= COINGECKO (optionaler Kauf-Filter, kein Key nötig) =================
// Zusätzliche, unabhängige Bestätigung vor einem Kauf: CoinGecko nutzt einen
// eigenen Datenfeed/Berechnung (nicht dieselbe Quelle wie die Exchange-Klines),
// verwirft ein Kaufsignal, wenn der Coin laut CoinGecko in den letzten 24h
// bereits im Minus steht - reduziert das Risiko, in einen fallenden Markt
// hinein zu kaufen, nur weil die Strategie auf Kraken-Daten allein ein Signal sieht.
export const COINGECKO_IDS = {
  XBTUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  XRPUSDT: 'ripple',
  ADAUSDT: 'cardano',
  DOGEUSDT: 'dogecoin',
  DOTUSDT: 'polkadot',
  LTCUSDT: 'litecoin',
};

async function ladeCoingecko24hChange(symbol) {
  const id = COINGECKO_IDS[symbol];
  if (!id) return null; // kein Mapping für dieses Symbol - Filter wird nicht angewendet
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
    if (!res.ok) return null;
    const data = await res.json();
    const change = data && data[id] && data[id].usd_24h_change;
    return typeof change === 'number' ? change : null;
  } catch {
    return null; // CoinGecko-Ausfall darf den Bot nie blockieren, nur den Filter deaktivieren
  }
}

// Zweite, unabhängige Datenquelle für dieselbe Art von Bestätigung
// (24h-Kursänderung) - bewusst NICHT als zusätzlicher, eigener UND-Filter
// verdrahtet (das würde Käufe nur noch seltener machen), sondern mit
// CoinGecko zu einem Durchschnitt gemittelt (ladePreisBestaetigung24h unten) -
// robuster gegen einen einzelnen abweichenden/fehlerhaften Datenpunkt, ohne
// die Kauf-Hürde ein zweites Mal zu erhöhen. CoinCap (ursprünglich angefragt)
// war von hier aus nicht erreichbar (wiederholt CONNECT-Fehler) - CoinPaprika
// als funktionierende, ebenfalls kostenlose Alternative gewählt.
const COINPAPRIKA_IDS = {
  XBTUSDT: 'btc-bitcoin',
  ETHUSDT: 'eth-ethereum',
  SOLUSDT: 'sol-solana',
  XRPUSDT: 'xrp-xrp',
  ADAUSDT: 'ada-cardano',
  DOGEUSDT: 'doge-dogecoin',
  DOTUSDT: 'dot-polkadot',
  LTCUSDT: 'ltc-litecoin',
};

async function ladeCoinpaprika24hChange(symbol) {
  const id = COINPAPRIKA_IDS[symbol];
  if (!id) return null;
  try {
    const res = await fetch(`https://api.coinpaprika.com/v1/tickers/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    const change = data && data.quotes && data.quotes.USD && data.quotes.USD.percent_change_24h;
    return typeof change === 'number' ? change : null;
  } catch {
    return null;
  }
}

// Drei weitere, unabhängige Börsen-Ticker (jeweils kostenlos, kein Key
// nötig) - liefern die 24h-Kursänderung aus ihrem EIGENEN Orderbuch statt
// aus CoinGecko/CoinPaprikas aggregierten Daten. Gegen Ausfall/Umbenennung
// einzelner Quellen genauso abgesichert wie CoinGecko/CoinPaprika: bei
// Fehler oder fehlendem Mapping einfach null statt den Bot zu blockieren.
const OKX_IDS = {
  XBTUSDT: 'BTC-USDT', ETHUSDT: 'ETH-USDT', SOLUSDT: 'SOL-USDT', XRPUSDT: 'XRP-USDT',
  ADAUSDT: 'ADA-USDT', DOGEUSDT: 'DOGE-USDT', DOTUSDT: 'DOT-USDT', LTCUSDT: 'LTC-USDT',
};

async function ladeOkx24hChange(symbol) {
  const instId = OKX_IDS[symbol];
  if (!instId) return null;
  try {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const t = data && data.data && data.data[0];
    const open = t && parseFloat(t.open24h);
    const last = t && parseFloat(t.last);
    if (!open || !Number.isFinite(last)) return null;
    return ((last - open) / open) * 100;
  } catch {
    return null;
  }
}

const GATEIO_IDS = {
  XBTUSDT: 'BTC_USDT', ETHUSDT: 'ETH_USDT', SOLUSDT: 'SOL_USDT', XRPUSDT: 'XRP_USDT',
  ADAUSDT: 'ADA_USDT', DOGEUSDT: 'DOGE_USDT', DOTUSDT: 'DOT_USDT', LTCUSDT: 'LTC_USDT',
};

async function ladeGateio24hChange(symbol) {
  const pair = GATEIO_IDS[symbol];
  if (!pair) return null;
  try {
    const res = await fetch(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`);
    if (!res.ok) return null;
    const data = await res.json();
    const change = data && data[0] && parseFloat(data[0].change_percentage);
    return Number.isFinite(change) ? change : null;
  } catch {
    return null;
  }
}

// Bitstamp notiert in USD statt USDT - für eine 24h-PROZENT-Änderung als
// Zusatzbestätigung ist der kleine Unterschied zwischen beiden irrelevant.
const BITSTAMP_IDS = {
  XBTUSDT: 'btcusd', ETHUSDT: 'ethusd', SOLUSDT: 'solusd', XRPUSDT: 'xrpusd',
  ADAUSDT: 'adausd', DOGEUSDT: 'dogeusd', DOTUSDT: 'dotusd', LTCUSDT: 'ltcusd',
};

async function ladeBitstamp24hChange(symbol) {
  const pair = BITSTAMP_IDS[symbol];
  if (!pair) return null;
  try {
    const res = await fetch(`https://www.bitstamp.net/api/v2/ticker/${pair}/`);
    if (!res.ok) return null;
    const data = await res.json();
    const change = data && parseFloat(data.percent_change_24);
    return Number.isFinite(change) ? change : null;
  } catch {
    return null;
  }
}

// Mittelt bis zu 5 unabhängige Quellen (CoinGecko, CoinPaprika, OKX,
// Gate.io, Bitstamp), alle parallel abgefragt. Fällt eine oder mehrere aus,
// wird nur mit den verbliebenen gemittelt statt den Filter auszuschalten -
// erst wenn ALLE ausfallen, ist das Ergebnis null (Filter dann nicht
// blockierend, siehe Aufrufstelle in runSymbol). Bewusst als EIN
// gemittelter Wert statt fünf einzelne UND-Filter, sonst würde jede weitere
// Quelle Käufe nur noch seltener machen, statt die Bestätigung robuster zu
// machen.
export async function ladePreisBestaetigung24h(symbol) {
  const werte = (await Promise.all([
    ladeCoingecko24hChange(symbol),
    ladeCoinpaprika24hChange(symbol),
    ladeOkx24hChange(symbol),
    ladeGateio24hChange(symbol),
    ladeBitstamp24hChange(symbol),
  ])).filter((w) => typeof w === 'number');
  if (!werte.length) return null;
  return werte.reduce((sum, w) => sum + w, 0) / werte.length;
}

// ================= FEAR & GREED INDEX (optionaler markweiter Kauf-Filter) =================
// Anders als der 24h-Preisfilter (pro Coin) ist das EIN EINZIGER Wert für
// den GESAMTEN Kryptomarkt (0=Extreme Fear, 100=Extreme Greed) - deshalb
// nur einmal pro Lauf abgefragt, nicht pro Symbol. Passend zur
// bollinger-mean-reversion-Strategie (kauft gezielt Dips): blockiert NICHT
// bei Angst (das ist genau die Marktlage, in der die Strategie kaufen
// soll), sondern bei "Extreme Greed" - klassisches Kontra-Signal gegen
// Euphorie-Käufe kurz vor einem möglichen Top.
export async function ladeFearGreedIndex() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return null;
    const data = await res.json();
    const wert = data && data.data && data.data[0] && parseInt(data.data[0].value, 10);
    return Number.isFinite(wert) ? wert : null;
  } catch {
    return null; // Ausfall darf den Bot nie blockieren, nur den Filter deaktivieren
  }
}

// ================= BTC-DOMINANZ-FILTER (optionaler markweiter Kauf-Filter) =================
// Wie der Fear&Greed-Filter EIN EINZIGER Wert für den ganzen Markt, nur
// einmal pro Lauf abgefragt. BTC-Dominanz = BTCs Anteil an der gesamten
// Krypto-Marktkapitalisierung. Steigt sie stark, fließt Kapital gerade
// bevorzugt in Bitcoin statt in Altcoins ("risk-off" für Alts) - der Filter
// blockiert deshalb NUR Altcoin-Käufe (nicht BTC selbst) oberhalb der
// konfigurierten Schwelle. Nutzt dieselbe CoinPaprika-API wie der
// 24h-Preisfilter oben, andere Endpunkt (global statt pro Coin).
export async function ladeBtcDominanzProzent() {
  try {
    const res = await fetch('https://api.coinpaprika.com/v1/global');
    if (!res.ok) return null;
    const data = await res.json();
    const wert = data && data.bitcoin_dominance_percentage;
    return typeof wert === 'number' ? wert : null;
  } catch {
    return null;
  }
}

// ================= NEWS-SENTIMENT-FILTER (optional, braucht kostenlosen API-Key) =================
// Anders als alle anderen Filter hier: kein reiner Kursdaten-Blick, sondern
// ECHTES Community-Sentiment - CryptoPanic lässt echte Nutzer jeden
// Krypto-News-Artikel als "bullish"/"bearish" bewerten. Wir summieren die
// Stimmen der letzten Artikel zu einem Coin und blockieren einen Kauf, wenn
// die Stimmung gerade überwiegend negativ ist - eine Bestätigung, die aus
// Text/Meinungen kommt statt aus Kursdaten, die alle anderen Filter schon
// nutzen. Braucht einen KOSTENLOSEN API-Key (CRYPTOPANIC_API_KEY, siehe
// README) - ohne Key oder ohne Mapping für das Symbol wird der Filter
// einfach nicht angewendet (null), genau wie bei allen anderen optionalen
// Datenquellen hier.
const CRYPTOPANIC_TICKERS = {
  XBTUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL', XRPUSDT: 'XRP',
  ADAUSDT: 'ADA', DOGEUSDT: 'DOGE', DOTUSDT: 'DOT', LTCUSDT: 'LTC',
};

// Gibt den Anteil positiver Stimmen (0-100%) aus den letzten CryptoPanic-
// Artikeln zu diesem Coin zurück, oder null wenn kein Key konfiguriert,
// kein Mapping existiert, oder (noch) keine Stimmen vorliegen - in all
// diesen Fällen bleibt der Filter unwirksam statt den Bot zu blockieren.
export async function ladeNewsSentimentProzent(env, symbol) {
  const key = env.CRYPTOPANIC_API_KEY;
  const ticker = CRYPTOPANIC_TICKERS[symbol];
  if (!key || !ticker) return null;
  try {
    const res = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=${key}&public=true&currencies=${ticker}`);
    if (!res.ok) return null;
    const data = await res.json();
    const posts = Array.isArray(data && data.results) ? data.results : [];
    let positiv = 0, negativ = 0;
    for (const p of posts) {
      const votes = p && p.votes;
      if (!votes) continue;
      positiv += votes.positive || 0;
      negativ += votes.negative || 0;
    }
    const gesamt = positiv + negativ;
    if (gesamt === 0) return null; // noch keine Stimmen - kein Urteil möglich
    return (positiv / gesamt) * 100;
  } catch {
    return null; // Ausfall darf den Bot nie blockieren, nur den Filter deaktivieren
  }
}

// ================= MEHRFACH-ZEITRAHMEN-BESTÄTIGUNG (optional) =================
// Prüft zusätzlich zum 15m-Signal einen deutlich längeren Zeitrahmen (Default
// 4h), um Käufe gegen den übergeordneten Trend zu vermeiden - klassisches
// Problem reiner 15m-Strategien: ein kurzfristiges Signal kann mitten in
// einem größeren Abwärtstrend auftreten. Bewertet den 4h-Trend über EMA9 vs.
// EMA21 (gleiche Logik wie ema-crossover, nur auf einem größeren Zeitfenster) -
// Aufwärtstrend = EMA9 > EMA21.
export async function hoehererZeitrahmenIstAufwaerts(exchange, symbol, cfg) {
  try {
    const { closes } = await exchange.getKlines(symbol, cfg.mtfIntervalMinuten);
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
