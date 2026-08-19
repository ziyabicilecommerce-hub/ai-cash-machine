// Krypto-Spot-Trading-Bot als Cloudflare Worker (statt GitHub Actions).
//
// Warum ein eigener Worker? GitHub-Actions-Runner laufen aus IP-Bereichen,
// die Binance aus regulatorischen Gründen mit HTTP 451 blockiert - der Bot
// (automations/49-trading-bot.mjs) konnte deshalb NIE eine einzige Order
// abfragen, obwohl der Workflow selbst korrekt lief. Cloudflare Workers
// laufen am globalen Edge-Netzwerk und sind davon i.d.R. nicht betroffen.
//
// Gleiche Grund-Sicherheitsmechanismen wie vorher, unverändert: Paper-Modus
// per Default, Spot-only (kein Hebel), Stop-Loss pro Trade, Tagesverlust-
// Handelssperre, dauerhafter Gesamtverlust-Kill-Switch, Mindest-Ordergröße-
// Check vor jedem Kauf, mehrere Symbole mit unabhängigem Kapital-Anteil.
//
// Datei-Aufteilung (lib/): strategie.mjs = reine Entscheidungslogik (läuft
// identisch im Backtest), exchanges.mjs = Binance/Kraken-Adapter,
// marktdaten.mjs = externe Gratis-Datenquellen (CoinGecko/CoinPaprika/OKX/
// Gate.io/Bitstamp/Fear&Greed/BTC-Dominanz/Multi-Timeframe), notify.mjs =
// WhatsApp, state.mjs = KV-Persistenz, reports.mjs = Tages-/Wochen-/Monats-
// Rückblick + Kapital-Rebalancing, statistik.mjs = Trade-Kennzahlen +
// Readiness-Ampel. Diese Datei (worker.js) bleibt der Orchestrator:
// Konfiguration einlesen, pro Symbol handeln, HTTP-/Cron-Einstiegspunkte.
//
// Alle neuen Risiko-Features sind standardmäßig AUS bzw. verhaltensneutral,
// damit ein bereits laufender Bot durch ein Update nicht plötzlich anders
// handelt, ohne dass das bewusst konfiguriert wurde.

import { berechneIndikatoren, entscheideKauf, entscheideVerkauf } from './lib/strategie.mjs';
import { EXCHANGES } from './lib/exchanges.mjs';
import { COINGECKO_IDS, ladePreisBestaetigung24h, ladeFearGreedIndex, ladeBtcDominanzProzent, hoehererZeitrahmenIstAufwaerts } from './lib/marktdaten.mjs';
import { notifyWhatsapp } from './lib/notify.mjs';
import { heute, MAX_TRADES_IM_STATE, loadState, saveState, zaehleOffenePositionen } from './lib/state.mjs';
import { pruefeUndSendeTagesZusammenfassung, pruefeUndSendeWochenZusammenfassung, pruefeUndSendeMonatsZusammenfassung, pruefeUndFuehreKapitalRebalancing } from './lib/reports.mjs';
import { berechneTradeStats, berechneReadiness } from './lib/statistik.mjs';

// ================= HANDELSLOGIK =================

