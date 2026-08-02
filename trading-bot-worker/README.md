# Trading-Bot (Cloudflare Worker)

Krypto-Spot-Trading-Bot mit denselben Sicherheitsgrenzen wie
`automations/49-trading-bot.mjs`, aber als eigenständiger Cloudflare Worker
statt als GitHub-Actions-Automation — **und mit Unterstützung für mehrere
Kryptowährungen gleichzeitig.**

## Warum ein eigener Worker statt GitHub Actions?

Der GitHub-Actions-Bot (`automations/49-trading-bot.mjs`) lief technisch
korrekt, aber **jede Anfrage an Binance schlug mit `HTTP 451` fehl** —
Binance blockiert die IP-Bereiche der GitHub-Actions-Runner aus
regulatorischen Gründen. Cloudflare Workers laufen am globalen Edge-Netzwerk
und sind davon in aller Regel nicht betroffen. Der GitHub-Actions-Bot bleibt
im Repo (funktioniert als Vorlage/Referenz), aber für echten Betrieb bitte
diesen Worker nutzen.

## Was ist neu ggü. der GitHub-Actions-Version?

**Mehrere Symbole gleichzeitig** (`TRADING_SYMBOLS`, kommagetrennt, z.B.
`BTCUSDT,ETHUSDT,SOLUSDT`). Wichtig: **dein Gesamtrisiko bleibt exakt so
hoch wie konfiguriert** — `TRADING_KAPITAL_USDT` wird durch die Anzahl
Symbole geteilt, jedes Symbol bekommt sein eigenes, unabhängiges Kapital,
eigenen State und eigenen Kill-Switch. Bei 100 USDT Gesamtkapital und 2
Symbolen handelt jedes einzelne also mit 50 USDT — nicht mit 100 USDT pro
Coin. So verdoppelt/vervielfacht sich dein Risiko nicht heimlich, nur weil
mehr Coins beobachtet werden.

Alle bisherigen Sicherheitsmechanismen bleiben unverändert, pro Symbol:
- Paper-Modus per Default (`TRADING_PAPER_MODE=ja`), kein echtes Geld ohne
  bewusstes Umstellen.
- Spot-only, kein Hebel — maximaler Verlust ist immer nur das für dieses
  Symbol eingesetzte Kapital.
- Stop-Loss pro Trade, Tagesverlust-Handelssperre, dauerhafter
  Gesamtverlust-Kill-Switch, Mindest-Ordergröße-Check vor jedem Kauf.
- Bei einer fehlgeschlagenen Order (z.B. Binance-Fehler) kommt sofort ein
  WhatsApp-Alarm, statt dass der Fehler unbemerkt bleibt.

## Einmaliges Setup

1. **Cloudflare-Account** (kostenlos) + [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/).
2. In diesem Ordner:
   ```bash
   wrangler kv namespace create TRADING_STATE
   ```
   Die zurückgegebene `id` in `wrangler.toml` bei `REPLACE_WITH_KV_NAMESPACE_ID`
   eintragen.
3. Konfiguration in `wrangler.toml` unter `[vars]` anpassen (Symbole,
   Kapital, Risikogrenzen) — das sind keine Geheimnisse, dürfen direkt in
   der Datei stehen.
4. Secrets setzen (nicht in `wrangler.toml` schreiben):
   ```bash
   wrangler secret put BINANCE_API_KEY
   wrangler secret put BINANCE_API_SECRET
   wrangler secret put WHATSAPP_ACCESS_TOKEN
   wrangler secret put WHATSAPP_PHONE_NUMBER_ID
   wrangler secret put WHATSAPP_TO_NUMBER
   wrangler secret put TRIGGER_SECRET
   ```
   **Beim Binance-API-Key: nur Spot-Trading-Rechte aktivieren, NIEMALS
   Auszahlungsrechte.** Das gilt genauso wie beim GitHub-Actions-Bot.
   `TRIGGER_SECRET` ist ein frei erfundener String, der den manuellen
   Test-Aufruf (`?key=...`) vor Fremdzugriff schützt.
5. Deployen:
   ```bash
   wrangler deploy
   ```
   Der Cron-Trigger (alle 15 Minuten, siehe `wrangler.toml`) läuft danach
   automatisch — kein manueller Aufruf nötig. Zum Testen:
   ```
   https://cashmachine-trading-bot.<dein-account>.workers.dev/?key=<TRIGGER_SECRET>
   ```

## State zurücksetzen

Der State liegt in Cloudflare KV (`TRADING_STATE`, Key `state:<SYMBOL>`),
nicht mehr in einer Git-Datei. Zum manuellen Zurücksetzen (z.B. nach einem
ausgelösten Kill-Switch):
```bash
wrangler kv key delete --binding=TRADING_STATE "state:BTCUSDT"
```
