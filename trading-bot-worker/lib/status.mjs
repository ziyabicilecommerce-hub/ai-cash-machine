// Baut die Antwort für die rein lesenden Endpoints GET /status und
// GET /export - kann NIE einen Trade auslösen, nur vorhandenen State lesen
// plus ein paar zusätzliche Live-Werte (aktueller Preis, Indikatoren,
// Spread) direkt bei der Börse abfragen. Bewusst SPARSAM mit externen
// Aufrufen: nutzt für Preis/Indikatoren/Spread nur die ohnehin fürs Trading
// verbundene Börse (Kraken/Binance, 2 Aufrufe pro Symbol), NICHT die
// externen Gratis-Quellen aus marktdaten.mjs (CoinGecko/CoinPaprika/OKX/
// Gate.io/Bitstamp/Fear&Greed/BTC-Dominanz) - die würden bei einem
// Dashboard, das alle 30s aktualisiert, weit öfter angefragt als beim
// eigentlichen Trading vorgesehen. Fear&Greed/BTC-Dominanz kommen deshalb
// aus dem Cache (siehe loadSystemInfo), nicht live.

import { EXCHANGES } from './exchanges.mjs';
import { berechneIndikatoren, emaSeries } from './strategie.mjs';
import { loadState, loadSystemInfo } from './state.mjs';
import { readConfig } from './config.mjs';
import { berechneTradeStats, berechneReadiness, berechneRisikoKennzahlen, berechneGoLiveScore } from './statistik.mjs';

// 15m-Kerzen, 24h zurück = 96 Kerzen. Reine Berechnung aus den ohnehin
// geladenen Kerzen der Börse selbst - kein zusätzlicher API-Call.
function berechne24hChangeAusKlines(closes) {
  if (closes.length < 97) return null;
  const vorher = closes[closes.length - 1 - 96];
  const jetzt = closes[closes.length - 1];
  if (!vorher) return null;
  return ((jetzt - vorher) / vorher) * 100;
}

function berechneStopLossTakeProfitPreise(position, cfg) {
  if (!position) return { stopLossPreis: null, takeProfitPreis: null };
  const stopLossProzentEffektiv = position.stopLossProzentBenutzt ?? cfg.stopLossProzent;
  const stopLossAbstand = cfg.dynamischerStopLoss && position.entryAtr
    ? position.entryAtr * cfg.stopLossAtrMultiplikator
    : position.entryPreis * (stopLossProzentEffektiv / 100);
  const stopLossPreis = position.entryPreis - stopLossAbstand;
  const takeProfitPreis = cfg.takeProfitProzent > 0 ? position.entryPreis * (1 + cfg.takeProfitProzent / 100) : null;
  return { stopLossPreis, takeProfitPreis };
}

// Grobe Ampel für's Risiko-Panel im Dashboard - dieselbe Logik, die den
// Kill-Switch/die Tagessperre auch wirklich auslöst, nur zur Anzeige
// aufbereitet statt neu erfunden.
function berechneRisikoStatus(symbole, cfg, marktweiterCrashAktiv, newsEventAktiv) {
  if (symbole.some((s) => s.killSwitchAktiv)) return 'danger';
  if (marktweiterCrashAktiv) return 'danger';
  if (newsEventAktiv) return 'warnung';
  const nahAmTageslimit = symbole.some((s) => {
    if (s.kapital <= 0) return false;
    const verlustProzentHeute = (-s.heutigerVerlustUsdt / s.kapital) * 100;
    return verlustProzentHeute >= cfg.maxTagesverlustProzent * 0.7;
  });
  return nahAmTageslimit ? 'warnung' : 'sicher';
}

// Profit Factor = Summe Gewinne / |Summe Verluste| - Standardkennzahl,
// > 1 bedeutet die Gewinne übersteigen die Verluste insgesamt. null ohne
// Verlust-Trades (Division durch 0 wäre irreführend "unendlich gut").
function berechneProfitFactor(trades) {
  const gewinne = trades.filter((t) => t.gewinnVerlustUsdt > 0).reduce((s, t) => s + t.gewinnVerlustUsdt, 0);
  const verluste = trades.filter((t) => t.gewinnVerlustUsdt < 0).reduce((s, t) => s + t.gewinnVerlustUsdt, 0);
  if (verluste === 0) return null;
  return gewinne / Math.abs(verluste);
}

