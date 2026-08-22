// US-Aktien-Paper-Trading-Bot als Cloudflare Worker - zweites, unabhängiges
// Investment-Vehikel neben trading-bot-worker (Krypto). Nutzt Alpacas
// KOSTENLOSEN Paper-Trading-Broker (andere API-Domain als Alpacas Live-
// Handel, kann strukturell nie echtes Geld bewegen) statt einer echten
// Börse - komplett gefahrlos zum Ausprobieren, kein Investment nötig.
//
// Gleiche Grund-Sicherheitsmechanismen wie der Krypto-Bot: Stop-Loss pro
// Trade, Tagesverlust-Handelssperre, dauerhafter Gesamtverlust-Kill-Switch,
// Mindest-Ordergröße-Check, mehrere Symbole mit unabhängigem Kapital-Anteil,
// Flash-Crash-Schutz. Zusätzlich aktienspezifisch: läuft nur während
// regulärer NYSE-Handelszeiten (lib/alpaca.mjs istMarktOffen), Krypto
// handelt 24/7, Aktien nicht.
//
// Datei-Aufteilung (lib/): strategie.mjs = 1:1 aus trading-bot-worker
// übernommen (reine Indikator-/Entscheidungslogik, komplett Asset-
// unabhängig), alpaca.mjs = Broker-Adapter, state.mjs = KV-Persistenz,
// notify.mjs = WhatsApp/Telegram, statistik.mjs = Trade-Kennzahlen,
// status.mjs = /status und /export, config.mjs = STOCKS_*-Umgebungsvariablen.

import { berechneIndikatoren, entscheideKauf, entscheideVerkauf, berechneFlashCrashDropProzent } from './lib/strategie.mjs';
import { getKlines, getSpreadProzent, getMinNotionalUsdt, placeMarketBuy, placeMarketSell, istMarktOffen } from './lib/alpaca.mjs';
import { notify } from './lib/notify.mjs';
import { heute, MAX_TRADES_IM_STATE, loadState, saveState, zaehleOffenePositionen, sammleOffenePositionenSymbole, saveSystemInfo } from './lib/state.mjs';
import { buildStatus, buildTradesCsv } from './lib/status.mjs';
import { readConfig } from './lib/config.mjs';
import { ladeAnstehendeHighImpactEvents, istInEventFenster } from './lib/wirtschaftskalender.mjs';
import { ladeInsiderKaufSignal } from './lib/insiderbuys.mjs';
import { pruefeUndFuehreAdaptivesLernen } from './lib/learning.mjs';
import { hoehererZeitrahmenIstAufwaerts } from './lib/multitimeframe.mjs';
import { pruefeUndFuehreAutoBacktest } from './lib/autobacktest.mjs';
import { pruefeUndFuehreAiReview } from './lib/ai-review.mjs';
import { pruefeUndAktualisiereScanner } from './lib/scanner.mjs';
import { pruefeUndAktualisiereMonteCarlo } from './lib/montecarlo.mjs';
import { pruefeUndSendeSignalDigest } from './lib/signaldigest.mjs';
import { pruefeUndSpeichereScoreVerlauf } from './lib/scoreverlauf.mjs';