async function runSymbol(env, symbol, startKapital, cfg, offenePositionenVorLauf, fearGreedWert, btcDominanzProzent) {
  const exchange = EXCHANGES[cfg.exchange];
  let state = await loadState(env, symbol, startKapital);

  if (state.letzterTag !== heute()) {
    state.letzterTag = heute();
    state.heutigerVerlustUsdt = 0;
  }

  if (state.killSwitchAktiv) {
    if (!state.killSwitchBenachrichtigt) {
      await notifyWhatsapp(env, `🛑 Trading-Bot (${symbol}) GESTOPPT: Gesamtverlust-Grenze (${cfg.maxGesamtverlustProzent}%) erreicht. Kapital: ${state.kapital.toFixed(2)} USDT (Start: ${state.startKapital.toFixed(2)} USDT). Bleibt aus, bis der State für ${symbol} manuell zurückgesetzt wird.`);
      state.killSwitchBenachrichtigt = true;
      await saveState(env, symbol, state);
    }
    return;
  }

  const { closes, highs, lows } = await exchange.getKlines(symbol);
  // Genug Vorlauf für die Indikatoren ALLER Strategien prüfen, nicht nur
  // EMA - sonst würde z.B. donchianEntryPeriode=50 stillschweigend mit zu
  // wenig Historie rechnen, statt einfach diesen Lauf zu überspringen.
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

    if (kauf && cfg.mtfFilter) {
      const aufwaerts = await hoehererZeitrahmenIstAufwaerts(exchange, symbol, cfg);
      if (!aufwaerts) {
        await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - ${cfg.mtfIntervalMinuten / 60}h-Trend zeigt abwärts (EMA9 < EMA21).`);
        await saveState(env, symbol, state);
        return;
      }
    }

    if (kauf && cfg.fngFilter && fearGreedWert !== null && fearGreedWert >= cfg.fngMaxWert) {
      await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - Fear & Greed Index bei ${fearGreedWert} (Extreme Greed ab ${cfg.fngMaxWert}), Markt wirkt überhitzt.`);
      await saveState(env, symbol, state);
      return;
    }

    // Nur Altcoins betroffen (BTC selbst profitiert typischerweise gerade
    // VON steigender Dominanz, wird also nicht geblockt).
    const istBtc = COINGECKO_IDS[symbol] === 'bitcoin';
    if (kauf && cfg.btcDominanzFilter && !istBtc && btcDominanzProzent !== null && btcDominanzProzent >= cfg.btcDominanzMaxProzent) {
      await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - BTC-Dominanz bei ${btcDominanzProzent.toFixed(1)}% (Schwelle ${cfg.btcDominanzMaxProzent}%), Kapital fließt gerade bevorzugt in Bitcoin statt Altcoins.`);
      await saveState(env, symbol, state);
      return;
    }

    if (kauf && cfg.coingeckoFilter) {
      const change24hProzent = await ladePreisBestaetigung24h(symbol);
      // null = kein Mapping für dieses Symbol oder ALLE Quellen (CoinGecko,
      // CoinPaprika, OKX, Gate.io, Bitstamp) nicht erreichbar - Filter dann
      // NICHT blockierend, sonst würde ein Datenausfall den Bot lahmlegen,
      // obwohl die eigentliche Strategie ein gültiges Signal hat.
      if (change24hProzent !== null && change24hProzent < cfg.coingeckoMin24hProzent) {
        await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - 24h-Änderung (Ø aus bis zu 5 Börsen) ${change24hProzent.toFixed(2)}% liegt unter dem Filter-Minimum (${cfg.coingeckoMin24hProzent}%).`);
        await saveState(env, symbol, state);
        return;
      }
    }

    if (kauf && cfg.spreadFilter) {
      const spreadProzent = await exchange.getSpreadProzent(symbol);
      if (spreadProzent !== null && spreadProzent > cfg.spreadMaxProzent) {
        await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - Bid/Ask-Spread bei ${spreadProzent.toFixed(2)}% (Schwelle ${cfg.spreadMaxProzent}%), Liquidität wirkt gerade gestört.`);
        await saveState(env, symbol, state);
        return;
      }
    }

    if (kauf) {
      const { investBetrag } = kauf;
      const minNotional = await exchange.getMinNotionalUsdt(symbol, preis);
      if (minNotional !== null && investBetrag < minNotional) {
        await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - ${investBetrag.toFixed(2)} USDT liegt unter der Mindest-Ordergröße (${minNotional.toFixed(2)} USDT).`);
        await saveState(env, symbol, state);
        return;
      }

      let qty, tatsaechlicherPreis;
      if (cfg.paperModus) {
        qty = investBetrag / preis;
        tatsaechlicherPreis = preis;
      } else {
        const order = await exchange.placeMarketBuy(env, symbol, investBetrag, preis);
        qty = order.qty;
        tatsaechlicherPreis = order.preis;
      }
      state.position = {
        qty, entryPreis: tatsaechlicherPreis, hoechsterPreisSeitEinstieg: tatsaechlicherPreis, einstiegAm: new Date().toISOString(),
        entryAtr: indikatoren.atrJetzt, teilverkaufGemacht: false,
      };
      await notifyWhatsapp(env, `📈 ${cfg.paperModus ? '[PAPER] ' : ''}Trading-Bot: Einstieg ${symbol} @ ${tatsaechlicherPreis.toFixed(2)} (${investBetrag.toFixed(2)} USDT eingesetzt${cfg.volaSizing ? `, Vola-Sizing aktiv` : ''}).`);
    }
  } else {
    const verkauf = entscheideVerkauf({ position: state.position, cfg, indikatoren });
    state.position.hoechsterPreisSeitEinstieg = verkauf.hoechsterPreisSeitEinstieg;

    if (verkauf.teilverkauf) {
      // Nur einen Anteil der Position verkaufen, Rest bleibt mit gleichem
      // Einstiegspreis offen - siehe cfg.partialTakeProfitProzent.
      const teilQty = state.position.qty * verkauf.teilAnteil;
      let erloes;
      if (cfg.paperModus) {
        erloes = teilQty * preis;
      } else {
        const order = await exchange.placeMarketSell(env, symbol, teilQty);
        erloes = order.erloes;
      }
      const einsatz = teilQty * state.position.entryPreis;
      const gewinnVerlust = erloes - einsatz;
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

      state.position.qty -= teilQty;
      state.position.teilverkaufGemacht = true;
      await notifyWhatsapp(env, `📊 ${cfg.paperModus ? '[PAPER] ' : ''}Trading-Bot: Teil-Gewinnmitnahme ${symbol} @ ${preis.toFixed(2)} (${(verkauf.teilAnteil * 100).toFixed(0)}% der Position, ${gewinnVerlust.toFixed(2)} USDT Gewinn). Rest der Position läuft weiter, Stop-Loss/Trailing-Stop gelten unverändert.`);
    } else if (verkauf.verkaufen) {
      let erloes;
      if (cfg.paperModus) {
        erloes = state.position.qty * preis;
      } else {
        const order = await exchange.placeMarketSell(env, symbol, state.position.qty);
        erloes = order.erloes;
      }
      const einsatz = state.position.qty * state.position.entryPreis;
      const gewinnVerlust = erloes - einsatz;
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

      await notifyWhatsapp(env, `📉 ${cfg.paperModus ? '[PAPER] ' : ''}Trading-Bot: Ausstieg ${symbol} @ ${preis.toFixed(2)} (${verkauf.grund}). ${gewinnVerlust >= 0 ? 'Gewinn' : 'Verlust'}: ${gewinnVerlust.toFixed(2)} USDT. Kapital jetzt: ${state.kapital.toFixed(2)} USDT.`);
      state.position = null;

      // Nach einem Verlust-Trade eine Weile pausieren (Default 0 = aus) -
      // siehe cfg.cooldownMinuten in entscheideKauf.
      if (cfg.cooldownMinuten > 0 && gewinnVerlust < 0) {
        state.cooldownBisZeitstempel = Date.now() + cfg.cooldownMinuten * 60000;
      }

      const gesamtVerlustProzent = ((state.kapital - state.startKapital) / state.startKapital) * 100;
      if (gesamtVerlustProzent <= -cfg.maxGesamtverlustProzent) state.killSwitchAktiv = true;
    }
  }

  await saveState(env, symbol, state);
}

