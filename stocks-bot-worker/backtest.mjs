#!/usr/bin/env node
// Backtest für die Aktien-Bot-Strategie: simuliert dieselbe Entscheidungslogik
// wie worker.js (aus lib/strategie.mjs, 1:1 identisch mit dem Krypto-Bot)
// bar-für-bar gegen ECHTE historische Alpaca-Kerzen. Schließt die im README
// dokumentierte Lücke ("Strategie für Aktien noch nicht per Backtest
// verifiziert") - bis jetzt lief der Krypto-Backtest (trading-bot-worker/
// backtest.mjs) nur gegen Binance/Kraken-Kerzen, nie gegen Alpaca-Daten.
// WICHTIG: das ist KEINE Garantie für die Zukunft, nur eine Grundlage, um
// eine Konfiguration mit echten Daten zu prüfen, statt blind zu vertrauen.
//
// Nutzung (braucht die gleichen ALPACA_API_KEY/ALPACA_API_SECRET wie der
// Live-Bot - Paper-Keys reichen, Alpacas Marktdaten-API ist vom Trading-
// Konto getrennt und liefert unabhängig davon historische Kerzen):
//   ALPACA_API_KEY=... ALPACA_API_SECRET=... node backtest.mjs AAPL 90
//   (Symbol, Anzahl Tage zurück - Default 90)
//
// Alle drei Strategien direkt gegeneinander vergleichen (empfohlen, bevor
// man sich für eine entscheidet):
//   ALPACA_API_KEY=... ALPACA_API_SECRET=... node backtest.mjs AAPL 90 --vergleiche
//
// Alle STOCKS_*-Umgebungsvariablen aus wrangler.toml funktionieren hier
// genauso (gleiche Namen), damit man exakt seine eigene Konfiguration testen
// kann, z.B.:
//   STOCKS_RSI_UEBERKAUFT=70 STOCKS_STOP_LOSS_PROZENT=2 node backtest.mjs AAPL 180

import { berechneIndikatoren, entscheideKauf, entscheideVerkauf } from './lib/strategie.mjs';

const DATA_BASE = 'https://data.alpaca.markets';
const BARS_PRO_REQUEST = 10000;
const FENSTER_FUER_INDIKATOREN = 60; // genug Vorlauf für EMA(21)/RSI(14)/ATR(14)/Bollinger(20)/Donchian(20)

function readConfig(strategieOverride) {
  const env = process.env;
  const strategie = strategieOverride || (env.STOCKS_STRATEGIE || 'bollinger-mean-reversion').trim();
  const GUELTIGE_STRATEGIEN = ['ema-crossover', 'bollinger-mean-reversion', 'donchian-breakout'];
  if (!GUELTIGE_STRATEGIEN.includes(strategie)) {
    throw new Error(`Unbekannte Strategie "${strategie}" - unterstützt: ${GUELTIGE_STRATEGIEN.join(', ')}`);
  }
  return {
    strategie,
    bollingerPeriode: parseInt(env.STOCKS_BOLLINGER_PERIODE || '20', 10),
    bollingerStdDev: parseFloat(env.STOCKS_BOLLINGER_STDDEV || '2'),
    donchianEntryPeriode: parseInt(env.STOCKS_DONCHIAN_ENTRY_PERIODE || '20', 10),
    donchianExitPeriode: parseInt(env.STOCKS_DONCHIAN_EXIT_PERIODE || '10', 10),
    maxPositionProzent: parseFloat(env.STOCKS_MAX_POSITION_PROZENT || '25'),
    maxTagesverlustProzent: parseFloat(env.STOCKS_MAX_TAGESVERLUST_PROZENT || '5'),
    maxGesamtverlustProzent: parseFloat(env.STOCKS_MAX_GESAMTVERLUST_PROZENT || '20'),
    stopLossProzent: parseFloat(env.STOCKS_STOP_LOSS_PROZENT || '3'),
    takeProfitProzent: parseFloat(env.STOCKS_TAKE_PROFIT_PROZENT || '0'),
    emaSchnell: parseInt(env.STOCKS_EMA_SCHNELL || '9', 10),
    emaLangsam: parseInt(env.STOCKS_EMA_LANGSAM || '21', 10),
    rsiPeriode: parseInt(env.STOCKS_RSI_PERIODE || '14', 10),
    rsiUeberkauft: parseFloat(env.STOCKS_RSI_UEBERKAUFT || '0'),
    minVolatilitaetProzent: 0,
    trailingStopAbProzent: parseFloat(env.STOCKS_TRAILING_STOP_AB_PROZENT || '0'),
    volaSizing: false,
    volaSizingReferenzProzent: 2,
    volaSizingMinFaktor: 0.25,
    performanceSizing: (env.STOCKS_PERFORMANCE_SIZING || 'nein') === 'ja',
    performanceSizingMinFaktor: parseFloat(env.STOCKS_PERFORMANCE_SIZING_MIN_FAKTOR || '0.5'),
    performanceSizingMinTrades: parseInt(env.STOCKS_PERFORMANCE_SIZING_MIN_TRADES || '5', 10),
    flashCrashFilter: (env.STOCKS_FLASH_CRASH_FILTER || 'ja') === 'ja',
    flashCrashFensterKerzen: parseInt(env.STOCKS_FLASH_CRASH_FENSTER_KERZEN || '4', 10),
    flashCrashMaxDropProzent: parseFloat(env.STOCKS_FLASH_CRASH_MAX_DROP_PROZENT || '8'),
    dynamischerStopLoss: false,
    stopLossAtrMultiplikator: 2,
    cooldownMinuten: parseInt(env.STOCKS_COOLDOWN_NACH_VERLUST_MINUTEN || '60', 10),
    partialTakeProfitProzent: 0,
    partialTakeProfitAnteil: 50,
    maxGleichzeitigePositionen: 1, // Backtest läuft immer pro Symbol einzeln
  };
}

