#!/usr/bin/env node
// Backtest für die Trading-Bot-Strategie: simuliert dieselbe Entscheidungs-
// logik wie worker.js (aus lib/strategie.mjs) bar-für-bar gegen echte
// historische Binance-Kerzen. Zeigt, wie die aktuell konfigurierte Strategie
// in der Vergangenheit abgeschnitten hätte — WICHTIG: das ist KEINE Garantie
// für die Zukunft, sondern nur eine Grundlage, um eine Konfiguration VOR dem
// Live-Einsatz (oder vor TRADING_PAPER_MODE="nein") mit echten Daten zu
// prüfen, statt blind zu vertrauen.
//
// Nutzung:
//   node backtest.mjs BTCUSDT 90
//   (Symbol, Anzahl Tage zurück - Default 90)
//
// Alle drei Strategien direkt gegeneinander vergleichen (empfohlen, bevor
// man sich für eine entscheidet):
//   node backtest.mjs BTCUSDT 90 --vergleiche
//
// Alle TRADING_*-Umgebungsvariablen aus wrangler.toml funktionieren hier
// genauso (gleiche Namen), damit man exakt seine eigene Konfiguration testen
// kann, z.B.:
//   TRADING_RSI_UEBERKAUFT=70 TRADING_TRAILING_STOP_AB_PROZENT=2 node backtest.mjs BTCUSDT 180
//   TRADING_STRATEGIE=bollinger-mean-reversion node backtest.mjs BTCUSDT 90

import { berechneIndikatoren, entscheideKauf, entscheideVerkauf } from './lib/strategie.mjs';

const BINANCE_BASE = 'https://api.binance.com';
const KRAKEN_BASE = 'https://api.kraken.com';
const KLINES_PRO_REQUEST = 1000;
const FENSTER_FUER_INDIKATOREN = 60; // genug Vorlauf für EMA(21)/RSI(14)/ATR(14)/Bollinger(20)/Donchian(20)

function readConfig(strategieOverride) {
  const env = process.env;
  const strategie = strategieOverride || env.TRADING_STRATEGIE || 'ema-crossover';
  return {
    strategie,
    bollingerPeriode: parseInt(env.TRADING_BOLLINGER_PERIODE || '20', 10),
    bollingerStdDev: parseFloat(env.TRADING_BOLLINGER_STDDEV || '2'),
    donchianEntryPeriode: parseInt(env.TRADING_DONCHIAN_ENTRY_PERIODE || '20', 10),
    donchianExitPeriode: parseInt(env.TRADING_DONCHIAN_EXIT_PERIODE || '10', 10),
    maxPositionProzent: parseFloat(env.TRADING_MAX_POSITION_PROZENT || '25'),
    maxTagesverlustProzent: parseFloat(env.TRADING_MAX_TAGESVERLUST_PROZENT || '5'),
    maxGesamtverlustProzent: parseFloat(env.TRADING_MAX_GESAMTVERLUST_PROZENT || '20'),
    stopLossProzent: parseFloat(env.TRADING_STOP_LOSS_PROZENT || '3'),
    takeProfitProzent: parseFloat(env.TRADING_TAKE_PROFIT_PROZENT || '0'),
    emaSchnell: parseInt(env.TRADING_EMA_SCHNELL || '9', 10),
    emaLangsam: parseInt(env.TRADING_EMA_LANGSAM || '21', 10),
    rsiPeriode: parseInt(env.TRADING_RSI_PERIODE || '14', 10),
    rsiUeberkauft: parseFloat(env.TRADING_RSI_UEBERKAUFT || '0'),
    minVolatilitaetProzent: parseFloat(env.TRADING_MIN_VOLATILITAET_PROZENT || '0'),
    trailingStopAbProzent: parseFloat(env.TRADING_TRAILING_STOP_AB_PROZENT || '0'),
    volaSizing: (env.TRADING_VOLA_SIZING || 'nein') === 'ja',
    volaSizingReferenzProzent: parseFloat(env.TRADING_VOLA_SIZING_REFERENZ_PROZENT || '2'),
    volaSizingMinFaktor: parseFloat(env.TRADING_VOLA_SIZING_MIN_FAKTOR || '0.25'),
    performanceSizing: (env.TRADING_PERFORMANCE_SIZING || 'nein') === 'ja',
    performanceSizingMinFaktor: parseFloat(env.TRADING_PERFORMANCE_SIZING_MIN_FAKTOR || '0.5'),
    performanceSizingMinTrades: parseInt(env.TRADING_PERFORMANCE_SIZING_MIN_TRADES || '5', 10),
    maxGleichzeitigePositionen: 1, // Backtest läuft immer pro Symbol einzeln
  };
}

