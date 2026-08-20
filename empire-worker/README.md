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

## Zwei Aufgaben

1. **`GET /status?key=<STATUS_READ_KEY>`** — ein kombinierter, rein
   lesender Endpoint über beide Bots (Gesamtkapital pro Währung,
   Gesamt-Trades, Win-Rate, Kill-Switch-Status).
2. **Täglicher Cron (20:00 UTC)** — ein kombinierter WhatsApp/Telegram-
   Report statt zwei getrennter Nachrichten von den einzelnen Bots.

## Setup

1. Secrets setzen (im `empire-worker/`-Ordner):
   ```bash
   wrangler secret put WHATSAPP_ACCESS_TOKEN     # optional
   wrangler secret put WHATSAPP_PHONE_NUMBER_ID  # optional
   wrangler secret put WHATSAPP_TO_NUMBER        # optional
   wrangler secret put TELEGRAM_BOT_TOKEN        # optional
   wrangler secret put TELEGRAM_CHAT_ID          # optional
   wrangler secret put TRIGGER_SECRET
   wrangler secret put STATUS_READ_KEY
   ```
2. Deployen:
   ```bash
   wrangler deploy
   ```

Ohne WhatsApp/Telegram-Secrets läuft der tägliche Cron trotzdem (loggt
nur statt zu senden) — `/status` funktioniert unabhängig davon immer.