async function runSymbol(env, symbol, startKapital, cfg, offenePositionenVorLauf, newsEventAktiv, marktweiterCrashAktiv, korrelationsMatrix, offenePositionenSymbole) {
  let state = await loadState(env, symbol, startKapital);

  if (state.letzterTag !== heute()) {
    state.letzterTag = heute();
    state.heutigerVerlustUsdt = 0;
  }

  if (state.killSwitchAktiv) {
    if (!state.killSwitchBenachrichtigt) {
      await notify(env, `🛑 Stocks-Bot (${symbol}) GESTOPPT: Gesamtverlust-Grenze (${cfg.maxGesamtverlustProzent}%) erreicht. Kapital: ${state.kapital.toFixed(2)} USD (Start: ${state.startKapital.toFixed(2)} USD). Bleibt aus, bis der State für ${symbol} manuell zurückgesetzt wird.`);
      state.killSwitchBenachrichtigt = true;
      await saveState(env, symbol, state);
    }
    return;
  }

  // Insider-Kauf-Signal höchstens einmal pro Tag aktualisieren (siehe
  // lib/insiderbuys.mjs) - schont SECs Server, ein Tages-Cache reicht für
  // ein Signal, das ohnehin nur 1-2 Tage aktuell ist (SEC-Meldefrist).
  if (cfg.insiderBuyFilter && state.insiderSignalGeprueftAm !== heute()) {
    const signal = await ladeInsiderKaufSignal(env, symbol, cfg);
    if (signal !== null) {
      state.insiderSignal = signal;
      state.insiderSignalGeprueftAm = heute();
    }
  }

  const { closes, highs, lows } = await getKlines(env, symbol);
  const benoetigteKerzen = Math.max(cfg.emaLangsam, cfg.bollingerPeriode, cfg.donchianEntryPeriode) + 2;
  if (closes.length < benoetigteKerzen) return;

  const indikatoren = berechneIndikatoren(closes, highs, lows, cfg);
  const { preis } = indikatoren;
  const handelsSperreHeute = state.heutigerVerlustUsdt <= -(state.kapital * cfg.maxTagesverlustProzent) / 100;

  if (!state.position) {
    const positionenPlatzFrei = offenePositionenVorLauf < cfg.maxGleichzeitigePositionen;
    const kauf = entscheideKauf({
      kapital: state.kapital, cfg, indikatoren, positionenPlatzFrei, handelsSperreHeute, kuerzlicheTrades: state.trades,
      jetztZeitstempel: Date.now(), cooldownBisZeitstempel: state.cooldownBisZeitstempel || null,
    });

    // Marktweiter Crash-Schutz zuerst (härtester, globalster Filter) - siehe
    // Pendant im Krypto-Bot. Kein einzelnes WhatsApp pro Symbol, der Alarm
    // dazu kommt einmalig aus runAll.
    if (kauf && cfg.marktweiterCrashFilter && marktweiterCrashAktiv) {
      await saveState(env, symbol, state);
      return;
    }

    // Wirtschaftskalender: rund um FOMC/CPI/NFP wird nicht neu eingestiegen -
    // gerade für Aktien besonders relevant. Kein einzelnes WhatsApp pro
    // Symbol, der Alarm dazu kommt einmalig aus runAll.
    if (kauf && cfg.newsEventFilter && newsEventAktiv) {
      await saveState(env, symbol, state);
      return;
    }

    // Multi-Timeframe: nicht gegen den übergeordneten (Default 4h-)Trend
    // kaufen, auch wenn der Trading-Timeframe (15m) gerade ein Signal zeigt.
    // Siehe Pendant im Krypto-Bot.
    if (kauf && cfg.mtfFilter) {
      const aufwaerts = await hoehererZeitrahmenIstAufwaerts(env, symbol, cfg);
      if (!aufwaerts) {
        await notify(env, `⚠️ Stocks-Bot (${symbol}): Kaufsignal übersprungen - ${cfg.mtfIntervalMinuten / 60}h-Trend zeigt abwärts (EMA${cfg.emaSchnell} < EMA${cfg.emaLangsam}).`);
        await saveState(env, symbol, state);
        return;
      }
    }

    if (kauf && cfg.spreadFilter) {
      const spreadProzent = await getSpreadProzent(env, symbol);
      if (spreadProzent !== null && spreadProzent > cfg.spreadMaxProzent) {
        await notify(env, `⚠️ Stocks-Bot (${symbol}): Kaufsignal übersprungen - Bid/Ask-Spread bei ${spreadProzent.toFixed(2)}% (Schwelle ${cfg.spreadMaxProzent}%), Liquidität wirkt gerade gestört.`);
        await saveState(env, symbol, state);
        return;
      }
    }

    // Konzentrationsrisiko: nicht in ein Symbol einsteigen, das stark mit
    // einer bereits offenen Position korreliert ist (z.B. mehrere Big-Tech-
    // Aktien, die real zusammen fallen) - nutzt die wöchentlich vom
    // Auto-Backtest mitberechnete Matrix, kein zusätzlicher API-Aufruf.
    if (kauf && cfg.korrelationFilter && korrelationsMatrix && offenePositionenSymbole && offenePositionenSymbole.length) {
      const zeile = korrelationsMatrix[symbol];
      const korrelierteOffene = zeile
        ? offenePositionenSymbole.filter((s) => s !== symbol && zeile[s] != null && zeile[s] >= cfg.korrelationMaxWert)
        : [];
      if (korrelierteOffene.length) {
        await notify(env, `⚠️ Stocks-Bot (${symbol}): Kaufsignal übersprungen - Korrelation ≥${cfg.korrelationMaxWert} zu bereits offener Position (${korrelierteOffene.join(', ')}), Konzentrationsrisiko vermeiden.`);
        await saveState(env, symbol, state);
        return;
      }
    }

    if (kauf) {
      // Einziger NICHT-blockierender Filter: echte Insider-Käufe (SEC Form 4)
      // erhöhen die Positionsgröße leicht statt einen Kauf zu verhindern -
      // gedeckelt aufs vorhandene Kapital, kann also nie mehr investieren als
      // tatsächlich da ist.
      const insiderBoostAktiv = cfg.insiderBuyFilter && state.insiderSignal && state.insiderSignal.aktiv;
      const investBetrag = insiderBoostAktiv
        ? Math.min(kauf.investBetrag * cfg.insiderBoostFaktor, state.kapital)
        : kauf.investBetrag;

      const minNotional = await getMinNotionalUsdt();
      if (investBetrag < minNotional) {
        await notify(env, `⚠️ Stocks-Bot (${symbol}): Kaufsignal übersprungen - ${investBetrag.toFixed(2)} USD liegt unter der Mindest-Ordergröße (${minNotional.toFixed(2)} USD).`);
        await saveState(env, symbol, state);
        return;
      }

      const order = await placeMarketBuy(env, symbol, investBetrag);
      state.position = {
        qty: order.qty, entryPreis: order.preis, hoechsterPreisSeitEinstieg: order.preis, einstiegAm: new Date().toISOString(),
        entryAtr: indikatoren.atrJetzt, teilverkaufGemacht: false,
        // Beim Einstieg eingefroren (wie entryAtr) - siehe lib/learning.mjs.
        // Nur relevant, wenn STOCKS_ADAPTIVES_LERNEN aktiv ist UND für dieses
        // Symbol schon ein gelernter Wert vorliegt, sonst der globale Standard.
        stopLossProzentBenutzt: (cfg.adaptivesLernen && state.gelernterStopLossProzent) ? state.gelernterStopLossProzent : cfg.stopLossProzent,
      };
      await notify(env, `📈 [PAPER] Stocks-Bot: Einstieg ${symbol} @ ${order.preis.toFixed(2)} (${investBetrag.toFixed(2)} USD eingesetzt${insiderBoostAktiv ? `, 🕵️ Insider-Kauf-Boost aktiv (${state.insiderSignal.wertUsd.toLocaleString('de-DE', { maximumFractionDigits: 0 })} USD gemeldete Insider-Käufe)` : ''}).`);
    }
  } else {
    const verkauf = entscheideVerkauf({ position: state.position, cfg, indikatoren });
    state.position.hoechsterPreisSeitEinstieg = verkauf.hoechsterPreisSeitEinstieg;

    if (verkauf.verkaufen) {
      const order = await placeMarketSell(env, symbol, state.position.qty);
      const einsatz = state.position.qty * state.position.entryPreis;
      const gewinnVerlust = order.erloes - einsatz;
      const gewinnProzent = (gewinnVerlust / einsatz) * 100;
      state.kapital += gewinnVerlust;
      state.heutigerVerlustUsdt += Math.min(0, gewinnVerlust);

      state.trades.push({
        entryPreis: state.position.entryPreis,
        exitPreis: preis,
        gewinnVerlustUsdt: gewinnVerlust,
        gewinnProzent,
        grund: verkauf.grund,
        einstiegAm: state.position.einstiegAm,
        ausstiegAm: new Date().toISOString(),
      });
      if (state.trades.length > MAX_TRADES_IM_STATE) state.trades = state.trades.slice(-MAX_TRADES_IM_STATE);

      await notify(env, `📉 [PAPER] Stocks-Bot: Ausstieg ${symbol} @ ${preis.toFixed(2)} (${verkauf.grund}). ${gewinnVerlust >= 0 ? 'Gewinn' : 'Verlust'}: ${gewinnVerlust.toFixed(2)} USD. Kapital jetzt: ${state.kapital.toFixed(2)} USD.`);
      state.position = null;

      if (cfg.cooldownMinuten > 0 && gewinnVerlust < 0) {
        state.cooldownBisZeitstempel = Date.now() + cfg.cooldownMinuten * 60000;
      }

      const gesamtVerlustProzent = ((state.kapital - state.startKapital) / state.startKapital) * 100;
      if (gesamtVerlustProzent <= -cfg.maxGesamtverlustProzent) state.killSwitchAktiv = true;
    }
  }

  await saveState(env, symbol, state);
}

