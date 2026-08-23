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
const ALLE_STRATEGIEN = ['ema-crossover', 'bollinger-mean-reversion', 'donchian-breakout', 'day-trading', 'ultimate'];
const WALK_FORWARD_FOLDS = 3;

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

// Coinbase erlaubt max. 300 Kerzen pro Anfrage (live per curl verifiziert -
// eine Anfrage über >300 15m-Kerzen liefert HTTP 400 "granularity too small
// for the requested time range"), deshalb in ~3-Tage-Fenstern (290 Kerzen à
// 15min ≈ 72,5h) statt Binance/Krakens ~1000er-Seiten paginiert. Antwort
// kommt NEUESTE ZUERST - wird pro Seite umgedreht, damit "zeiten" wie bei
// den anderen Börsen chronologisch aufsteigend bleibt.
async function ladeKlinesCoinbase(symbol, tageZurueck) {
  const GRANULARITAET_SEKUNDEN = 900;
  const MAX_KERZEN_PRO_SEITE = 290;
  const bisJetztSekunden = Math.floor(Date.now() / 1000);
  let cursorSekunden = bisJetztSekunden - tageZurueck * 24 * 60 * 60;
  const alleKlines = [];
  for (let seite = 0; seite < MAX_SEITEN_PRO_SYMBOL && cursorSekunden < bisJetztSekunden; seite++) {
    const endeSekunden = Math.min(cursorSekunden + MAX_KERZEN_PRO_SEITE * GRANULARITAET_SEKUNDEN, bisJetztSekunden);
    const url = `https://api.exchange.coinbase.com/products/${symbol}/candles?granularity=${GRANULARITAET_SEKUNDEN}&start=${cursorSekunden}&end=${endeSekunden}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Coinbase Candles-Fehler: ${res.status}`);
    const batch = await res.json(); // [time, low, high, open, close, volume], neueste zuerst
    if (batch.length) alleKlines.push(...[...batch].reverse());
    cursorSekunden = endeSekunden + 1;
  }
  return {
    closes: alleKlines.map((k) => k[4]),
    highs: alleKlines.map((k) => k[2]),
    lows: alleKlines.map((k) => k[3]),
    zeiten: alleKlines.map((k) => k[0] * 1000),
  };
}

async function ladeKlines(exchange, symbol, tageZurueck) {
  if (exchange === 'kraken') return ladeKlinesKraken(symbol, tageZurueck);
  if (exchange === 'coinbase') return ladeKlinesCoinbase(symbol, tageZurueck);
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

// Slippage/Gebühren (cfg.backtestSlippageProzent/backtestGebuehrProzent,
// siehe config.mjs) wirken NUR auf die Ausführungspreise/den Kapitalfluss -
// die Strategie "sieht" weiterhin den echten Kurs für ihre Entscheidungen
// (Stop-Loss/Take-Profit/Signale), genau wie live ein echter Bot auch auf
// Basis des zuletzt bekannten Kurses entscheidet, bevor der tatsächliche
// Fill etwas schlechter ausfällt. Macht den Backtest realistischer statt
// reine Kursbewegung ohne Handelskosten zu zeigen.
function simuliere(closes, highs, lows, zeiten, cfg, startKapital) {
  let kapital = startKapital;
  let position = null;
  let heutigerVerlustUsdt = 0;
  let letzterTag = null;
  const trades = [];
  const equityKurve = [kapital];
  const slippageFaktor = (cfg.backtestSlippageProzent || 0) / 100;
  const gebuehrFaktor = (cfg.backtestGebuehrProzent || 0) / 100;

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
        const kaufPreisEffektiv = preis * (1 + slippageFaktor);
        const investNetto = kauf.investBetrag * (1 - gebuehrFaktor);
        const qty = investNetto / kaufPreisEffektiv;
        position = { qty, entryPreis: kaufPreisEffektiv, hoechsterPreisSeitEinstieg: preis, einstiegAm: zeiten[i], entryAtr: indikatoren.atrJetzt, teilverkaufGemacht: false };
      }
    } else {
      const verkauf = entscheideVerkauf({ position, cfg, indikatoren, jetztZeitstempel: zeiten[i] });
      position.hoechsterPreisSeitEinstieg = verkauf.hoechsterPreisSeitEinstieg;
      if (verkauf.teilverkauf) {
        const verkaufPreisEffektiv = preis * (1 - slippageFaktor);
        const teilQty = position.qty * verkauf.teilAnteil;
        const einsatz = teilQty * position.entryPreis;
        const erloesNetto = teilQty * verkaufPreisEffektiv * (1 - gebuehrFaktor);
        const gewinnVerlust = erloesNetto - einsatz;
        kapital += gewinnVerlust;
        heutigerVerlustUsdt += Math.min(0, gewinnVerlust);
        trades.push({ gewinnVerlustUsdt: gewinnVerlust, gewinnProzent: (gewinnVerlust / einsatz) * 100, ausstiegAm: zeiten[i] });
        position.qty -= teilQty;
        position.teilverkaufGemacht = true;
      } else if (verkauf.verkaufen) {
        const verkaufPreisEffektiv = preis * (1 - slippageFaktor);
        const einsatz = position.qty * position.entryPreis;
        const erloesNetto = position.qty * verkaufPreisEffektiv * (1 - gebuehrFaktor);
        const gewinnVerlust = erloesNetto - einsatz;
        kapital += gewinnVerlust;
        heutigerVerlustUsdt += Math.min(0, gewinnVerlust);
        trades.push({ gewinnVerlustUsdt: gewinnVerlust, gewinnProzent: (gewinnVerlust / einsatz) * 100, ausstiegAm: zeiten[i] });
        position = null;
        if (((kapital - startKapital) / startKapital) * 100 <= -cfg.maxGesamtverlustProzent) { equityKurve.push(kapital); break; }
      }
    }
    equityKurve.push(position ? kapital + position.qty * (preis - position.entryPreis) : kapital);
  }
  return { kapitalEnde: kapital, trades, equityKurve };
}

