// Automatischer, wöchentlicher Backtest-Check GEGEN ECHTE historische
// Kerzen - läuft wie das adaptive Lernen/Rebalancing einmal pro Woche
// (montags) im 5-Minuten-Cron mit. Rein informativ: verändert NIE Kapital,
// Position oder Trade-Historie - schreibt nur ein separates
// `backtest:<symbol>`-Feld in KV, das /status mit ausliefert.
//
// Bewusst NUR die letzten AUTO_BACKTEST_TAGE Tage (kurzes rollierendes
// Fenster, nicht die vollen 90 Tage wie backtest.mjs auf der Kommandozeile)
// - hält die Zahl der Kraken/Binance-Anfragen pro Lauf klein genug, um
// Cloudflare Workers' Subrequest-Limit pro Aufruf sicher einzuhalten (8
// Symbole × mehrere paginierte Anfragen). Für eine tiefere Analyse über
// längere Zeiträume bleibt backtest.mjs (lokal, ohne dieses Limit) die
// richtige Wahl - dieser Check ist ein laufendes "funktioniert die aktuell
// konfigurierte Strategie noch?", kein Ersatz dafür.
//
// Simuliert dieselbe Entscheidungslogik wie worker.js/backtest.mjs
// (berechneIndikatoren/entscheideKauf/entscheideVerkauf aus strategie.mjs),
// mit einem neutralen Referenz-Startkapital (100), unabhängig vom
// tatsächlichen Kapitalstand des Bots.

import { berechneIndikatoren, entscheideKauf, entscheideVerkauf } from './strategie.mjs';
import { notify } from './notify.mjs';
import { berechneKorrelationsMatrix } from './korrelation.mjs';

const AUTO_BACKTEST_TAGE = 14;
const FENSTER_FUER_INDIKATOREN = 60;
const REFERENZ_STARTKAPITAL = 100;
const MAX_SEITEN_PRO_SYMBOL = 8; // Sicherheitsnetz gegen zu viele Subrequests

function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

