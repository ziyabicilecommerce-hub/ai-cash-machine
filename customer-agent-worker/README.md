# Kunden-Chat-Agent (Cloudflare Worker)

Ein echter Kunden-Chat-Agent für die Shopify-Website — als Widget einbettbar
(`widget.js`), beantwortet von einem Cloudflare Worker (`worker.js`), der
serverseitig mit Google Gemini spricht (kostenlose API-Stufe, kein Anthropic-Key nötig).

## Verkaufsberater-Modus (optional)

Trägst du `SHOPIFY_STORE_DOMAIN` und `SHOPIFY_STOREFRONT_TOKEN` in
`wrangler.toml` ein, holt sich der Worker den echten, aktuellen
Produktkatalog über die öffentliche Shopify-Storefront-API (Titel, Preis,
Link, Kurzbeschreibung; gecacht für `KATALOG_CACHE_TTL_SEKUNDEN`, Default 30
Minuten) und gibt ihn der KI als Kontext mit. Der Chat empfiehlt dann aktiv
passende Produkte mit echtem Preis/Link und geht auf Kaufeinwände (Preis,
Lieferzeit, Vertrauen) ein — statt nur zu antworten, wenn gefragt wird. Ohne
diese beiden Werte läuft der Chat unverändert als reiner Support-Assistent
weiter. Der Assistent darf dabei ausschließlich Produkte aus dem echten
Katalog nennen, nie welche erfinden — die harte Regel gegen erfundene
Bestell-/Kontodaten (siehe unten) gilt unverändert weiter.

## Warum kein Browser-Direktaufruf wie bei Jarvis/Brand Assassin/Oracle/Closer?

Jene Apps sind **BYOK** (bring-your-own-key): jeder Nutzer trägt seinen
**eigenen** Gemini-Key ein, der nur in seinem eigenen Browser
(`localStorage`) liegt. Das funktioniert, weil nur der Shop-Besitzer selbst
diese internen Tools benutzt.

Ein Kunden-Chat auf der öffentlichen Website wird aber von **fremden
Besuchern** bedient. Würde der Chat direkt aus dem Browser mit dem Key des
Shop-Besitzers gegen die Gemini-API sprechen, läge dieser Key im
Seitenquelltext — jeder Besucher könnte ihn auslesen und die kostenlose
Stufe des Shop-Besitzers ausschöpfen. Deshalb läuft der eigentliche
Gemini-Aufruf **server-seitig in diesem Worker**: Der Key steckt nur als
Cloudflare-Secret im Worker, der Browser spricht nur mit dem Worker, nie
direkt mit Google.

## Schutz gegen Kosten-Explosion durch fremde Besucher

- **Pro-Besucher-Rate-Limit** (`RATE_LIMIT_PRO_STUNDE`, Default 20
  Nachrichten/Stunde), über Cloudflare KV pro Session-ID (oder IP als
  Fallback) gezählt.
- **Globales Tages-Token-Budget** (`MAX_TOKENS_PRO_TAG`, Default 200.000),
  danach zeigt der Chat ehrlich "gerade nicht verfügbar, bitte per E-Mail" -
  statt unbegrenzt weiterzulaufen. Gleiches Prinzip wie
  `GEMINI_MAX_TOKENS_PRO_TAG` bei den GitHub-Actions-Automationen - reines
  Sicherheitsnetz, da die Gemini-API-Stufe hier ohnehin kostenlos ist.
- **CORS auf explizite Shop-Domains beschränkt** (`ALLOWED_ORIGINS`) - ohne
  passenden Eintrag lehnt der Worker jede Anfrage mit 403 ab, damit nicht
  irgendeine fremde Seite den Worker (und damit indirekt den Key) für ihr
  eigenes Chat-Frontend mitbenutzt.
- Der Assistent bekommt **keine echten Bestell-/Kontodaten** und wird per
  System-Prompt explizit angewiesen, niemals Bestellnummern, Tracking oder
  Preise zu erfinden - bei allem Bestellspezifischen verweist er an den
  menschlichen Support (`SUPPORT_EMAIL`). Gleiches Prinzip wie beim
  KI-Kundenservice (`automations/02-ki-kundenservice.mjs`).

## Einmaliges Setup

1. **Cloudflare-Account** (kostenlos) + [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/).
2. In diesem Ordner:
   ```bash
   wrangler kv namespace create CHAT_STATE
   ```
   Die zurückgegebene `id` in `wrangler.toml` bei `REPLACE_WITH_KV_NAMESPACE_ID`
   eintragen.
3. Konfiguration in `wrangler.toml` unter `[vars]` anpassen — das sind keine
   Geheimnisse, dürfen direkt in der Datei stehen:
   - `SHOP_NAME`, `SHOP_NISCHE`, `VERSANDZEIT`, `RETOURE_TAGE`, `SUPPORT_EMAIL`
   - `ALLOWED_ORIGINS` — **wichtig:** exakte Domain(s) deines Shops eintragen
     (z.B. `https://deinshop.myshopify.com,https://www.deinshop.de`), sonst
     antwortet der Chat niemandem.
4. Secret setzen (nicht in `wrangler.toml` schreiben):
   ```bash
   wrangler secret put GEMINI_API_KEY
   ```
   Kostenloser Key unter [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
   Das ist der Key des Shop-Besitzers — verlässt den Worker nie.
5. Deployen:
   ```bash
   wrangler deploy
   ```
   Wrangler gibt eine URL aus, z.B.
   `https://cashmachine-customer-agent.<dein-account>.workers.dev`.

## Widget in den Shopify-Store einbinden

`widget.js` irgendwo statisch hosten (z.B. direkt aus diesem GitHub-Repo via
jsDelivr, oder auf demselben Worker/einer Netlify-Seite) und im Shopify-Theme
kurz vor `</body>` einbinden (Online Store → Themes → Code bearbeiten →
`theme.liquid`):

```html
<script
  src="https://cdn.jsdelivr.net/gh/ziyabicilecommerce-hub/ai-cash-machine@main/customer-agent-worker/widget.js"
  data-worker-url="https://cashmachine-customer-agent.<dein-account>.workers.dev">
</script>
```

Das Widget zeigt eine Chat-Blase unten rechts, merkt sich eine Session-ID in
`localStorage` (für das Rate-Limit) und schickt Nachrichten an
`<data-worker-url>/chat`. Keine weitere Konfiguration im Theme nötig.

## Rate-Limit / Budget zurücksetzen

State liegt in Cloudflare KV (`CHAT_STATE`):
```bash
wrangler kv key delete --binding=CHAT_STATE "budget:2026-08-06"
wrangler kv key list --binding=CHAT_STATE --prefix="rate:"
```
