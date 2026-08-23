// Baut die Antwort für die rein lesenden Endpoints GET /status und
// GET /export - kann NIE einen Trade auslösen, nur vorhandenen State lesen
// plus aktuelle Kerzen/Preis direkt von Alpaca (kostenloser IEX-Feed).

import { getKlines, getSpreadProzent, istMarktOffen } from './alpaca.mjs';
import { berechneIndikatoren, emaSeries } from './strategie.mjs';
import { loadState, loadSystemInfo } from './state.mjs';
import { readConfig } from './config.mjs';
import { berechneTradeStats, berechneReadiness, berechneRisikoKennzahlen, berechneGoLiveScore } from './statistik.mjs';

function berechneStopLossTakeProfitPreise(position, cfg) {
  if (!position) return { stopLossPreis: null, takeProfitPreis: null };
  const stopLossAbstand = position.entryPreis * (cfg.stopLossProzent / 100);
  const stopLossPreis = position.entryPreis - stopLossAbstand;
  const takeProfitPreis = cfg.takeProfitProzent > 0 ? position.entryPreis * (1 + cfg.takeProfitProzent / 100) : null;
  return { stopLossPreis, takeProfitPreis };
}

function berechneProfitFactor(trades) {
  const gewinne = trades.filter((t) => t.gewinnVerlustUsdt > 0).reduce((s, t) => s + t.gewinnVerlustUsdt, 0);
  const verluste = trades.filter((t) => t.gewinnVerlustUsdt < 0).reduce((s, t) => s + t.gewinnVerlustUsdt, 0);
  if (verluste === 0) return null;
  return gewinne / Math.abs(verluste);
}

function berechneMaxDrawdownProzent(trades, startKapital) {
  if (!trades.length) return 0;
  const sortiert = [...trades].sort((a, b) => new Date(a.ausstiegAm) - new Date(b.ausstiegAm));
  let kapital = startKapital, peak = startKapital, maxDrawdown = 0;
  for (const t of sortiert) {
    kapital += t.gewinnVerlustUsdt;
    peak = Math.max(peak, kapital);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - kapital) / peak) * 100);
  }
  return maxDrawdown;
}