// Erlaubt jedem Symbol eine ANDERE Strategie als den globalen Default -
// z.B. um live zu vergleichen, welche Strategie auf welchem Coin am besten
// abschneidet, statt alle Coins zwangsläufig identisch zu handeln. Format:
// "XBTUSDT:bollinger-mean-reversion,ETHUSDT:donchian-breakout". Symbole ohne
// Eintrag fallen auf TRADING_STRATEGIE (den globalen Default) zurück.
function parseStrategieProSymbol(env, gueltigeStrategien) {
  const roh = (env.TRADING_STRATEGIE_PRO_SYMBOL || '').trim();
  const map = {};
  if (!roh) return map;
  for (const eintrag of roh.split(',')) {
    const [symbol, strategie] = eintrag.split(':').map((s) => s.trim());
    if (!symbol || !strategie) continue;
    if (!gueltigeStrategien.includes(strategie)) {
      throw new Error(`Unbekannte Strategie "${strategie}" in TRADING_STRATEGIE_PRO_SYMBOL für ${symbol} - unterstützt: ${gueltigeStrategien.join(', ')}`);
    }
    map[symbol] = strategie;
  }
  return map;
}

function readConfig(env) {
  const symbols = (env.TRADING_SYMBOLS || 'BTCUSDT').split(',').map((s) => s.trim()).filter(Boolean);
  const gesamtKapital = parseFloat(env.TRADING_KAPITAL_USDT || '100');
  const exchange = (env.TRADING_EXCHANGE || 'binance').trim().toLowerCase();
  if (!EXCHANGES[exchange]) throw new Error(`Unbekannte TRADING_EXCHANGE "${exchange}" - unterstützt: ${Object.keys(EXCHANGES).join(', ')}`);
  const strategie = (env.TRADING_STRATEGIE || 'ema-crossover').trim();
  const GUELTIGE_STRATEGIEN = ['ema-crossover', 'bollinger-mean-reversion', 'donchian-breakout'];
  if (!GUELTIGE_STRATEGIEN.includes(strategie)) {
    throw new Error(`Unbekannte TRADING_STRATEGIE "${strategie}" - unterstützt: ${GUELTIGE_STRATEGIEN.join(', ')}`);
  }
  const strategieProSymbol = parseStrategieProSymbol(env, GUELTIGE_STRATEGIEN);
  return {
    exchange,
    symbols,
    startKapitalProSymbol: gesamtKapital / symbols.length,
    paperModus: (env.TRADING_PAPER_MODE || 'ja') !== 'nein',
    // Default 'ema-crossover' = unverändertes Verhalten ggü. vorherigen Versionen.
    strategie,
    // Pro Symbol individuell überschreibbar, siehe parseStrategieProSymbol.
    strategieProSymbol,
    bollingerPeriode: parseInt(env.TRADING_BOLLINGER_PERIODE || '20', 10),
    bollingerStdDev: parseFloat(env.TRADING_BOLLINGER_STDDEV || '2'),
    donchianEntryPeriode: parseInt(env.TRADING_DONCHIAN_ENTRY_PERIODE || '20', 10),
    donchianExitPeriode: parseInt(env.TRADING_DONCHIAN_EXIT_PERIODE || '10', 10),
    maxPositionProzent: parseFloat(env.TRADING_MAX_POSITION_PROZENT || '25'),
    maxTagesverlustProzent: parseFloat(env.TRADING_MAX_TAGESVERLUST_PROZENT || '5'),
    maxGesamtverlustProzent: parseFloat(env.TRADING_MAX_GESAMTVERLUST_PROZENT || '20'),
    stopLossProzent: parseFloat(env.TRADING_STOP_LOSS_PROZENT || '3'),
    // Default 0 = aus, damit ein bestehendes Setup nicht ungefragt anders handelt.
    takeProfitProzent: parseFloat(env.TRADING_TAKE_PROFIT_PROZENT || '0'),
    emaSchnell: parseInt(env.TRADING_EMA_SCHNELL || '9', 10),
    emaLangsam: parseInt(env.TRADING_EMA_LANGSAM || '21', 10),
    rsiPeriode: parseInt(env.TRADING_RSI_PERIODE || '14', 10),
    // 0 = Filter deaktiviert (Default), damit ein bestehendes Setup nicht
    // durch dieses Update ungefragt anders handelt.
    rsiUeberkauft: parseFloat(env.TRADING_RSI_UEBERKAUFT || '0'),
    minVolatilitaetProzent: parseFloat(env.TRADING_MIN_VOLATILITAET_PROZENT || '0'),
    trailingStopAbProzent: parseFloat(env.TRADING_TRAILING_STOP_AB_PROZENT || '0'),
    volaSizing: (env.TRADING_VOLA_SIZING || 'nein') === 'ja',
    volaSizingReferenzProzent: parseFloat(env.TRADING_VOLA_SIZING_REFERENZ_PROZENT || '2'),
    volaSizingMinFaktor: parseFloat(env.TRADING_VOLA_SIZING_MIN_FAKTOR || '0.25'),
    maxGleichzeitigePositionen: env.TRADING_MAX_GLEICHZEITIGE_POSITIONEN
      ? parseInt(env.TRADING_MAX_GLEICHZEITIGE_POSITIONEN, 10)
      : symbols.length,
    // Default AUS, damit ein bereits laufendes Setup nicht ungefragt anders handelt.
    coingeckoFilter: (env.TRADING_COINGECKO_FILTER || 'nein') === 'ja',
    coingeckoMin24hProzent: parseFloat(env.TRADING_COINGECKO_MIN_24H_PROZENT || '0'),
    fngFilter: (env.TRADING_FNG_FILTER || 'nein') === 'ja',
    fngMaxWert: parseFloat(env.TRADING_FNG_MAX_WERT || '80'),
    mtfFilter: (env.TRADING_MTF_FILTER || 'nein') === 'ja',
    mtfIntervalMinuten: parseInt(env.TRADING_MTF_INTERVAL_MINUTEN || '240', 10),
    btcDominanzFilter: (env.TRADING_BTC_DOMINANZ_FILTER || 'nein') === 'ja',
    btcDominanzMaxProzent: parseFloat(env.TRADING_BTC_DOMINANZ_MAX_PROZENT || '60'),
    // Default AUS, damit ein bereits laufendes Setup nicht ungefragt anders
    // handelt. Skaliert die Positionsgröße NUR nach unten (nie über den
    // konfigurierten maxPositionProzent hinaus) - siehe strategie.mjs.
    performanceSizing: (env.TRADING_PERFORMANCE_SIZING || 'nein') === 'ja',
    performanceSizingMinFaktor: parseFloat(env.TRADING_PERFORMANCE_SIZING_MIN_FAKTOR || '0.5'),
    performanceSizingMinTrades: parseInt(env.TRADING_PERFORMANCE_SIZING_MIN_TRADES || '5', 10),
    // Default AUS, damit ein bereits laufendes Setup nicht ungefragt anders
    // handelt. Kein externer API-Call - nutzt dieselben Kerzen wie die
    // Strategie selbst.
    flashCrashFilter: (env.TRADING_FLASH_CRASH_FILTER || 'nein') === 'ja',
    flashCrashFensterKerzen: parseInt(env.TRADING_FLASH_CRASH_FENSTER_KERZEN || '4', 10),
    flashCrashMaxDropProzent: parseFloat(env.TRADING_FLASH_CRASH_MAX_DROP_PROZENT || '8'),
    // Spread-Filter: verwirft einen Kauf, wenn der Bid/Ask-Spread an der
    // Börse gerade ungewöhnlich breit ist (dünne/gestörte Liquidität - oft
    // ein Begleitsymptom eines Flash-Crashs oder Börsenproblems).
    spreadFilter: (env.TRADING_SPREAD_FILTER || 'nein') === 'ja',
    spreadMaxProzent: parseFloat(env.TRADING_SPREAD_MAX_PROZENT || '1'),
    // Default AUS, damit ein bereits laufendes Setup nicht ungefragt anders
    // handelt. Verschiebt nur zwischen bereits bestehenden Coin-Kapitalien -
    // erhöht das Gesamtkapital nie, rührt Stop-Loss/Kill-Switch nicht an.
    rebalancing: (env.TRADING_REBALANCING || 'nein') === 'ja',
    rebalancingAnteilProzent: parseFloat(env.TRADING_REBALANCING_ANTEIL_PROZENT || '10'),
    rebalancingMinTrades: parseInt(env.TRADING_REBALANCING_MIN_TRADES || '5', 10),
    // Default AUS, alle drei Defaults = unverändertes Verhalten ggü. vorher.
    dynamischerStopLoss: (env.TRADING_DYNAMISCHER_STOP_LOSS || 'nein') === 'ja',
    stopLossAtrMultiplikator: parseFloat(env.TRADING_STOP_LOSS_ATR_MULTIPLIKATOR || '2'),
    cooldownMinuten: parseInt(env.TRADING_COOLDOWN_NACH_VERLUST_MINUTEN || '0', 10),
    partialTakeProfitProzent: parseFloat(env.TRADING_PARTIAL_TAKE_PROFIT_PROZENT || '0'),
    partialTakeProfitAnteil: parseFloat(env.TRADING_PARTIAL_TAKE_PROFIT_ANTEIL || '50'),
  };
}

