# Stocks-Bot (Cloudflare Worker)

Zweites, unabhängiges Paper-Trading-Investment neben `trading-bot-worker`
(Krypto) — handelt US-Aktien über [Alpacas](https://alpaca.markets/)
**kostenlosen Paper-Trading-Broker**. Andere API-Domain als Alpacas
Live-Handel (`paper-api.alpaca.markets` statt `api.alpaca.markets`) — kann
strukturell NIE echtes Geld bewegen, egal wie die Konfiguration aussieht.
Komplett gefahrlos zum Ausprobieren, kein Investment nötig.

## Warum ein zweiter Bot statt den Krypto-Bot einfach umzukonfigurieren?

Aktien und Krypto unterscheiden sich fundamental genug, dass ein eigener
Worker sauberer ist als ein "Universal-Bot":

- **Handelszeiten**: Krypto handelt 24/7, Aktien nur zu regulären
  NYSE-Zeiten (grob 15:30–22:00 Uhr deutscher Zeit, Mo–Fr, keine
  US-Feiertage). `lib/alpaca.mjs` fragt Alpacas eigenen Handelskalender
  (`/v2/clock`) ab, statt selbst eine Feiertagsliste zu pflegen — läuft der
  Cron außerhalb der Handelszeiten, wird der Lauf sauber übersprungen.
- **Bruchteils-Aktien**: Alpaca erlaubt ab $1 Kauf-Order (fractional
  shares) — anders als die meisten Krypto-Börsen mit Mindest-Ordergrößen.
- **Andere Marktdaten-API**: Alpacas kostenloser IEX-Feed statt
  Binance/Kraken-Kerzen.

Die eigentliche Entscheidungslogik (`lib/strategie.mjs`) ist **1:1** aus
`trading-bot-worker` übernommen (unverändert kopiert) — RSI/EMA/Bollinger/
Donchian-Berechnung und Kauf-/Verkaufs-Entscheidung sind komplett
Asset-unabhängig, dieselbe Logik funktioniert für Aktienkurse genauso wie
für Kryptokurse.

## Was NOCH NICHT übernommen wurde (bewusst, für einen schlankeren Start)

Anders als der Krypto-Bot hat dieser Wurf (noch) KEINEN Fear&Greed-Filter
oder News-Sentiment-Filter — die sind entweder kryptospezifisch
(Fear&Greed/BTC-Dominanz ergeben bei Aktien keinen Sinn) oder wurden für
einen ersten, überschaubaren Start weggelassen. Stop-Loss, Kill-Switch,
Tagesverlust-Sperre, Flash-Crash-Schutz, Spread-Filter, Cooldown und
Performance-Sizing sind alle vorhanden — die Kern-Risikologik ist
identisch zum bewährten Krypto-Bot.

**Ausnahmen, von Anfang an bzw. inzwischen dabei:**
- **Adaptives Lernen** (`lib/learning.mjs`, wortgleiches Pendant zum
  Krypto-Bot) - passt den Stop-Loss pro Symbol einmal wöchentlich (montags)
  an die real beobachtete Verlust-Streuung dieser Aktie an, statt für immer
  beim global konfigurierten `STOCKS_STOP_LOSS_PROZENT` zu bleiben. Reine
  Statistik über eigene abgeschlossene Trades, kein KI-Modell. Erst ab
  `STOCKS_ADAPTIVES_LERNEN_MIN_TRADES` Verlust-Trades aktiv, gedeckelt aufs
  0.5x-2x-Band um den Standardwert, wirkt nur auf neu eröffnete Positionen.
  Default AUS (`STOCKS_ADAPTIVES_LERNEN` in `wrangler.toml`).
- **Multi-Timeframe-Filter** (`lib/multitimeframe.mjs`, Pendant zum
  Krypto-Bot) - bestätigt ein Kaufsignal auf dem Trading-Timeframe (15m)
  nur, wenn der übergeordnete Trend (Default 4h, Alpacas eigener "4Hour"-
  Timeframe, kein neuer Datenanbieter nötig) ebenfalls aufwärts zeigt
  (EMA schnell > EMA langsam) - verhindert Käufe gegen den größeren Trend.
  War im Krypto-Bot NICHT kryptospezifisch, hier nur wegen des schlankeren
  ersten Starts bisher nicht dabei. Default AUS (`STOCKS_MTF_FILTER`).
- **Wirtschaftskalender-Filter** (`lib/wirtschaftskalender.mjs`, wortgleich
  mit der Version im Krypto-Bot) - pausiert Käufe für alle Aktien gemeinsam
  rund um FOMC-Zinsentscheide, CPI- und NFP-Termine (kostenlose Quelle,
  kein API-Key). Siehe `STOCKS_NEWS_EVENT_FILTER` in `wrangler.toml`.
- **Marktweiter Crash-Schutz** (Pendant zum Krypto-Bot, dort BTC als
  Signal-Coin) - crasht SPY (S&P-500-ETF, breiter Marktindikator) hart,
  werden Käufe für ALLE Aktien in diesem Lauf pausiert. SPY selbst wird
  nicht gehandelt, nur als Signal abgefragt. Siehe
  `STOCKS_MARKTWEITER_CRASH_FILTER` in `wrangler.toml`.
- **Insider-Kauf-Bestätigung** (`lib/insiderbuys.mjs`, kostenlose
  SEC-EDGAR-Daten, gleiche Parsing-Logik wie
  `automations/86-insider-buy-radar.mjs`) - der EINZIGE nicht-blockierende
  Filter im ganzen Projekt: meldeten Firmen-Insider in den letzten
  `STOCKS_INSIDER_LOOKBACK_TAGE` Tagen echte Käufe (Form 4, Code "P",
  offener Markt) über `STOCKS_INSIDER_MIN_KAUFWERT_USD`, wird die
  Positionsgröße um `STOCKS_INSIDER_BOOST_FAKTOR` erhöht (gedeckelt aufs
  vorhandene Kapital) statt der Kauf verhindert. Läuft höchstens einmal pro
  Tag pro Symbol (Tages-Cache im State), nicht bei jedem 5-Minuten-Cron -
  schont SECs Server. **SEC verlangt einen echten, aussagekräftigen
  User-Agent** (`STOCKS_INSIDER_SEC_USER_AGENT` in `wrangler.toml` anpassen,
  eigener Kontakt statt des Platzhalters).

**Backtest gegen echte Alpaca-Kerzen**: `backtest.mjs` (eigene Datei, analog
zum Krypto-Bot) simuliert die exakt gleiche Entscheidungslogik bar-für-bar
gegen historische Alpaca-15m-Kerzen (IEX-Feed, gleiche Paper-Keys wie der
Live-Bot):
```bash
ALPACA_API_KEY=... ALPACA_API_SECRET=... node backtest.mjs AAPL 90
ALPACA_API_KEY=... ALPACA_API_SECRET=... node backtest.mjs AAPL 90 --vergleiche   # alle 3 Strategien
```
Ersetzt keine Live-Beobachtung — vergangene Performance ist keine Garantie,
und Alpacas kostenloser IEX-Feed deckt nur einen Teil des Marktvolumens ab.
Trotzdem eine echte, datenbasierte Grundlage statt reinem Vertrauen, bevor
man länger im Paper-Modus beobachtet.

**Automatischer wöchentlicher Backtest-Check** (`lib/autobacktest.mjs`,
Pendant zum Krypto-Bot): läuft von selbst mit, ohne `backtest.mjs` manuell
anzustoßen - einmal pro Woche (montags, wie das adaptive Lernen) prüft der
Worker jedes Symbol gegen die letzten 14 Tage echter Alpaca-Kerzen mit der
aktuell konfigurierten Strategie und schreibt das Ergebnis (Return, Trades,
Win-Rate, Max-Drawdown, Buy&Hold-Vergleich) rein informativ nach KV -
verändert nie Kapital oder Position. `/status` liefert es pro Symbol als
`autoBacktest`-Feld, Trading Command zeigt es im Signale-Tab an. Bewusst nur
14 statt der vollen 90 Tage - für eine tiefere Analyse bleibt `backtest.mjs`
(lokal) die richtige Wahl. Default an (`STOCKS_AUTO_BACKTEST`).

## Setup

1. **Cloudflare** (gleicher Account wie der Krypto-Bot funktioniert):
   ```bash
   wrangler kv namespace create STOCKS_STATE
   ```
   Die zurückgegebene `id` steht bereits in `wrangler.toml` (schon
   angelegt) — bei einem eigenen Fork die eigene `id` eintragen.

2. **Alpaca-Account** (kostenlos, in unter 10 Minuten, keine Kreditkarte
   nötig): auf [alpaca.markets](https://alpaca.markets/) mit E-Mail
   registrieren. Im Dashboard unter "Paper Trading" die beiden API-Keys
   generieren (NICHT die Live-Trading-Keys — die Paper-Keys funktionieren
   nur gegen `paper-api.alpaca.markets`, genau das nutzt dieser Bot).

3. Secrets setzen:
   ```bash
   wrangler secret put ALPACA_API_KEY
   wrangler secret put ALPACA_API_SECRET
   wrangler secret put WHATSAPP_ACCESS_TOKEN     # optional
   wrangler secret put WHATSAPP_PHONE_NUMBER_ID  # optional
   wrangler secret put WHATSAPP_TO_NUMBER        # optional
   wrangler secret put TELEGRAM_BOT_TOKEN        # optional
   wrangler secret put TELEGRAM_CHAT_ID          # optional
   ```
   `TRIGGER_SECRET` und `STATUS_READ_KEY` sind bereits gesetzt (frei
   erfundene Strings, schützen den manuellen Trigger bzw. den rein
   lesenden `/status`-Endpoint).

4. Deployen:
   ```bash
   wrangler deploy
   ```

## Endpoints

- `GET /status?key=<STATUS_READ_KEY>` — rein lesend, wie beim Krypto-Bot.
- `GET /export?key=<STATUS_READ_KEY>` — CSV-Export der Trade-Historie.
- `GET /reset-kill-switch?key=<TRIGGER_SECRET>&symbol=<SYMBOL>` — setzt NUR
  den Kill-Switch dieses Symbols zurück, Kapital/Trade-Historie/Insider-
  Signal bleiben unangetastet. Bewusst kein automatischer Reset und kein
  Dashboard-Knopf — soll immer eine bewusste Entscheidung sein.
- `GET /?key=<TRIGGER_SECRET>` — manueller Test-Lauf.

`/status` liefert zusätzlich ein Portfolio-weites `portfolioKennzahlen`-
Objekt (`lib/statistik.mjs`, Pendant zum Krypto-Bot, reine Statistik über
die gesamte Trade-Historie): Profit Factor, Expectancy pro Trade, Ø
Gewinn/Verlust, Recovery Factor sowie "Sharpe/Sortino pro Trade" (bewusst
NICHT die annualisierten Lehrbuch-Kennzahlen). Trading Command zeigt das
im Übersicht-Tab.

**AI Trade Review** (optional, `lib/ai-review.mjs`, Pendant zum Krypto-Bot,
KOSTET ECHTES GELD pro Aufruf): lässt Claude einmal pro Woche einen kurzen
Rückblick über die letzten Trades schreiben. Rein lesend, kann nie einen
Trade auslösen. Standardmäßig AUS - Secret setzen und
`STOCKS_AI_REVIEW = "ja"` in `wrangler.toml`:
```bash
wrangler secret put ANTHROPIC_API_KEY
```

## Kill-Switch zurücksetzen (ohne Trade-Historie zu verlieren)

Siehe Endpoint oben. Für einen kompletten Neustart bei null (löscht auch
Trade-Historie und Kapitalstand für das Symbol):
```bash
wrangler kv key delete --binding=STOCKS_STATE "state:AAPL"
```

## Konfiguration

Alle `STOCKS_*`-Variablen in `wrangler.toml` unter `[vars]`, gleiches
Namensschema wie beim Krypto-Bot (`TRADING_*` → `STOCKS_*`). Default:
$50 gesamt auf 5 Aktien (AAPL, MSFT, NVDA, AMZN, GOOGL) verteilt.