async function runAll(env) {
  const cfg = readConfig(env);

  // Aktien handeln nur während regulärer Börsenzeiten - außerhalb würde
  // Alpaca Market-Orders ohnehin ablehnen/verzögern. Lauf wird sauber
  // übersprungen, kein Fehler.
  const marktOffen = await istMarktOffen(env);
  if (!marktOffen) {
    await saveSystemInfo(env, { letzterLauf: new Date().toISOString(), marktOffen });
    return;
  }

  // Wirtschaftskalender: EIN Abruf pro Lauf (Rate-Limit der Quelle beachten,
  // siehe lib/wirtschaftskalender.mjs) - pausiert Käufe rund um High-Impact-
  // USD-Termine (FOMC/CPI/NFP) für ALLE Aktien gemeinsam.
  let newsEventAktiv = false;
  let naechstesEvent = null;
  if (cfg.newsEventFilter) {
    const events = await ladeAnstehendeHighImpactEvents(['USD']);
    newsEventAktiv = istInEventFenster(events, cfg.newsEventFensterMinuten);
    if (newsEventAktiv) naechstesEvent = events.find((e) => Math.abs(new Date(e.date).getTime() - Date.now()) <= cfg.newsEventFensterMinuten * 60000);
  }
  if (newsEventAktiv && naechstesEvent) {
    await notify(env, `🛑 Stocks-Bot: High-Impact-USD-Termin "${naechstesEvent.title}" (${new Date(naechstesEvent.date).toLocaleString('de-DE')}) im ${cfg.newsEventFensterMinuten}-Minuten-Fenster - Käufe für ALLE Aktien in diesem Lauf pausiert.`);
  }

  // Marktweiter Crash-Schutz: EIN zusätzlicher Klines-Abruf pro Lauf (SPY als
  // Marktindikator, nicht Teil der gehandelten Symbole) - siehe Pendant im
  // Krypto-Bot (dort BTC). Schlägt der Abruf fehl, bleibt der Filter einfach
  // unwirksam (nicht blockierend).
  let marktweiterCrashAktiv = false;
  let marktweiterCrashDropProzent = null;
  if (cfg.marktweiterCrashFilter) {
    try {
      const { closes: spyCloses, highs: spyHighs } = await getKlines(env, cfg.marktweiterCrashSymbol);
      marktweiterCrashDropProzent = berechneFlashCrashDropProzent(spyCloses, spyHighs, cfg.marktweiterCrashFensterKerzen);
      marktweiterCrashAktiv = marktweiterCrashDropProzent <= -cfg.marktweiterCrashMaxDropProzent;
    } catch (err) {
      console.error('[stocks-bot] Marktweiter-Crash-Check fehlgeschlagen:', err);
    }
  }
  if (marktweiterCrashAktiv) {
    await notify(env, `🛑 Stocks-Bot: Marktweiter Crash erkannt (${cfg.marktweiterCrashSymbol} ${marktweiterCrashDropProzent.toFixed(1)}% in ${cfg.marktweiterCrashFensterKerzen} Kerzen) - Käufe für ALLE Aktien in diesem Lauf pausiert.`);
  }

  await saveSystemInfo(env, {
    letzterLauf: new Date().toISOString(), marktOffen,
    ...(cfg.newsEventFilter ? { newsEventAktiv, newsEventZeit: new Date().toISOString() } : {}),
    ...(cfg.marktweiterCrashFilter ? { marktweiterCrashAktiv, marktweiterCrashZeit: new Date().toISOString() } : {}),
  });

  let offenePositionen = await zaehleOffenePositionen(env, cfg.symbols, cfg.startKapitalProSymbol);

  // Für den Korrelations-Filter EINMAL pro Lauf geladen (nicht pro Symbol) -
  // die Matrix ändert sich nur wöchentlich.
  let korrelationsMatrix = null;
  if (cfg.korrelationFilter) {
    try {
      const raw = await env.STOCKS_STATE.get('korrelation:matrix');
      if (raw) korrelationsMatrix = JSON.parse(raw).matrix;
    } catch (err) {
      console.error('[stocks-bot] Korrelationsmatrix konnte nicht geladen werden:', err);
    }
  }
  const offenePositionenSymbole = cfg.korrelationFilter
    ? await sammleOffenePositionenSymbole(env, cfg.symbols, cfg.startKapitalProSymbol)
    : [];

  for (const symbol of cfg.symbols) {
    try {
      const hatteVorherPosition = (await loadState(env, symbol, cfg.startKapitalProSymbol)).position !== null;
      await runSymbol(env, symbol, cfg.startKapitalProSymbol, cfg, offenePositionen, newsEventAktiv, marktweiterCrashAktiv, korrelationsMatrix, offenePositionenSymbole);
      const hatJetztPosition = (await loadState(env, symbol, cfg.startKapitalProSymbol)).position !== null;
      if (!hatteVorherPosition && hatJetztPosition) { offenePositionen++; offenePositionenSymbole.push(symbol); }
      if (hatteVorherPosition && !hatJetztPosition) { offenePositionen--; offenePositionenSymbole.splice(offenePositionenSymbole.indexOf(symbol), 1); }
    } catch (err) {
      console.error(`[stocks-bot] Fehler bei ${symbol}:`, err);
      await notify(env, `🛑 Stocks-Bot (${symbol}): Lauf mit Fehler abgebrochen - ${err.message || err}. Eine Order wurde dadurch möglicherweise NICHT ausgeführt, bitte Konto manuell prüfen.`);
    }
  }

  try {
    await pruefeUndFuehreAdaptivesLernen(env, cfg);
  } catch (err) {
    console.error('[stocks-bot] Fehler beim adaptiven Lernen:', err);
  }
  try {
    await pruefeUndFuehreAutoBacktest(env, cfg);
  } catch (err) {
    console.error('[stocks-bot] Fehler beim automatischen Backtest:', err);
  }
  try {
    await pruefeUndFuehreAiReview(env, cfg);
  } catch (err) {
    console.error('[stocks-bot] Fehler beim AI Trade Review:', err);
  }
  try {
    await pruefeUndAktualisiereScanner(env, cfg);
  } catch (err) {
    console.error('[stocks-bot] Fehler beim Live Market Scanner:', err);
  }
  try {
    await pruefeUndAktualisiereMonteCarlo(env, cfg);
  } catch (err) {
    console.error('[stocks-bot] Fehler bei der Monte-Carlo-Simulation:', err);
  }
  try {
    await pruefeUndSendeSignalDigest(env, cfg);
  } catch (err) {
    console.error('[stocks-bot] Fehler beim Signal-Digest:', err);
  }
  try {
    await pruefeUndSpeichereScoreVerlauf(env, cfg);
  } catch (err) {
    console.error('[stocks-bot] Fehler beim Score-Verlauf:', err);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAll(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/status' && request.method === 'GET') {
      if (!env.STATUS_READ_KEY || url.searchParams.get('key') !== env.STATUS_READ_KEY) {
        return new Response('Forbidden', { status: 403 });
      }
      const status = await buildStatus(env);
      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (url.pathname === '/export' && request.method === 'GET') {
      if (!env.STATUS_READ_KEY || url.searchParams.get('key') !== env.STATUS_READ_KEY) {
        return new Response('Forbidden', { status: 403 });
      }
      const csv = await buildTradesCsv(env);
      return new Response(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="stocks-bot-trades.csv"',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Setzt NUR den Kill-Switch EINES Symbols zurück (killSwitchAktiv/
    // killSwitchBenachrichtigt) - Kapital, Trade-Historie und das
    // Insider-Buy-Signal bleiben unangetastet. Bewusst EXPLIZIT und einzeln
    // pro Symbol statt automatisch nach X Tagen: der Gesamtverlust-Kill-
    // Switch ist die letzte Sicherheitslinie - ein automatischer Reset
    // würde eine verlustreiche Konfiguration ohne menschliche Prüfung
    // wieder scharf schalten. Gleiches TRIGGER_SECRET wie der manuelle
    // Lauf-Auslöser (kein neues Secret nötig).
    if (url.pathname === '/reset-kill-switch' && request.method === 'GET') {
      if (!env.TRIGGER_SECRET || url.searchParams.get('key') !== env.TRIGGER_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
      const symbol = url.searchParams.get('symbol');
      const cfg = readConfig(env);
      if (!symbol || !cfg.symbols.includes(symbol)) {
        return new Response(`Unbekanntes oder fehlendes ?symbol= - gültig: ${cfg.symbols.join(', ')}`, { status: 400 });
      }
      const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
      if (!state.killSwitchAktiv) {
        return new Response(`${symbol}: Kill-Switch war nicht aktiv, nichts geändert.`, { status: 200 });
      }
      state.killSwitchAktiv = false;
      state.killSwitchBenachrichtigt = false;
      await saveState(env, symbol, state);
      await notify(env, `✅ Aktien-Bot (${symbol}): Kill-Switch manuell zurückgesetzt. Kapital: ${state.kapital.toFixed(2)} USD. Handelt ${symbol} ab dem nächsten Lauf wieder.`);
      return new Response(`${symbol}: Kill-Switch zurückgesetzt.`, { status: 200 });
    }

    if (url.searchParams.get('key') !== env.TRIGGER_SECRET || !env.TRIGGER_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
    await runAll(env);
    return new Response('OK - Lauf ausgeführt, siehe WhatsApp/Telegram/Logs.', { status: 200 });
  },
};