async function runAll(env) {
  const cfg = readConfig(env);
  let offenePositionen = await zaehleOffenePositionen(env, cfg.symbols, cfg.startKapitalProSymbol);
  // Nur EINMAL pro Lauf abgefragt (marktweiter Wert, gilt für alle Symbole
  // gleich) statt pro Symbol - spart Anfragen und ist konsistent für alle
  // Coins in diesem Lauf.
  const fearGreedWert = cfg.fngFilter ? await ladeFearGreedIndex() : null;
  const btcDominanzProzent = cfg.btcDominanzFilter ? await ladeBtcDominanzProzent() : null;
  for (const symbol of cfg.symbols) {
    try {
      // Pro Symbol ggf. eigene Strategie (siehe strategieProSymbol) statt
      // zwangsläufig der globalen - alles andere (Filter, Risiko-Limits)
      // bleibt für alle Symbole identisch.
      const cfgSymbol = cfg.strategieProSymbol[symbol]
        ? { ...cfg, strategie: cfg.strategieProSymbol[symbol] }
        : cfg;
      const hatteVorherPosition = (await loadState(env, symbol, cfg.startKapitalProSymbol)).position !== null;
      await runSymbol(env, symbol, cfg.startKapitalProSymbol, cfgSymbol, offenePositionen, fearGreedWert, btcDominanzProzent);
      const hatJetztPosition = (await loadState(env, symbol, cfg.startKapitalProSymbol)).position !== null;
      if (!hatteVorherPosition && hatJetztPosition) offenePositionen++;
      if (hatteVorherPosition && !hatJetztPosition) offenePositionen--;
    } catch (err) {
      console.error(`[trading-bot] Fehler bei ${symbol}:`, err);
      await notifyWhatsapp(env, `🛑 Trading-Bot (${symbol}): Lauf mit Fehler abgebrochen - ${err.message || err}. Eine Order wurde dadurch möglicherweise NICHT ausgeführt, bitte Konto manuell prüfen.`);
    }
  }
  try {
    await pruefeUndSendeTagesZusammenfassung(env, cfg);
  } catch (err) {
    console.error('[trading-bot] Fehler bei Tages-Zusammenfassung:', err);
  }
  try {
    await pruefeUndSendeWochenZusammenfassung(env, cfg);
  } catch (err) {
    console.error('[trading-bot] Fehler bei Wochen-Zusammenfassung:', err);
  }
  try {
    await pruefeUndSendeMonatsZusammenfassung(env, cfg);
  } catch (err) {
    console.error('[trading-bot] Fehler bei Monats-Zusammenfassung:', err);
  }
  try {
    await pruefeUndFuehreKapitalRebalancing(env, cfg);
  } catch (err) {
    console.error('[trading-bot] Fehler beim Kapital-Rebalancing:', err);
  }
}

