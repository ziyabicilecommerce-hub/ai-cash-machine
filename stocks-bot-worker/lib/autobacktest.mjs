// Automatischer, wöchentlicher Backtest-Check GEGEN ECHTE historische
// Alpaca-Kerzen - Pendant zu trading-bot-worker/lib/autobacktest.mjs. Läuft
// wie das adaptive Lernen einmal pro Woche (montags) im 5-Minuten-Cron mit.
// Rein informativ: verändert NIE Kapital, Position oder Trade-Historie -
// schreibt nur ein separates `backtest:<symbol>`-Feld in KV, das /status
// mit ausliefert.
//
// Bewusst NUR die letzten AUTO_BACKTEST_TAGE Tage (kurzes rollierendes
// Fenster, nicht die vollen 90 Tage wie backtest.mjs auf der Kommandozeile) -
// gleicher Zeitraum wie beim Krypto-Bot, damit beide im Dashboard
// vergleichbar bleiben. Für eine tiefere Analyse bleibt backtest.mjs (lokal)
// die richtige Wahl.

import { berechneIndikatoren, entscheideKauf, entscheideVerkauf } from './strategie.mjs';
import { notify } from './notify.mjs';
import { berechneKorrelationsMatrix } from './korrelation.mjs';

const DATA_BASE = 'https://data.alpaca.markets';
const AUTO_BACKTEST_TAGE = 14;
const FENSTER_FUER_INDIKATOREN = 60;
const REFERENZ_STARTKAPITAL = 100;
const ALLE_STRATEGIEN = ['ema-crossover', 'bollinger-mean-reversion', 'donchian-breakout'];

function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

async function ladeKlinesAlpaca(env, symbol, tageZurueck) {
  const end = new Date();
  const start = new Date(end.getTime() - tageZurueck * 24 * 60 * 60 * 1000);
  const url = new URL(`${DATA_BASE}/v2/stocks/${symbol}/bars`);
  url.searchParams.set('timeframe', '15Min');
  url.searchParams.set('start', start.toISOString());
  url.searchParams.set('end', end.toISOString());
  url.searchParams.set('limit', '10000');
  url.searchParams.set('feed', 'iex');
  url.searchParams.set('adjustment', 'raw');
  const res = await fetch(url, { headers: { 'APCA-API-KEY-ID': env.ALPACA_API_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_API_SECRET } });
  if (!res.ok) throw new Error(`Alpaca Bars-Fehler (${symbol}): ${res.status}`);
  const data = await res.json();
  const bars = data.bars || [];
  return {
    closes: bars.map((b) => b.c),
    highs: bars.map((b) => b.h),
    lows: bars.map((b) => b.l),
    zeiten: bars.map((b) => new Date(b.t).getTime()),
  };
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
        position = { qty, entryPreis: preis, hoechsterPreisSeitEinstieg: preis, einstiegAm: zeiten[i], entryAtr: indikatoren.atrJetzt };
      }
    } else {
      const verkauf = entscheideVerkauf({ position, cfg, indikatoren });
      position.hoechsterPreisSeitEinstieg = verkauf.hoechsterPreisSeitEinstieg;
      if (verkauf.verkaufen) {
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
  if (jetzt.getUTCDay() !== 1) return; // nur montags
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.STOCKS_STATE.get('backtest:letzteWoche');
  if (letzte === aktuelleWoche) return;

  const ergebnisse = [];
  // closesProSymbol wird NICHT extra für die Korrelation abgerufen - nutzt
  // dieselben Kerzen, die hier ohnehin schon für den Backtest geladen
  // werden, statt die externen Anfragen pro Lauf zu verdoppeln.
  const closesProSymbol = {};
  for (const symbol of cfg.symbols) {
    try {
      const { closes, highs, lows, zeiten } = await ladeKlinesAlpaca(env, symbol, AUTO_BACKTEST_TAGE);
      if (closes.length < FENSTER_FUER_INDIKATOREN + 2) continue;
      closesProSymbol[symbol] = closes;
      const ergebnis = simuliere(closes, highs, lows, zeiten, cfg, REFERENZ_STARTKAPITAL);
      const k = berechneKennzahlen(REFERENZ_STARTKAPITAL, ergebnis);
      const buyAndHoldProzent = ((closes[closes.length - 1] - closes[FENSTER_FUER_INDIKATOREN]) / closes[FENSTER_FUER_INDIKATOREN]) * 100;
      const eintrag = { symbol, strategie: cfg.strategie, tageZurueck: AUTO_BACKTEST_TAGE, berechnetAm: jetzt.toISOString(), buyAndHoldProzent, ...k };
      await env.STOCKS_STATE.put(`backtest:${symbol}`, JSON.stringify(eintrag));
      ergebnisse.push(eintrag);

      // Strategie-Turnier: dieselben schon geladenen Kerzen genutzt, um ALLE
      // unterstützten Strategien gegeneinander zu testen (nicht nur die
      // aktuell konfigurierte) - rein informativ, wechselt NIE automatisch
      // die Live-Strategie (Pendant zum Krypto-Bot).
      const ranking = ALLE_STRATEGIEN.map((kandidat) => {
        if (kandidat === cfg.strategie) return { strategie: kandidat, ...k };
        const kandidatErgebnis = simuliere(closes, highs, lows, zeiten, { ...cfg, strategie: kandidat }, REFERENZ_STARTKAPITAL);
        return { strategie: kandidat, ...berechneKennzahlen(REFERENZ_STARTKAPITAL, kandidatErgebnis) };
      }).sort((a, b) => b.gesamtReturnProzent - a.gesamtReturnProzent);
      await env.STOCKS_STATE.put(`turnier:${symbol}`, JSON.stringify({
        symbol, aktuelleStrategie: cfg.strategie, tageZurueck: AUTO_BACKTEST_TAGE, berechnetAm: jetzt.toISOString(), ranking,
      }));
    } catch (err) {
      console.error(`[stocks-bot] Auto-Backtest ${symbol} fehlgeschlagen:`, err);
    }
  }

  if (ergebnisse.length) {
    const zeilen = ergebnisse.map((e) => `${e.symbol}: ${e.gesamtReturnProzent >= 0 ? '+' : ''}${e.gesamtReturnProzent.toFixed(1)}% (${e.anzahlTrades} Trades${e.winRateProzent != null ? `, Win-Rate ${e.winRateProzent.toFixed(0)}%` : ''})`);
    await notify(env, `🧪 Automatischer Backtest (letzte ${AUTO_BACKTEST_TAGE} Tage, echte Alpaca-Kerzen):\n${zeilen.join('\n')}`);
  }

  if (Object.keys(closesProSymbol).length >= 2) {
    try {
      const matrix = berechneKorrelationsMatrix(closesProSymbol);
      await env.STOCKS_STATE.put('korrelation:matrix', JSON.stringify({ matrix, berechnetAm: jetzt.toISOString(), tageZurueck: AUTO_BACKTEST_TAGE }));
    } catch (err) {
      console.error('[stocks-bot] Korrelationsmatrix fehlgeschlagen:', err);
    }
  }

  await env.STOCKS_STATE.put('backtest:letzteWoche', aktuelleWoche);
}
