# Empire-Worker (Cloudflare Worker)

Verbindet `trading-bot-worker` (Krypto) und `stocks-bot-worker` (Aktien)
**wirklich serverseitig** zu einem System, statt sie nur im Dashboard
clientseitig zusammenzurechnen (das macht `empire-dashboard/` weiterhin
zusätzlich, unabhängig davon).

## Wie das funktioniert

Bindet **beide bereits bestehenden KV-Namespaces** direkt (dieselben IDs
wie in `trading-bot-worker/wrangler.toml` und
`stocks-bot-worker/wrangler.toml`) — liest die gespeicherten Trade-States
direkt, statt die `/status`-Endpoints der einzelnen Bots per HTTP
anzufragen (braucht dadurch keine Secrets der anderen Bots).

**Read-only per Konvention**: Dieser Worker ruft in seinem gesamten Code
kein einziges Mal `.put()` auf einem der beiden Namespaces auf — kann
also strukturell nie den State eines Bots verändern oder einen Trade
auslösen, selbst wenn er kompromittiert würde.

## Drei Aufgaben

1. **`GET /status?key=<STATUS_READ_KEY>`** — ein kombinierter, rein
   lesender Endpoint über beide Bots (Gesamtkapital pro Währung,
   Gesamt-Trades, Win-Rate, Kill-Switch-Status).
2. **Täglicher Cron (20:00 UTC)** — ein kombinierter WhatsApp/Telegram-
   Report statt zwei getrennter Nachrichten von den einzelnen Bots.
3. **`POST /telegram-webhook`** — interaktiver Telegram-Bot: schreib dem
   Bot `/status`, `/krypto`, `/aktien` oder `/hilfe` und bekommst sofort
   eine Antwort, statt auf den Tages-Report zu warten. Genau wie 1./2.
   strikt rein lesend (kein `.put()` in dieser Datei) — kein Befehl kann
   je einen Trade auslösen, egal was geschrieben wird. Antwortet **nur**
   im eigenen konfigurierten `TELEGRAM_CHAT_ID` — Nachrichten von jedem
   anderen Chat werden mit stillem `200 OK` ignoriert, damit niemand
   sonst, der den Bot-Namen findet, dein Portfolio abfragen kann.

## Setup

1. Secrets setzen (im `empire-worker/`-Ordner):
   ```bash
   wrangler secret put WHATSAPP_ACCESS_TOKEN     # optional
   wrangler secret put WHATSAPP_PHONE_NUMBER_ID  # optional
   wrangler secret put WHATSAPP_TO_NUMBER        # optional
   wrangler secret put TELEGRAM_BOT_TOKEN        # für /telegram-webhook nötig
   wrangler secret put TELEGRAM_CHAT_ID          # für /telegram-webhook nötig
   wrangler secret put TELEGRAM_WEBHOOK_SECRET   # bereits gesetzt (frei erfundener String)
   wrangler secret put TRIGGER_SECRET
   wrangler secret put STATUS_READ_KEY
   ```
2. Deployen:
   ```bash
   wrangler deploy
   ```
3. **Nur für den interaktiven Bot (Schritt 3 oben) zusätzlich nötig:**
   Telegram muss wissen, wohin es eingehende Nachrichten schicken soll.
   Einmalig mit dem eigenen `TELEGRAM_BOT_TOKEN` und dem selbst gesetzten
   `TELEGRAM_WEBHOOK_SECRET` aufrufen:
   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d "url=https://cashmachine-empire.<dein-account>.workers.dev/telegram-webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
   Danach im eigenen Telegram-Chat mit dem Bot (dem, dessen `TELEGRAM_CHAT_ID`
   gesetzt ist) `/hilfe` schreiben, um zu testen.

Ohne WhatsApp/Telegram-Secrets läuft der tägliche Cron trotzdem (loggt
nur statt zu senden) — `/status` funktioniert unabhängig davon immer. Ohne
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/`setWebhook`-Aufruf bleibt
`/telegram-webhook` einfach ungenutzt (Telegram schickt dann nie etwas an
diese URL).