// Rekonstruiert eine grobe Equity-Kurve aus der Trade-Reihenfolge (Start-
// kapital + jeweils gewinnVerlustUsdt aufsummiert) und daraus den größten
// Rückgang vom bisherigen Höchststand - keine Sekunde-für-Sekunde-Kurve
// (die speichert der Bot nicht), aber ehrlich aus echten Trades abgeleitet
// statt erfunden.
function berechneMaxDrawdownProzent(trades, startKapital) {
  if (!trades.length) return 0;
  const sortiert = [...trades].sort((a, b) => new Date(a.ausstiegAm) - new Date(b.ausstiegAm));
  let kapital = startKapital;
  let peak = startKapital;
  let maxDrawdown = 0;
  for (const t of sortiert) {
    kapital += t.gewinnVerlustUsdt;
    peak = Math.max(peak, kapital);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - kapital) / peak) * 100);
  }
  return maxDrawdown;
}

export async function buildStatus(env) {
  const cfg = readConfig(env);
  const exchange = EXCHANGES[cfg.exchange];
  const systemInfo = await loadSystemInfo(env);
  const symbole = [];
  const alleTrades = [];
  const proStrategiePL = {}; // strategie -> { pl, anzahlTrades }

  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    const cfgSymbol = cfg.strategieProSymbol[symbol] ? { ...cfg, strategie: cfg.strategieProSymbol[symbol] } : cfg;
    const trades = state.trades || [];
    alleTrades.push(...trades);

    const strategie = cfgSymbol.strategie;
    const plGesamt = trades.reduce((s, t) => s + t.gewinnVerlustUsdt, 0);
    if (!proStrategiePL[strategie]) proStrategiePL[strategie] = { pl: 0, anzahlTrades: 0 };
    proStrategiePL[strategie].pl += plGesamt;
    proStrategiePL[strategie].anzahlTrades += trades.length;

    // Live-Werte direkt von der Börse - fällt bei einem Fehler sauber auf
    // null zurück, statt den gesamten /status-Aufruf abzubrechen (ein
    // einzelner Coin mit Börsen-Hänger darf nicht das ganze Dashboard leeren).
    let live = { preisAktuell: null, change24hProzent: null, spreadProzent: null, indikatoren: null };
    try {
      const { closes, highs, lows } = await exchange.getKlines(symbol);
      if (closes.length) {
        const indikatoren = berechneIndikatoren(closes, highs, lows, cfgSymbol);
        live.preisAktuell = indikatoren.preis;
        live.change24hProzent = berechne24hChangeAusKlines(closes);
        const emaSchnellSeries = emaSeries(closes, cfgSymbol.emaSchnell);
        const emaLangsamSeries = emaSeries(closes, cfgSymbol.emaLangsam);
        live.indikatoren = {
          rsi: indikatoren.rsiJetzt,
          atr: indikatoren.atrJetzt,
          emaSchnellPeriode: cfgSymbol.emaSchnell,
          emaSchnellWert: emaSchnellSeries[emaSchnellSeries.length - 1],
          emaLangsamPeriode: cfgSymbol.emaLangsam,
          emaLangsamWert: emaLangsamSeries[emaLangsamSeries.length - 1],
          bollingerMittel: indikatoren.bollingerMittel,
          bollingerOben: indikatoren.bollingerOben,
          bollingerUnten: indikatoren.bollingerUnten,
          donchianEinstiegOben: indikatoren.donchianEinstiegOben,
          donchianAusstiegUnten: indikatoren.donchianAusstiegUnten,
        };
      }
      live.spreadProzent = await exchange.getSpreadProzent(symbol);
    } catch (err) {
      console.error(`[status] Live-Daten für ${symbol} nicht abrufbar:`, err);
    }

    const { stopLossPreis, takeProfitPreis } = berechneStopLossTakeProfitPreise(state.position, cfgSymbol);

    let autoBacktest = null;
    try {
      const raw = await env.TRADING_STATE.get(`backtest:${symbol}`);
      if (raw) autoBacktest = JSON.parse(raw);
    } catch {
      // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
    }

    let monteCarlo = null;
    try {
      const raw = await env.TRADING_STATE.get(`montecarlo:${symbol}`);
      if (raw) monteCarlo = JSON.parse(raw);
    } catch {
      // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
    }

    symbole.push({
      symbol,
      exchange: cfg.exchange,
      paperModus: cfg.paperModus,
      strategie,
      position: state.position,
      stopLossPreis,
      takeProfitPreis,
      gelernterStopLossProzent: state.gelernterStopLossProzent ?? null,
      autoBacktest,
      monteCarlo,
      kapital: state.kapital,
      startKapital: state.startKapital,
      heutigerVerlustUsdt: state.heutigerVerlustUsdt,
      killSwitchAktiv: state.killSwitchAktiv,
      tradeStats: berechneTradeStats(trades),
      profitFactor: berechneProfitFactor(trades),
      maxDrawdownProzent: berechneMaxDrawdownProzent(trades, state.startKapital),
      trades,
      ...live,
    });
  }

  let aiReview = null;
  try {
    const raw = await env.TRADING_STATE.get('ai-review:aktuell');
    if (raw) aiReview = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  let korrelation = null;
  try {
    const raw = await env.TRADING_STATE.get('korrelation:matrix');
    if (raw) korrelation = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  let scanner = null;
  try {
    const raw = await env.TRADING_STATE.get('scanner:trending');
    if (raw) scanner = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  const portfolioKennzahlen = berechneRisikoKennzahlen(alleTrades);

  return {
    updatedAt: new Date().toISOString(),
    exchange: cfg.exchange,
    paperModus: cfg.paperModus,
    letzterCronLauf: systemInfo.letzterLauf,
    marktSignale: {
      fearGreedWert: systemInfo.fearGreedWert,
      fearGreedZeit: systemInfo.fearGreedZeit,
      btcDominanzProzent: systemInfo.btcDominanzProzent,
      btcDominanzZeit: systemInfo.btcDominanzZeit,
      marktweiterCrashAktiv: systemInfo.marktweiterCrashAktiv,
      marktweiterCrashZeit: systemInfo.marktweiterCrashZeit,
      newsEventAktiv: systemInfo.newsEventAktiv,
      newsEventZeit: systemInfo.newsEventZeit,
    },
    readiness: berechneReadiness(symbole, alleTrades),
    portfolioKennzahlen,
    goLiveScore: berechneGoLiveScore(symbole, alleTrades, portfolioKennzahlen, korrelation),
    aiReview,
    korrelation,
    scanner,
    risikoStatus: berechneRisikoStatus(symbole, cfg, systemInfo.marktweiterCrashAktiv, systemInfo.newsEventAktiv),
    risiko: {
      maxPositionProzent: cfg.maxPositionProzent,
      maxTagesverlustProzent: cfg.maxTagesverlustProzent,
      maxGesamtverlustProzent: cfg.maxGesamtverlustProzent,
      stopLossProzent: cfg.stopLossProzent,
      takeProfitProzent: cfg.takeProfitProzent,
    },
    strategieVergleich: Object.entries(proStrategiePL).map(([strategie, werte]) => ({ strategie, ...werte })),
    symbole,
  };
}

// Ein Feld in Anführungszeichen setzen, wenn es Komma/Anführungszeichen/
// Zeilenumbruch enthält - minimaler, aber korrekter CSV-Quote (RFC 4180).
function csvFeld(wert) {
  const text = String(wert ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// CSV-Export der letzten Trades (bis zu MAX_TRADES_IM_STATE pro Symbol,
// wie im /status-Endpoint) - für Excel/Google Sheets oder eigene Auswertung
// außerhalb des Dashboards. Rein lesend, gleiches Secret wie /status.
export async function buildTradesCsv(env) {
  const cfg = readConfig(env);
  const kopf = ['symbol', 'strategie', 'einstiegAm', 'ausstiegAm', 'entryPreis', 'exitPreis', 'gewinnVerlustUsdt', 'gewinnProzent', 'grund'];
  const zeilen = [kopf.join(',')];
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    const strategie = cfg.strategieProSymbol[symbol] || cfg.strategie;
    for (const t of state.trades || []) {
      zeilen.push([
        symbol, strategie, t.einstiegAm, t.ausstiegAm,
        t.entryPreis, t.exitPreis, t.gewinnVerlustUsdt.toFixed(6), t.gewinnProzent.toFixed(4), t.grund,
      ].map(csvFeld).join(','));
    }
  }
  return zeilen.join('\n');
}
