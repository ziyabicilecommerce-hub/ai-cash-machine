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

import { berechneIndikatoren, entscheideKauf, entscheideVerkauf } from './lib/strategie.mjs';
import { getKlines, getSpreadProzent, getMinNotionalUsdt, placeMarketBuy, placeMarketSell, istMarktOffen } from './lib/alpaca.mjs';
import { notify } from './lib/notify.mjs';
import { heute, MAX_TRADES_IM_STATE, loadState, saveState, zaehleOffenePositionen, saveSystemInfo } from './lib/state.mjs';
import { buildStatus, buildTradesCsv } from './lib/status.mjs';
import { readConfig } from './lib/config.mjs';

async function runSymbol(env, symbol, startKapital, cfg, offenePositionenVorLauf) {
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

    if (kauf && cfg.spreadFilter) {
      const spreadProzent = await getSpreadProzent(env, symbol);
      if (spreadProzent !== null && spreadProzent > cfg.spreadMaxProzent) {
        await notify(env, `⚠️ Stocks-Bot (${symbol}): Kaufsignal übersprungen - Bid/Ask-Spread bei ${spreadProzent.toFixed(2)}% (Schwelle ${cfg.spreadMaxProzent}%), Liquidität wirkt gerade gestört.`);
        await saveState(env, symbol, state);
        return;
      }
    }

    if (kauf) {
      const { investBetrag } = kauf;
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
      };
      await notify(env, `📈 [PAPER] Stocks-Bot: Einstieg ${symbol} @ ${order.preis.toFixed(2)} (${investBetrag.toFixed(2)} USD eingesetzt).`);
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
  await saveSystemInfo(env, { letzterLauf: new Date().toISOString(), marktOffen });
  if (!marktOffen) return;

  let offenePositionen = await zaehleOffenePositionen(env, cfg.symbols, cfg.startKapitalProSymbol);
  for (const symbol of cfg.symbols) {
    try {
      const hatteVorherPosition = (await loadState(env, symbol, cfg.startKapitalProSymbol)).position !== null;
      await runSymbol(env, symbol, cfg.startKapitalProSymbol, cfg, offenePositionen);
      const hatJetztPosition = (await loadState(env, symbol, cfg.startKapitalProSymbol)).position !== null;
      if (!hatteVorherPosition && hatJetztPosition) offenePositionen++;
      if (hatteVorherPosition && !hatJetztPosition) offenePositionen--;
    } catch (err) {
      console.error(`[stocks-bot] Fehler bei ${symbol}:`, err);
      await notify(env, `🛑 Stocks-Bot (${symbol}): Lauf mit Fehler abgebrochen - ${err.message || err}. Eine Order wurde dadurch möglicherweise NICHT ausgeführt, bitte Konto manuell prüfen.`);
    }
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

    if (url.searchParams.get('key') !== env.TRIGGER_SECRET || !env.TRIGGER_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
    await runAll(env);
    return new Response('OK - Lauf ausgeführt, siehe WhatsApp/Telegram/Logs.', { status: 200 });
  },
};