async function ladeKlinesBinance(symbol, tageZurueck) {
  const bisJetzt = Date.now();
  const startZeit = bisJetzt - tageZurueck * 24 * 60 * 60 * 1000;
  const alleKlines = [];
  let cursor = startZeit;
  for (let seite = 0; seite < MAX_SEITEN_PRO_SYMBOL && cursor < bisJetzt; seite++) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&startTime=${cursor}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance Klines-Fehler: ${res.status}`);
    const batch = await res.json();
    if (!batch.length) break;
    alleKlines.push(...batch);
    const letzteOffenZeit = batch[batch.length - 1][0];
    if (letzteOffenZeit <= cursor) break;
    cursor = letzteOffenZeit + 1;
    if (batch.length < 1000) break;
  }
  return {
    closes: alleKlines.map((k) => parseFloat(k[4])),
    highs: alleKlines.map((k) => parseFloat(k[2])),
    lows: alleKlines.map((k) => parseFloat(k[3])),
    zeiten: alleKlines.map((k) => k[0]),
  };
}

async function ladeKlinesKraken(symbol, tageZurueck) {
  const bisJetzt = Date.now();
  let sinceSekunden = Math.floor((bisJetzt - tageZurueck * 24 * 60 * 60 * 1000) / 1000);
  const alleKlines = [];
  for (let seite = 0; seite < MAX_SEITEN_PRO_SYMBOL; seite++) {
    const url = `https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=15&since=${sinceSekunden}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Kraken OHLC-Fehler: ${res.status}`);
    const data = await res.json();
    if (data.error && data.error.length) throw new Error(`Kraken-Fehler: ${data.error.join(', ')}`);
    const resultKey = Object.keys(data.result || {}).find((k) => k !== 'last');
    const batch = (resultKey && data.result[resultKey]) || [];
    if (batch.length < 2) break;
    alleKlines.push(...batch);
    const letzteZeitSekunden = batch[batch.length - 1][0];
    if (letzteZeitSekunden <= sinceSekunden) break;
    sinceSekunden = letzteZeitSekunden + 1;
    if (letzteZeitSekunden * 1000 >= bisJetzt) break;
  }
  return {
    closes: alleKlines.map((k) => parseFloat(k[4])),
    highs: alleKlines.map((k) => parseFloat(k[2])),
    lows: alleKlines.map((k) => parseFloat(k[3])),
    zeiten: alleKlines.map((k) => k[0] * 1000),
  };
}

async function ladeKlines(exchange, symbol, tageZurueck) {
  if (exchange === 'kraken') return ladeKlinesKraken(symbol, tageZurueck);
  return ladeKlinesBinance(symbol, tageZurueck);
}

function berechneMaxDrawdownProzent(equityKurve) {
  let peak = equityKurve[0];
  let maxDrawdown = 0;
  for (const wert of equityKurve) {
    peak = Math.max(peak, wert);
    maxDrawdown = Math.max(maxDrawdown, ((peak - wert) / peak) * 100);
  }
  return maxDrawdown;
}

function simuliere(closes, highs, lows, zeiten, cfg, startKapital) {
  let kapital = startKapital;
  let position = null;
  let heutigerVerlustUsdt = 0;
  let letzterTag = null;
  const trades = [];
  const equityKurve = [kapital];

  for (let i = FENSTER_FUER_INDIKATOREN; i < closes.length; i++) {
    const fensterCloses = closes.slice(0, i + 1);
    const fensterHighs = highs.slice(0, i + 1);
    const fensterLows = lows.slice(0, i + 1);
    const indikatoren = berechneIndikatoren(fensterCloses, fensterHighs, fensterLows, cfg);
    const { preis } = indikatoren;

    const tag = new Date(zeiten[i]).toISOString().slice(0, 10);
    if (tag !== letzterTag) { letzterTag = tag; heutigerVerlustUsdt = 0; }
    const handelsSperreHeute = heutigerVerlustUsdt <= -(kapital * cfg.maxTagesverlustProzent) / 100;

    if (!position) {
      const kauf = entscheideKauf({
        kapital, cfg, indikatoren, positionenPlatzFrei: true, handelsSperreHeute, kuerzlicheTrades: trades,
        jetztZeitstempel: zeiten[i], cooldownBisZeitstempel: null,
      });
      if (kauf) {
        const qty = kauf.investBetrag / preis;
        position = { qty, entryPreis: preis, hoechsterPreisSeitEinstieg: preis, einstiegAm: zeiten[i], entryAtr: indikatoren.atrJetzt, teilverkaufGemacht: false };
      }
    } else {
      const verkauf = entscheideVerkauf({ position, cfg, indikatoren });
      position.hoechsterPreisSeitEinstieg = verkauf.hoechsterPreisSeitEinstieg;
      if (verkauf.teilverkauf) {
        const teilQty = position.qty * verkauf.teilAnteil;
        const einsatz = teilQty * position.entryPreis;
        const gewinnVerlust = teilQty * preis - einsatz;
        kapital += gewinnVerlust;
        heutigerVerlustUsdt += Math.min(0, gewinnVerlust);
        trades.push({ gewinnVerlustUsdt: gewinnVerlust, gewinnProzent: (gewinnVerlust / einsatz) * 100 });
        position.qty -= teilQty;
        position.teilverkaufGemacht = true;
      } else if (verkauf.verkaufen) {
        const einsatz = position.qty * position.entryPreis;
        const gewinnVerlust = position.qty * preis - einsatz;
        kapital += gewinnVerlust;
        heutigerVerlustUsdt += Math.min(0, gewinnVerlust);
        trades.push({ gewinnVerlustUsdt: gewinnVerlust, gewinnProzent: (gewinnVerlust / einsatz) * 100 });
        position = null;
        if (((kapital - startKapital) / startKapital) * 100 <= -cfg.maxGesamtverlustProzent) { equityKurve.push(kapital); break; }
      }
    }
    equityKurve.push(position ? kapital + position.qty * (preis - position.entryPreis) : kapital);
  }
  return { kapitalEnde: kapital, trades, equityKurve };
}

function berechneKennzahlen(startKapital, ergebnis) {
  const { kapitalEnde, trades, equityKurve } = ergebnis;
  const gewinnTrades = trades.filter((t) => t.gewinnVerlustUsdt > 0);
  return {
    winRateProzent: trades.length ? (gewinnTrades.length / trades.length) * 100 : null,
    gesamtReturnProzent: ((kapitalEnde - startKapital) / startKapital) * 100,
    maxDrawdownProzent: berechneMaxDrawdownProzent(equityKurve),
    anzahlTrades: trades.length,
  };
}

export async function pruefeUndFuehreAutoBacktest(env, cfg) {
  if (!cfg.autoBacktest) return;
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags, wie Rebalancing/adaptives Lernen
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.TRADING_STATE.get('backtest:letzteWoche');
  if (letzte === aktuelleWoche) return;

  const ergebnisse = [];
  // closesProSymbol wird NICHT extra für die Korrelation abgerufen - nutzt
  // dieselben Kerzen, die hier ohnehin schon für den Backtest geladen
  // werden, statt die externen Anfragen pro Lauf zu verdoppeln.
  const closesProSymbol = {};
  for (const symbol of cfg.symbols) {
    try {
      const { closes, highs, lows, zeiten } = await ladeKlines(cfg.exchange, symbol, AUTO_BACKTEST_TAGE);
      if (closes.length < FENSTER_FUER_INDIKATOREN + 2) continue;
      closesProSymbol[symbol] = closes;
      const cfgSymbol = cfg.strategieProSymbol[symbol] ? { ...cfg, strategie: cfg.strategieProSymbol[symbol] } : cfg;
      const ergebnis = simuliere(closes, highs, lows, zeiten, cfgSymbol, REFERENZ_STARTKAPITAL);
      const k = berechneKennzahlen(REFERENZ_STARTKAPITAL, ergebnis);
      const buyAndHoldProzent = ((closes[closes.length - 1] - closes[FENSTER_FUER_INDIKATOREN]) / closes[FENSTER_FUER_INDIKATOREN]) * 100;
      const eintrag = { symbol, strategie: cfgSymbol.strategie, tageZurueck: AUTO_BACKTEST_TAGE, berechnetAm: jetzt.toISOString(), buyAndHoldProzent, ...k };
      await env.TRADING_STATE.put(`backtest:${symbol}`, JSON.stringify(eintrag));
      ergebnisse.push(eintrag);
    } catch (err) {
      console.error(`[trading-bot] Auto-Backtest ${symbol} fehlgeschlagen:`, err);
    }
  }

  if (ergebnisse.length) {
    const zeilen = ergebnisse.map((e) => `${e.symbol}: ${e.gesamtReturnProzent >= 0 ? '+' : ''}${e.gesamtReturnProzent.toFixed(1)}% (${e.anzahlTrades} Trades${e.winRateProzent != null ? `, Win-Rate ${e.winRateProzent.toFixed(0)}%` : ''})`);
    await notify(env, `🧪 Automatischer Backtest (letzte ${AUTO_BACKTEST_TAGE} Tage, echte Kursdaten):\n${zeilen.join('\n')}`);
  }

  if (Object.keys(closesProSymbol).length >= 2) {
    try {
      const matrix = berechneKorrelationsMatrix(closesProSymbol);
      await env.TRADING_STATE.put('korrelation:matrix', JSON.stringify({ matrix, berechnetAm: jetzt.toISOString(), tageZurueck: AUTO_BACKTEST_TAGE }));
    } catch (err) {
      console.error('[trading-bot] Korrelationsmatrix fehlgeschlagen:', err);
    }
  }

  await env.TRADING_STATE.put('backtest:letzteWoche', aktuelleWoche);
}
