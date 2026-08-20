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

Anders als der Krypto-Bot hat dieser Wurf (noch) KEINEN Fear&Greed-Filter,
BTC-Dominanz-Filter, Multi-Timeframe-Filter, News-Sentiment-Filter,
marktweiten Crash-Schutz oder adaptives Lernen — die sind entweder
kryptospezifisch (BTC-Dominanz ergibt bei Aktien keinen Sinn) oder wurden
für einen ersten, überschaubaren Start weggelassen. Stop-Loss, Kill-Switch,
Tagesverlust-Sperre, Flash-Crash-Schutz, Spread-Filter, Cooldown und
Performance-Sizing sind alle vorhanden — die Kern-Risikologik ist identisch
zum bewährten Krypto-Bot.

**Wichtig: Die Strategie (`bollinger-mean-reversion`) ist für Aktien NOCH
NICHT per Backtest verifiziert** — `backtest.mjs` im Krypto-Bot lädt bisher
nur Kraken-Kerzen. Vor jedem Vertrauen in die Ergebnisse erst eine Weile im
Paper-Modus beobachten (auch wenn's technisch schon Paper ist — die
Frage ist, ob die Strategie bei Aktien überhaupt ähnlich gut funktioniert
wie bei Krypto, das ist unbewiesen).

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
- `GET /?key=<TRIGGER_SECRET>` — manueller Test-Lauf.

## Konfiguration

Alle `STOCKS_*`-Variablen in `wrangler.toml` unter `[vars]`, gleiches
Namensschema wie beim Krypto-Bot (`TRADING_*` → `STOCKS_*`). Default:
$50 gesamt auf 5 Aktien (AAPL, MSFT, NVDA, AMZN, GOOGL) verteilt.