function authHeaders() {
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    throw new Error('ALPACA_API_KEY und ALPACA_API_SECRET müssen gesetzt sein (die gleichen Paper-Keys wie der Live-Bot).');
  }
  return { 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY, 'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET };
}

// Alpacas /v2/stocks/{symbol}/bars gibt pro Anfrage bis zu 10.000 Kerzen
// zurück und liefert bei mehr Daten einen next_page_token - für einen
// Zeitraum von mehreren Monaten an 15m-Kerzen (nur Handelszeiten, also
// deutlich weniger als 24/7-Krypto) reicht meist eine, bei sehr langen
// Zeiträumen mehrere Anfragen nacheinander.
async function ladeKlinesAlpaca(symbol, tageZurueck) {
  const end = new Date();
  const start = new Date(end.getTime() - tageZurueck * 24 * 60 * 60 * 1000);
  const alleBars = [];
  let pageToken = null;

  do {
    const url = new URL(`${DATA_BASE}/v2/stocks/${symbol}/bars`);
    url.searchParams.set('timeframe', '15Min');
    url.searchParams.set('start', start.toISOString());
    url.searchParams.set('end', end.toISOString());
    url.searchParams.set('limit', String(BARS_PRO_REQUEST));
    url.searchParams.set('feed', 'iex');
    url.searchParams.set('adjustment', 'raw');
    if (pageToken) url.searchParams.set('page_token', pageToken);

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Alpaca Bars-Fehler (${symbol}): ${res.status} ${await res.text()}`);
    const data = await res.json();
    alleBars.push(...(data.bars || []));
    pageToken = data.next_page_token || null;
  } while (pageToken);

  return {
    closes: alleBars.map((b) => b.c),
    highs: alleBars.map((b) => b.h),
    lows: alleBars.map((b) => b.l),
    zeiten: alleBars.map((b) => new Date(b.t).getTime()),
  };
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

function simuliere(closes, highs, lows, zeiten, cfg, startKapital) {
  let kapital = startKapital;
  let position = null;
  let heutigerVerlustUsdt = 0;
  let letzterTag = null;
  let cooldownBisZeitstempel = null;
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
      const kauf = entscheideKauf({
        kapital, cfg, indikatoren, positionenPlatzFrei: true, handelsSperreHeute, kuerzlicheTrades: trades,
        jetztZeitstempel: zeiten[i], cooldownBisZeitstempel,
      });
      if (kauf) {
        const qty = kauf.investBetrag / preis;
        position = { qty, entryPreis: preis, hoechsterPreisSeitEinstieg: preis, einstiegAm: zeiten[i], entryAtr: indikatoren.atrJetzt, teilverkaufGemacht: false };
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
        if (cfg.cooldownMinuten > 0 && gewinnVerlust < 0) {
          cooldownBisZeitstempel = zeiten[i] + cfg.cooldownMinuten * 60000;
        }
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
    `\n=== Backtest ${symbol} — Strategie "${strategie}" — letzte ${tageZurueck} Tage (15m-Kerzen, nur Handelszeiten) ===`,
    `Startkapital:            ${startKapital.toFixed(2)} USD`,
    `Endkapital:              ${k.kapitalEnde.toFixed(2)} USD`,
    `Gesamt-Return:           ${k.gesamtReturnProzent >= 0 ? '+' : ''}${k.gesamtReturnProzent.toFixed(2)}%`,
    `Buy & Hold im Vergleich: ${buyAndHoldProzent >= 0 ? '+' : ''}${buyAndHoldProzent.toFixed(2)}%`,
    `Max. Drawdown:           -${k.maxDrawdown.toFixed(2)}%`,
    `Anzahl Trades:           ${k.anzahlTrades}`,
    `Win-Rate:                ${k.winRate !== null ? k.winRate.toFixed(1) + '%' : '– (keine Trades)'}`,
    `Ø Gewinn/Verlust:        ${k.avgGewinnProzent !== null ? (k.avgGewinnProzent >= 0 ? '+' : '') + k.avgGewinnProzent.toFixed(2) + '%' : '–'}`,
  ];
  return zeilen.join('\n');
}

async function main() {
  const symbol = (process.argv[2] || 'AAPL').toUpperCase();
  const tageZurueck = parseInt(process.argv[3] || '90', 10);
  const vergleiche = process.argv.includes('--vergleiche');
  const startKapital = parseFloat(process.env.STOCKS_KAPITAL_USD || '50');

  console.log(`Lade ${tageZurueck} Tage 15m-Kerzen für ${symbol} von Alpaca (IEX-Feed, nur Handelszeiten)...`);
  const { closes, highs, lows, zeiten } = await ladeKlinesAlpaca(symbol, tageZurueck);
  if (closes.length < FENSTER_FUER_INDIKATOREN + 2) {
    console.error(`Zu wenig Kerzen geladen (${closes.length}) — Symbol oder Zeitraum prüfen (evtl. begrenzt Alpacas kostenloser IEX-Feed die verfügbare Historie).`);
    process.exit(1);
  }
  const buyAndHoldProzent = ((closes[closes.length - 1] - closes[FENSTER_FUER_INDIKATOREN]) / closes[FENSTER_FUER_INDIKATOREN]) * 100;

  const strategien = vergleiche ? ['ema-crossover', 'bollinger-mean-reversion', 'donchian-breakout'] : [readConfig().strategie];
  const kennzahlenProStrategie = {};
  for (const strategie of strategien) {
    const cfg = readConfig(strategie);
    const ergebnis = simuliere(closes, highs, lows, zeiten, cfg, startKapital);
    console.log(formatiereBericht(symbol, tageZurueck, strategie, startKapital, ergebnis, buyAndHoldProzent));
    kennzahlenProStrategie[strategie] = berechneKennzahlen(startKapital, ergebnis);
  }

  if (vergleiche) {
    const gewinner = strategien.reduce((best, s) =>
      kennzahlenProStrategie[s].gesamtReturnProzent > kennzahlenProStrategie[best].gesamtReturnProzent ? s : best
    );
    console.log(`\n>>> Für ${symbol} in diesem Zeitraum besser abgeschnitten: "${gewinner}"`);
  }

  console.log(`\n⚠️  Vergangene Performance ist KEINE Garantie für die Zukunft. Alpacas`);
  console.log(`    kostenloser IEX-Feed deckt nur einen Teil des Marktvolumens ab, echte`);
  console.log(`    Fills können leicht abweichen. Vor jedem Umstieg auf ein echtes`);
  console.log(`    Alpaca-Live-Konto zusätzlich mehrere Wochen im Paper-Modus beobachten.`);
}

main().catch((err) => {
  console.error('Backtest fehlgeschlagen:', err.message || err);
  process.exit(1);
});
