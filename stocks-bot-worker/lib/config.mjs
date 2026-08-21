// Liest alle STOCKS_*-Umgebungsvariablen in ein einziges Konfigurations-
// objekt ein. Deutlich schlankere Variante als trading-bot-worker/lib/
// config.mjs (kein FNG-/BTC-Dominanz-/News-Sentiment-/Multi-Timeframe-Filter -
// die sind kryptospezifisch) - Kern-Risikologik (Stop-Loss, Kill-Switch,
// Tagesverlust-Sperre, Flash-Crash-Schutz, Cooldown) ist identisch übernommen,
// weil sie sich im Krypto-Bot bereits bewährt hat.

export function readConfig(env) {
  const symbols = (env.STOCKS_SYMBOLS || 'AAPL,MSFT,NVDA,AMZN,GOOGL').split(',').map((s) => s.trim()).filter(Boolean);
  const gesamtKapital = parseFloat(env.STOCKS_KAPITAL_USD || '50');
  const strategie = (env.STOCKS_STRATEGIE || 'bollinger-mean-reversion').trim();
  const GUELTIGE_STRATEGIEN = ['ema-crossover', 'bollinger-mean-reversion', 'donchian-breakout'];
  if (!GUELTIGE_STRATEGIEN.includes(strategie)) {
    throw new Error(`Unbekannte STOCKS_STRATEGIE "${strategie}" - unterstützt: ${GUELTIGE_STRATEGIEN.join(', ')}`);
  }
  return {
    symbols,
    startKapitalProSymbol: gesamtKapital / symbols.length,
    // Alpaca Paper-Trading ist strukturell IMMER Paper (andere API-Domain
    // als der Live-Handel) - dieses Flag existiert nur für Anzeige-Zwecke
    // im Dashboard/in Nachrichten, schaltet nichts um.
    paperModus: true,
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
    maxGleichzeitigePositionen: env.STOCKS_MAX_GLEICHZEITIGE_POSITIONEN
      ? parseInt(env.STOCKS_MAX_GLEICHZEITIGE_POSITIONEN, 10)
      : symbols.length,
    performanceSizing: (env.STOCKS_PERFORMANCE_SIZING || 'nein') === 'ja',
    performanceSizingMinFaktor: parseFloat(env.STOCKS_PERFORMANCE_SIZING_MIN_FAKTOR || '0.5'),
    performanceSizingMinTrades: parseInt(env.STOCKS_PERFORMANCE_SIZING_MIN_TRADES || '5', 10),
    // Adaptives Lernen (Pendant zum Krypto-Bot) - passt den Stop-Loss pro
    // Symbol periodisch an die real beobachtete Verlust-Streuung an, statt
    // für immer beim global konfigurierten Wert zu bleiben. Siehe
    // lib/learning.mjs. Default AUS wie im Krypto-Bot.
    adaptivesLernen: (env.STOCKS_ADAPTIVES_LERNEN || 'nein') === 'ja',
    adaptivesLernenMinTrades: parseInt(env.STOCKS_ADAPTIVES_LERNEN_MIN_TRADES || '10', 10),
    // Multi-Timeframe-Filter (Pendant zum Krypto-Bot) - siehe lib/multitimeframe.mjs.
    mtfFilter: (env.STOCKS_MTF_FILTER || 'nein') === 'ja',
    mtfIntervalMinuten: parseInt(env.STOCKS_MTF_INTERVAL_MINUTEN || '240', 10),
    // Automatischer wöchentlicher Backtest-Check - siehe lib/autobacktest.mjs.
    // Rein informativ (verändert nie Kapital/Position), deshalb standardmäßig an.
    autoBacktest: (env.STOCKS_AUTO_BACKTEST || 'ja') === 'ja',
    // Kein externer API-Call, nutzt dieselben Kerzen wie die Strategie - im
    // Krypto-Bot bewährt, hier standardmäßig ebenfalls an.
    flashCrashFilter: (env.STOCKS_FLASH_CRASH_FILTER || 'ja') === 'ja',
    flashCrashFensterKerzen: parseInt(env.STOCKS_FLASH_CRASH_FENSTER_KERZEN || '4', 10),
    flashCrashMaxDropProzent: parseFloat(env.STOCKS_FLASH_CRASH_MAX_DROP_PROZENT || '8'),
    spreadFilter: (env.STOCKS_SPREAD_FILTER || 'ja') === 'ja',
    spreadMaxProzent: parseFloat(env.STOCKS_SPREAD_MAX_PROZENT || '1'),
    dynamischerStopLoss: false,
    stopLossAtrMultiplikator: 2,
    cooldownMinuten: parseInt(env.STOCKS_COOLDOWN_NACH_VERLUST_MINUTEN || '60', 10),
    partialTakeProfitProzent: 0,
    partialTakeProfitAnteil: 50,
    // Wirtschaftskalender-Filter - siehe lib/wirtschaftskalender.mjs.
    // Gemeinsames Modul mit trading-bot-worker (Krypto), gleicher Default.
    newsEventFilter: (env.STOCKS_NEWS_EVENT_FILTER || 'ja') === 'ja',
    newsEventFensterMinuten: parseInt(env.STOCKS_NEWS_EVENT_FENSTER_MINUTEN || '30', 10),
    // Marktweiter Crash-Schutz (Pendant zum Krypto-Bot, dort mit BTC als
    // Signal-Coin): crasht der Gesamtmarkt (SPY = S&P-500-ETF als breiter
    // Marktindikator) hart, werden Käufe für ALLE konfigurierten Aktien in
    // diesem Lauf pausiert - Einzelaktien fallen in einem marktweiten
    // Ausverkauf erfahrungsgemäß mit. SPY selbst zählt NICHT zu den
    // gehandelten Symbolen, wird nur als Signal abgefragt.
    marktweiterCrashFilter: (env.STOCKS_MARKTWEITER_CRASH_FILTER || 'ja') === 'ja',
    marktweiterCrashSymbol: (env.STOCKS_MARKTWEITER_CRASH_SYMBOL || 'SPY').trim(),
    marktweiterCrashFensterKerzen: parseInt(env.STOCKS_MARKTWEITER_CRASH_FENSTER_KERZEN || '4', 10),
    marktweiterCrashMaxDropProzent: parseFloat(env.STOCKS_MARKTWEITER_CRASH_MAX_DROP_PROZENT || '5'),
    // Insider-Kauf-Bestätigung (kein API-Key, öffentliche SEC-EDGAR-Daten) -
    // siehe lib/insiderbuys.mjs. Einziger NICHT-blockierender Filter hier:
    // erhöht die Positionsgröße leicht statt einen Kauf zu verwerfen.
    insiderBuyFilter: (env.STOCKS_INSIDER_BUY_FILTER || 'ja') === 'ja',
    insiderSecUserAgent: env.STOCKS_INSIDER_SEC_USER_AGENT || 'CashMachineStocksBot/1.0 (Kontakt bitte in STOCKS_INSIDER_SEC_USER_AGENT setzen)',
    insiderLookbackTage: parseInt(env.STOCKS_INSIDER_LOOKBACK_TAGE || '7', 10),
    insiderMinKaufwertUsd: parseFloat(env.STOCKS_INSIDER_MIN_KAUFWERT_USD || '100000'),
    insiderBoostFaktor: parseFloat(env.STOCKS_INSIDER_BOOST_FAKTOR || '1.2'),
  };
}
