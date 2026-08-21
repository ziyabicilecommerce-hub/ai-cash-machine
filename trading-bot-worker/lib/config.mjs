// Liest alle TRADING_*-Umgebungsvariablen in ein einziges Konfigurations-
// objekt ein. Eigenes Modul (statt Teil von worker.js), damit sowohl
// worker.js als auch lib/status.mjs es importieren können, ohne einen
// zirkulären Import zu erzeugen.

import { EXCHANGES } from './exchanges.mjs';

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

export function readConfig(env) {
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
    // Marktweite Erweiterung des Flash-Crash-Filters: crasht BTC selbst hart,
    // pausiert das Käufe für ALLE Coins (nicht nur BTC) in diesem Lauf -
    // Altcoins fallen in einem BTC-getriebenen Panik-Moment erfahrungsgemäß
    // mit, oft sogar stärker. Nutzt dieselbe, bereits verifizierte Logik wie
    // der Pro-Symbol-Filter, nur auf BTCs eigenen Kerzen statt jedem Coin
    // einzeln - braucht dafür EINEN zusätzlichen Klines-Abruf pro Lauf
    // (nicht pro Symbol).
    marktweiterCrashFilter: (env.TRADING_MARKTWEITER_CRASH_FILTER || 'nein') === 'ja',
    marktweiterCrashFensterKerzen: parseInt(env.TRADING_MARKTWEITER_CRASH_FENSTER_KERZEN || '4', 10),
    marktweiterCrashMaxDropProzent: parseFloat(env.TRADING_MARKTWEITER_CRASH_MAX_DROP_PROZENT || '10'),
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
    // Default AUS - braucht zusätzlich einen kostenlosen CRYPTOPANIC_API_KEY
    // (Secret, siehe README). Ohne Key bleibt der Filter automatisch
    // wirkungslos, aber ohne Fehler.
    newsSentimentFilter: (env.TRADING_NEWS_SENTIMENT_FILTER || 'nein') === 'ja',
    newsSentimentMinProzent: parseFloat(env.TRADING_NEWS_SENTIMENT_MIN_PROZENT || '35'),
    // Adaptives Lernen - siehe lib/learning.mjs. Default AUS: verändert einen
    // echten Risiko-Parameter selbstständig, das erst live beobachten bevor
    // man sich drauf verlässt.
    adaptivesLernen: (env.TRADING_ADAPTIVES_LERNEN || 'nein') === 'ja',
    adaptivesLernenMinTrades: parseInt(env.TRADING_ADAPTIVES_LERNEN_MIN_TRADES || '10', 10),
    // Automatischer wöchentlicher Backtest-Check - siehe lib/autobacktest.mjs.
    // Rein informativ (verändert nie Kapital/Position), deshalb - anders als
    // adaptives Lernen - standardmäßig an.
    autoBacktest: (env.TRADING_AUTO_BACKTEST || 'ja') === 'ja',
    // Wirtschaftskalender-Filter - siehe lib/wirtschaftskalender.mjs. Kein
    // API-Key nötig, keine gemessenen Nachteile (pausiert nur kurze
    // Zeitfenster rund um wenige High-Impact-USD-Events pro Woche),
    // deshalb standardmäßig an.
    newsEventFilter: (env.TRADING_NEWS_EVENT_FILTER || 'ja') === 'ja',
    newsEventFensterMinuten: parseInt(env.TRADING_NEWS_EVENT_FENSTER_MINUTEN || '30', 10),
  };
}