// Walk-Forward-Analyse: teilt den bereits simulierten Zeitraum in
// WALK_FORWARD_FOLDS aufeinanderfolgende Abschnitte und misst die
// Performance JE Abschnitt separat, statt nur eine einzige Gesamtzahl zu
// zeigen. Deckt auf, ob die Gesamt-Rendite gleichmäßig entsteht oder nur
// von einem einzelnen Zeitfenster getragen wird (klassisches Overfitting-
// Warnsignal) - läuft auf denselben, bereits simulierten Trades, kein
// zweiter Simulationslauf nötig.
function walkForwardAnalyse(zeiten, trades, startKapital) {
  const startZeit = zeiten[FENSTER_FUER_INDIKATOREN];
  const endZeit = zeiten[zeiten.length - 1];
  const dauer = endZeit - startZeit;
  if (!(dauer > 0)) return null;
  const foldDauer = dauer / WALK_FORWARD_FOLDS;

  const folds = [];
  let kapitalVorFold = startKapital;
  for (let f = 0; f < WALK_FORWARD_FOLDS; f++) {
    const foldStart = startZeit + f * foldDauer;
    const foldEnde = f === WALK_FORWARD_FOLDS - 1 ? endZeit + 1 : startZeit + (f + 1) * foldDauer;
    const foldTrades = trades.filter((t) => t.ausstiegAm >= foldStart && t.ausstiegAm < foldEnde);
    const kapitalNachFold = kapitalVorFold + foldTrades.reduce((s, t) => s + t.gewinnVerlustUsdt, 0);
    const gewinnTrades = foldTrades.filter((t) => t.gewinnVerlustUsdt > 0);
    folds.push({
      von: new Date(foldStart).toISOString(),
      bis: new Date(Math.min(foldEnde, endZeit)).toISOString(),
      anzahlTrades: foldTrades.length,
      winRateProzent: foldTrades.length ? (gewinnTrades.length / foldTrades.length) * 100 : null,
      returnProzent: kapitalVorFold > 0 ? ((kapitalNachFold - kapitalVorFold) / kapitalVorFold) * 100 : 0,
    });
    kapitalVorFold = kapitalNachFold;
  }

  const positiveFolds = folds.filter((f) => f.returnProzent > 0).length;
  const konsistent = positiveFolds >= Math.ceil(WALK_FORWARD_FOLDS / 2);
  return { folds, positiveFolds, gesamtFolds: WALK_FORWARD_FOLDS, konsistent };
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
      const { closes, highs, lows, zeiten } = await ladeKlines(cfg.exchangeProSymbol[symbol] || cfg.exchange, symbol, AUTO_BACKTEST_TAGE);
      if (closes.length < FENSTER_FUER_INDIKATOREN + 2) continue;
      closesProSymbol[symbol] = closes;
      const cfgSymbol = cfg.strategieProSymbol[symbol] ? { ...cfg, strategie: cfg.strategieProSymbol[symbol] } : cfg;
      const ergebnis = simuliere(closes, highs, lows, zeiten, cfgSymbol, REFERENZ_STARTKAPITAL);
      const k = berechneKennzahlen(REFERENZ_STARTKAPITAL, ergebnis);
      const buyAndHoldProzent = ((closes[closes.length - 1] - closes[FENSTER_FUER_INDIKATOREN]) / closes[FENSTER_FUER_INDIKATOREN]) * 100;
      const walkForward = walkForwardAnalyse(zeiten, ergebnis.trades, REFERENZ_STARTKAPITAL);
      const eintrag = {
        symbol, strategie: cfgSymbol.strategie, tageZurueck: AUTO_BACKTEST_TAGE, berechnetAm: jetzt.toISOString(), buyAndHoldProzent,
        slippageProzent: cfg.backtestSlippageProzent, gebuehrProzent: cfg.backtestGebuehrProzent, walkForward, ...k,
      };
      await env.TRADING_STATE.put(`backtest:${symbol}`, JSON.stringify(eintrag));
      ergebnisse.push(eintrag);

      // Strategie-Turnier: dieselben schon geladenen Kerzen genutzt, um ALLE
      // unterstützten Strategien gegeneinander zu testen (nicht nur die
      // aktuell konfigurierte) - zeigt, ob eine andere Strategie auf DIESEM
      // Symbol gerade besser abschneiden würde. Rein informativ: wechselt NIE
      // automatisch die Live-Strategie, das bleibt eine manuelle Entscheidung
      // (TRADING_STRATEGIE_PRO_SYMBOL in wrangler.toml).
      const ranking = ALLE_STRATEGIEN.map((kandidat) => {
        if (kandidat === cfgSymbol.strategie) return { strategie: kandidat, ...k };
        const kandidatErgebnis = simuliere(closes, highs, lows, zeiten, { ...cfgSymbol, strategie: kandidat }, REFERENZ_STARTKAPITAL);
        return { strategie: kandidat, ...berechneKennzahlen(REFERENZ_STARTKAPITAL, kandidatErgebnis) };
      }).sort((a, b) => b.gesamtReturnProzent - a.gesamtReturnProzent);
      await env.TRADING_STATE.put(`turnier:${symbol}`, JSON.stringify({
        symbol, aktuelleStrategie: cfgSymbol.strategie, tageZurueck: AUTO_BACKTEST_TAGE, berechnetAm: jetzt.toISOString(), ranking,
      }));
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