async function ladeKlinesBinance(symbol, tageZurueck) {
  const bisJetzt = Date.now();
  const startZeit = bisJetzt - tageZurueck * 24 * 60 * 60 * 1000;
  const alleKlines = [];
  let cursor = startZeit;

  while (cursor < bisJetzt) {
    const url = `${BINANCE_BASE}/api/v3/klines?symbol=${symbol}&interval=15m&startTime=${cursor}&limit=${KLINES_PRO_REQUEST}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance Klines-Fehler: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    if (!batch.length) break;
    alleKlines.push(...batch);
    const letzteOffenZeit = batch[batch.length - 1][0];
    if (letzteOffenZeit <= cursor) break; // Sicherheitsnetz gegen Endlos-Schleife
    cursor = letzteOffenZeit + 1;
    if (batch.length < KLINES_PRO_REQUEST) break;
  }

  return {
    closes: alleKlines.map((k) => parseFloat(k[4])),
    highs: alleKlines.map((k) => parseFloat(k[2])),
    lows: alleKlines.map((k) => parseFloat(k[3])),
    zeiten: alleKlines.map((k) => k[0]),
  };
}

// Krakens OHLC-Endpoint kennt kein startTime/limit-Paar wie Binance, sondern
// nur `since` (Sekunden) und liefert ab dort bis zu ~720 Kerzen zurück - für
// einen Zeitraum von mehreren Monaten also mehrere Anfragen mit vorrückendem
// `since` nötig, bis die aktuelle Zeit erreicht ist.
async function ladeKlinesKraken(symbol, tageZurueck) {
  const bisJetzt = Date.now();
  let sinceSekunden = Math.floor((bisJetzt - tageZurueck * 24 * 60 * 60 * 1000) / 1000);
  const alleKlines = [];

  while (true) {
    const url = `${KRAKEN_BASE}/0/public/OHLC?pair=${symbol}&interval=15&since=${sinceSekunden}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Kraken OHLC-Fehler: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (data.error && data.error.length) throw new Error(`Kraken-Fehler: ${data.error.join(', ')}`);
    const resultKey = Object.keys(data.result || {}).find((k) => k !== 'last');
    const batch = (resultKey && data.result[resultKey]) || [];
    if (batch.length < 2) break; // letzte, evtl. noch offene Kerze zählt nicht als Fortschritt
    alleKlines.push(...batch);
    const letzteZeitSekunden = batch[batch.length - 1][0];
    if (letzteZeitSekunden <= sinceSekunden) break; // Sicherheitsnetz gegen Endlos-Schleife
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
    const drawdown = ((peak - wert) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  return maxDrawdown;
}

function simuliere(symbol, closes, highs, lows, zeiten, cfg, startKapital) {
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
    if (tag !== letzterTag) {
      letzterTag = tag;
      heutigerVerlustUsdt = 0;
    }
    const handelsSperreHeute = heutigerVerlustUsdt <= -(kapital * cfg.maxTagesverlustProzent) / 100;

    if (!position) {
      const kauf = entscheideKauf({ kapital, cfg, indikatoren, positionenPlatzFrei: true, handelsSperreHeute, kuerzlicheTrades: trades });
      if (kauf) {
        const qty = kauf.investBetrag / preis;
        position = { qty, entryPreis: preis, hoechsterPreisSeitEinstieg: preis, einstiegAm: zeiten[i] };
      }
    } else {
      const verkauf = entscheideVerkauf({ position, cfg, indikatoren });
      position.hoechsterPreisSeitEinstieg = verkauf.hoechsterPreisSeitEinstieg;
      if (verkauf.verkaufen) {
        const einsatz = position.qty * position.entryPreis;
        const erloes = position.qty * preis;
        const gewinnVerlust = erloes - einsatz;
        kapital += gewinnVerlust;
        heutigerVerlustUsdt += Math.min(0, gewinnVerlust);
        trades.push({
          einstiegAm: position.einstiegAm,
          ausstiegAm: zeiten[i],
          entryPreis: position.entryPreis,
          exitPreis: preis,
          gewinnVerlustUsdt: gewinnVerlust,
          gewinnProzent: (gewinnVerlust / einsatz) * 100,
          grund: verkauf.grund,
        });
        position = null;

        const gesamtVerlustProzent = ((kapital - startKapital) / startKapital) * 100;
        if (gesamtVerlustProzent <= -cfg.maxGesamtverlustProzent) {
          equityKurve.push(kapital);
          break; // Kill-Switch: Backtest stoppt hier, genau wie der Live-Bot
        }
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
    winRate: trades.length ? (gewinnTrades.length / trades.length) * 100 : null,
    gesamtReturnProzent: ((kapitalEnde - startKapital) / startKapital) * 100,
    maxDrawdown: berechneMaxDrawdownProzent(equityKurve),
    avgGewinnProzent: trades.length ? trades.reduce((s, t) => s + t.gewinnProzent, 0) / trades.length : null,
    anzahlTrades: trades.length,
    kapitalEnde,
  };
}

function formatiereBericht(symbol, tageZurueck, strategie, startKapital, ergebnis, buyAndHoldProzent) {
  const k = berechneKennzahlen(startKapital, ergebnis);
  const zeilen = [
    `\n=== Backtest ${symbol} — Strategie "${strategie}" — letzte ${tageZurueck} Tage (15m-Kerzen) ===`,
    `Startkapital:        ${startKapital.toFixed(2)} USDT`,
    `Endkapital:           ${k.kapitalEnde.toFixed(2)} USDT`,
    `Gesamt-Return:        ${k.gesamtReturnProzent >= 0 ? '+' : ''}${k.gesamtReturnProzent.toFixed(2)}%`,
    `Buy & Hold im Vergleich: ${buyAndHoldProzent >= 0 ? '+' : ''}${buyAndHoldProzent.toFixed(2)}%`,
    `Max. Drawdown:        -${k.maxDrawdown.toFixed(2)}%`,
    `Anzahl Trades:        ${k.anzahlTrades}`,
    `Win-Rate:             ${k.winRate !== null ? k.winRate.toFixed(1) + '%' : '– (keine Trades)'}`,
    `Ø Gewinn/Verlust:     ${k.avgGewinnProzent !== null ? (k.avgGewinnProzent >= 0 ? '+' : '') + k.avgGewinnProzent.toFixed(2) + '%' : '–'}`,
  ];
  return zeilen.join('\n');
}

async function main() {
  const symbol = process.argv[2] || 'BTCUSDT';
  const tageZurueck = parseInt(process.argv[3] || '90', 10);
  const vergleiche = process.argv.includes('--vergleiche');
  const startKapital = parseFloat(process.env.TRADING_KAPITAL_USDT || '100');
  const exchange = (process.env.TRADING_EXCHANGE || 'binance').trim().toLowerCase();

  console.log(`Lade ${tageZurueck} Tage 15m-Kerzen für ${symbol} von ${exchange}...`);
  const { closes, highs, lows, zeiten } = await ladeKlines(exchange, symbol, tageZurueck);
  if (closes.length < FENSTER_FUER_INDIKATOREN + 2) {
    console.error(`Zu wenig Kerzen geladen (${closes.length}) — Symbol oder Zeitraum prüfen.`);
    process.exit(1);
  }
  const buyAndHoldProzent = ((closes[closes.length - 1] - closes[FENSTER_FUER_INDIKATOREN]) / closes[FENSTER_FUER_INDIKATOREN]) * 100;

  const strategien = vergleiche ? ['ema-crossover', 'bollinger-mean-reversion', 'donchian-breakout'] : [readConfig().strategie];
  const kennzahlenProStrategie = {};
  for (const strategie of strategien) {
    const cfg = readConfig(strategie);
    const ergebnis = simuliere(symbol, closes, highs, lows, zeiten, cfg, startKapital);
    console.log(formatiereBericht(symbol, tageZurueck, strategie, startKapital, ergebnis, buyAndHoldProzent));
    kennzahlenProStrategie[strategie] = berechneKennzahlen(startKapital, ergebnis);
  }

  if (vergleiche) {
    const gewinner = strategien.reduce((best, s) =>
      kennzahlenProStrategie[s].gesamtReturnProzent > kennzahlenProStrategie[best].gesamtReturnProzent ? s : best
    );
    console.log(`\n>>> Für ${symbol} in diesem Zeitraum besser abgeschnitten: "${gewinner}"`);
  }

  console.log(`\n⚠️  Vergangene Performance ist KEINE Garantie für die Zukunft. Vor jedem`);
  console.log(`    Umstieg auf TRADING_PAPER_MODE="nein" zusätzlich mindestens ein paar`);
  console.log(`    Wochen im Paper-Modus live beobachten.`);
}

main().catch((err) => {
  console.error('Backtest fehlgeschlagen:', err.message || err);
  process.exit(1);
});