// ================= READ-ONLY STATUS (fürs Dashboard, kann nie traden) =================

async function buildStatus(env) {
  const cfg = readConfig(env);
  const symbole = [];
  const alleTrades = [];
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    symbole.push({
      symbol,
      exchange: cfg.exchange,
      paperModus: cfg.paperModus,
      strategie: cfg.strategieProSymbol[symbol] || cfg.strategie,
      position: state.position,
      kapital: state.kapital,
      startKapital: state.startKapital,
      heutigerVerlustUsdt: state.heutigerVerlustUsdt,
      killSwitchAktiv: state.killSwitchAktiv,
      tradeStats: berechneTradeStats(state.trades || []),
    });
    alleTrades.push(...(state.trades || []));
  }
  return {
    updatedAt: new Date().toISOString(),
    exchange: cfg.exchange,
    paperModus: cfg.paperModus,
    readiness: berechneReadiness(symbole, alleTrades),
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
async function buildTradesCsv(env) {
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

    // CSV-Export der Trade-Historie - gleiches Secret wie /status (rein
    // lesend, kann nie einen Trade auslösen).
    if (url.pathname === '/export' && request.method === 'GET') {
      if (!env.STATUS_READ_KEY || url.searchParams.get('key') !== env.STATUS_READ_KEY) {
        return new Response('Forbidden', { status: 403 });
      }
      const csv = await buildTradesCsv(env);
      return new Response(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="trading-bot-trades.csv"',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Manuelles Auslösen nur mit korrektem Trigger-Secret - sonst könnte
    // jeder, der die öffentliche Worker-URL kennt, echte Trades auslösen.
    if (url.searchParams.get('key') !== env.TRIGGER_SECRET || !env.TRIGGER_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
    await runAll(env);
    return new Response('OK - Lauf ausgeführt, siehe WhatsApp/Logs.', { status: 200 });
  },
};
