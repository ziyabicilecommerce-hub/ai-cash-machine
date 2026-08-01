# WhatsApp-Anruf-Trigger (Cloudflare Worker)

Löst automatisch einen KI-Telefonanruf über Vapi aus, sobald eine vom
Lead-Jäger (`automations/48-google-maps-lead-jaeger.mjs`) gefundene Firma auf
die WhatsApp-Nachricht antwortet. **Bewusst nicht** vor einer Antwort — das ist
die rechtliche Absicherung gegen unerlaubte automatisierte Kaltakquise-Anrufe
(UWG §7).

## Warum ein eigener Cloudflare Worker?

WhatsApp liefert eingehende Nachrichten ausschließlich per Push-Webhook, kein
Polling. GitHub Actions kann nur auf Zeitplan oder manuellen Start reagieren,
aber keine beliebigen eingehenden HTTP-Anfragen von Meta empfangen. Es braucht
also zwingend eine dauerhaft erreichbare Stelle dazwischen — ein Cloudflare
Worker ist dafür minimal (kostenloser Tier, keine Kreditkarte nötig).

## Ablauf

1. Firma antwortet auf die Lead-Jäger-WhatsApp-Nachricht.
2. Meta schickt einen Webhook an diesen Worker.
3. Worker prüft die Absendernummer gegen die vom Lead-Jäger veröffentlichte
   Liste (`automations/state/leads-warten-auf-antwort.json`, öffentlich über
   raw.githubusercontent.com abrufbar).
4. Treffer → Worker löst einen Anruf über Vapi aus (mit Name/Branche/Grund als
   Kontext für den Anruf-Assistenten) und merkt sich die Nummer in Cloudflare
   KV, damit nicht doppelt angerufen wird.
5. Optional: Bestätigung per WhatsApp an dich, dass der Anruf läuft.

## Einmaliges Setup

1. **Cloudflare-Account** (kostenlos) + [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installieren.
2. In diesem Ordner:
   ```bash
   wrangler kv namespace create CALLED_LEADS
   ```
   Die zurückgegebene `id` in `wrangler.toml` bei `REPLACE_WITH_KV_NAMESPACE_ID` eintragen.
3. Secrets setzen (nicht in `wrangler.toml` schreiben):
   ```bash
   wrangler secret put WHATSAPP_VERIFY_TOKEN
   wrangler secret put WHATSAPP_ACCESS_TOKEN
   wrangler secret put WHATSAPP_PHONE_NUMBER_ID
   wrangler secret put WHATSAPP_TO_NUMBER
   wrangler secret put VAPI_API_KEY
   wrangler secret put VAPI_ASSISTANT_ID
   wrangler secret put VAPI_PHONE_NUMBER_ID
   ```
   `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_TO_NUMBER` sind
   dieselben Werte wie die GitHub Secrets der Lead-Jäger-Automation.
   `WHATSAPP_VERIFY_TOKEN` ist ein frei erfundener String, den du dir merkst.
4. Deployen:
   ```bash
   wrangler deploy
   ```
   Gibt eine URL wie `https://cashmachine-whatsapp-call-trigger.<dein-account>.workers.dev` aus.
5. **Meta App Dashboard** → WhatsApp → Konfiguration → Webhook:
   - Callback-URL: die Worker-URL aus Schritt 4
   - Verify-Token: derselbe Wert wie `WHATSAPP_VERIFY_TOKEN`
   - Webhook-Feld abonnieren: `messages`
6. **Vapi-Account** (vapi.ai) einrichten:
   - Assistenten anlegen, Prompt mit `{{name}}`, `{{branche}}`, `{{grund}}`,
     `{{previewUrl}}` als Platzhaltern (werden pro Anruf vom Worker befüllt).
   - Anruf-Telefonnummer einrichten/importieren — prüfe vorher, ob Vapi/dein
     Telefonie-Anbieter Anrufe an deutsche Nummern unterstützt.
   - API-Key, Assistant-ID und Phone-Number-ID aus dem Dashboard entnehmen.

Ohne dieses Setup läuft der Lead-Jäger unverändert weiter (findet Leads,
schickt WhatsApp) — nur der automatische Rückruf bei einer Antwort bleibt
inaktiv, bis der Worker deployt ist.