export async function buildStatus(env) {
  const cfg = readConfig(env);
  const systemInfo = await loadSystemInfo(env);
  const marktOffen = await istMarktOffen(env);
  const symbole = [];
  const alleTrades = [];

  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    const trades = state.trades || [];
    alleTrades.push(...trades);

    let live = { preisAktuell: null, spreadProzent: null, indikatoren: null };
    try {
      const { closes, highs, lows } = await getKlines(env, symbol);
      if (closes.length) {
        const indikatoren = berechneIndikatoren(closes, highs, lows, cfg);
        live.preisAktuell = indikatoren.preis;
        const emaSchnellSeries = emaSeries(closes, cfg.emaSchnell);
        const emaLangsamSeries = emaSeries(closes, cfg.emaLangsam);
        live.indikatoren = {
          rsi: indikatoren.rsiJetzt,
          atr: indikatoren.atrJetzt,
          emaSchnellPeriode: cfg.emaSchnell,
          emaSchnellWert: emaSchnellSeries[emaSchnellSeries.length - 1],
          emaLangsamPeriode: cfg.emaLangsam,
          emaLangsamWert: emaLangsamSeries[emaLangsamSeries.length - 1],
          bollingerMittel: indikatoren.bollingerMittel,
          bollingerOben: indikatoren.bollingerOben,
          bollingerUnten: indikatoren.bollingerUnten,
        };
      }
      live.spreadProzent = await getSpreadProzent(env, symbol);
    } catch (err) {
      console.error(`[status] Live-Daten für ${symbol} nicht abrufbar:`, err);
    }

    const { stopLossPreis, takeProfitPreis } = berechneStopLossTakeProfitPreise(state.position, cfg);

    let autoBacktest = null;
    try {
      const raw = await env.STOCKS_STATE.get(`backtest:${symbol}`);
      if (raw) autoBacktest = JSON.parse(raw);
    } catch {
      // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
    }

    let monteCarlo = null;
    try {
      const raw = await env.STOCKS_STATE.get(`montecarlo:${symbol}`);
      if (raw) monteCarlo = JSON.parse(raw);
    } catch {
      // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
    }

    let strategieTurnier = null;
    try {
      const raw = await env.STOCKS_STATE.get(`turnier:${symbol}`);
      if (raw) strategieTurnier = JSON.parse(raw);
    } catch {
      // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
    }

    symbole.push({
      symbol,
      position: state.position,
      stopLossPreis,
      takeProfitPreis,
      kapital: state.kapital,
      startKapital: state.startKapital,
      heutigerVerlustUsdt: state.heutigerVerlustUsdt,
      killSwitchAktiv: state.killSwitchAktiv,
      insiderSignal: state.insiderSignal,
      gelernterStopLossProzent: state.gelernterStopLossProzent ?? null,
      autoBacktest,
      monteCarlo,
      strategieTurnier,
      tradeStats: berechneTradeStats(trades),
      profitFactor: berechneProfitFactor(trades),
      maxDrawdownProzent: berechneMaxDrawdownProzent(trades, state.startKapital),
      trades,
      ...live,
    });
  }

  let aiReview = null;
  try {
    const raw = await env.STOCKS_STATE.get('ai-review:aktuell');
    if (raw) aiReview = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  let korrelation = null;
  try {
    const raw = await env.STOCKS_STATE.get('korrelation:matrix');
    if (raw) korrelation = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  let goLiveScoreVerlauf = null;
  try {
    const raw = await env.STOCKS_STATE.get('scoreverlauf');
    if (raw) goLiveScoreVerlauf = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  let scanner = null;
  try {
    const raw = await env.STOCKS_STATE.get('scanner:trending');
    if (raw) scanner = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  let insiderTrades = null;
  try {
    const raw = await env.STOCKS_STATE.get('insidertrades:letzte');
    if (raw) insiderTrades = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  let benchmark = null;
  try {
    const raw = await env.STOCKS_STATE.get('benchmark:letzte');
    if (raw) benchmark = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  let globaleMaerkte = null;
  try {
    const raw = await env.STOCKS_STATE.get('globalmarkets:letzte');
    if (raw) globaleMaerkte = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  let smartMoney = null;
  try {
    const raw = await env.STOCKS_STATE.get('smartmoney:letzte');
    if (raw) smartMoney = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  let materialEvents = null;
  try {
    const raw = await env.STOCKS_STATE.get('materialevents:letzte');
    if (raw) materialEvents = JSON.parse(raw);
  } catch {
    // Kaputter/fehlender Eintrag - einfach null, kein Fehler fürs Dashboard.
  }

  const gesamtStartKapital = symbole.reduce((s, x) => s + x.startKapital, 0);
  const portfolioKennzahlen = berechneRisikoKennzahlen(alleTrades, gesamtStartKapital);

  return {
    updatedAt: new Date().toISOString(),
    broker: 'alpaca-paper',
    paperModus: true,
    marktOffen,
    letzterCronLauf: systemInfo.letzterLauf,
    newsEventAktiv: systemInfo.newsEventAktiv,
    newsEventZeit: systemInfo.newsEventZeit,
    marktweiterCrashAktiv: systemInfo.marktweiterCrashAktiv,
    marktweiterCrashZeit: systemInfo.marktweiterCrashZeit,
    readiness: berechneReadiness(symbole, alleTrades),
    portfolioKennzahlen,
    goLiveScore: berechneGoLiveScore(symbole, alleTrades, portfolioKennzahlen, korrelation),
    goLiveScoreVerlauf,
    aiReview,
    korrelation,
    scanner,
    insiderTrades,
    benchmark,
    globaleMaerkte,
    smartMoney,
    materialEvents,
    risiko: {
      maxPositionProzent: cfg.maxPositionProzent,
      maxTagesverlustProzent: cfg.maxTagesverlustProzent,
      maxGesamtverlustProzent: cfg.maxGesamtverlustProzent,
      stopLossProzent: cfg.stopLossProzent,
      takeProfitProzent: cfg.takeProfitProzent,
    },
    symbole,
  };
}

function csvFeld(wert) {
  const text = String(wert ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function buildTradesCsv(env) {
  const cfg = readConfig(env);
  const kopf = ['symbol', 'einstiegAm', 'ausstiegAm', 'entryPreis', 'exitPreis', 'gewinnVerlustUsdt', 'gewinnProzent', 'grund'];
  const zeilen = [kopf.join(',')];
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    for (const t of state.trades || []) {
      zeilen.push([
        symbol, t.einstiegAm, t.ausstiegAm,
        t.entryPreis, t.exitPreis, t.gewinnVerlustUsdt.toFixed(6), t.gewinnProzent.toFixed(4), t.grund,
      ].map(csvFeld).join(','));
    }
  }
  return zeilen.join('\n');
}
