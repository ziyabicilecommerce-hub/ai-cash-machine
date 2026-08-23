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
const WALK_FORWARD_FOLDS = 3;

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
        position = { qty, entryPreis: kaufPreisEffektiv, hoechsterPreisSeitEinstieg: preis, einstiegAm: zeiten[i], entryAtr: indikatoren.atrJetzt };
      }
    } else {
      const verkauf = entscheideVerkauf({ position, cfg, indikatoren });
      position.hoechsterPreisSeitEinstieg = verkauf.hoechsterPreisSeitEinstieg;
      if (verkauf.verkaufen) {
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
      const walkForward = walkForwardAnalyse(zeiten, ergebnis.trades, REFERENZ_STARTKAPITAL);
      const eintrag = {
        symbol, strategie: cfg.strategie, tageZurueck: AUTO_BACKTEST_TAGE, berechnetAm: jetzt.toISOString(), buyAndHoldProzent,
        slippageProzent: cfg.backtestSlippageProzent, gebuehrProzent: cfg.backtestGebuehrProzent, walkForward, ...k,
      };
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
