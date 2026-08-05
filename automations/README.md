# Shop-Automatisierungen (n8n-Ersatz)

46 Marketing-/Ops-Automationen für den Shopify-Shop, die vorher als n8n-Workflows
liefen. Jetzt: Node.js-Skripte (`automations/*.mjs`) + GitHub Actions Cron
(`.github/workflows/automation-*.yml`) — läuft komplett auf GitHub, keine
n8n-Subscription nötig.

## Wie es funktioniert

- Jedes Skript entspricht 1:1 einem alten n8n-Workflow (Nummer im Dateinamen).
- `.github/workflows/_automation-runner.yml` ist der gemeinsame "Motor": checkt
  den Code aus, installiert Dependencies, setzt alle Secrets als Umgebungs­variablen
  und führt das jeweilige Skript aus.
- Jede `automation-NN-*.yml`-Datei ist nur ein dünner "Aufrufer" mit dem
  originalen Zeitplan (Cron) des n8n-Workflows + `workflow_dispatch` zum
  manuellen Testen (Tab "Actions" → Workflow auswählen → "Run workflow").
- Alle Cron-Zeiten sind in UTC hinterlegt und übernehmen die Uhrzeit, die im
  n8n-Workflow stand (unverändert als UTC interpretiert — bei Bedarf in der
  jeweiligen `.yml`-Datei die `cron:`-Zeile anpassen).
- Zustand, der sich n8n über `$getWorkflowStaticData` gemerkt hat (z.B. "diesen
  Kunden schon gefragt"), liegt jetzt in `automations/state/*.json`. Der
  Runner committet Änderungen daran automatisch zurück ins Repo.
- `01-gewinn-radar.mjs` schreibt zusätzlich einen rollierenden 90-Tage-Verlauf
  nach `finance-cockpit/data.json` — das speist die **Finance Cockpit**-App
  (`finance-cockpit/index.html`) direkt, ohne API-Key oder Server.
- `TEST_MODE=ja` (siehe Secrets unten) schickt alle Kunden-Mails an
  `OWNER_EMAIL` mit `[TEST]`-Betreff, statt an echte Kunden — zum Testen ohne
  Risiko.
- Einzelne Automation abschalten: in GitHub → Actions → den Workflow öffnen →
  "..." → "Disable workflow". Kein Löschen nötig.

## Einmalig einzurichten: GitHub Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.
Nur die Secrets setzen, die für die genutzten Automationen relevant sind —
alle anderen haben sinnvolle Defaults in `automations/lib/config.mjs` und
können weggelassen werden (leerer Secret-Wert wird automatisch mit dem
Default aufgefüllt).

### Pflicht (fast alle Automationen brauchen das)

| Secret | Beschreibung |
|---|---|
| `SHOP` | Shopify-Subdomain, z.B. `mein-shop` (aus `mein-shop.myshopify.com`) |
| `SHOPIFY_TOKEN` | Shopify Admin API Access Token (`shpat_...`) |
| `ANTHROPIC_API_KEY` | Claude API Key (`sk-ant-...`) |
| `CLAUDE_MAX_TOKENS_PRO_TAG` | Optional, Default `300000`. Tages-Obergrenze für Claude-Tokenverbrauch über ALLE Automationen zusammen (Sicherheitsnetz gegen Bugs/unerwartet hohe Kosten). Bei Erreichen: einmalige Telegram/WhatsApp-Warnung, weitere Claude-Aufrufe pausieren bis zum nächsten Tag. `0` oder leer = kein Limit. |
| `SHOP_NAME` | Anzeigename des Shops in Mails/Reports |
| `OWNER_EMAIL` | Deine eigene E-Mail (Reports, Alarme, TEST_MODE-Ziel) |
| `ABSENDER_EMAIL` | Absenderadresse für Kunden-Mails |
| `RESEND_API_KEY` | API-Key von resend.com — versendet die E-Mails. Ohne Key: Mails werden nur geloggt, nicht verschickt |
| `TEST_MODE` | `ja` = alle Kunden-Mails gehen testweise an dich; `nein` = live an echte Kunden |

### Optional, je nach genutzten Automationen

**Shop-Kontext (Texte/Prompts):**
`SHOP_URL`, `SHOP_NISCHE`, `ZIELGRUPPE`, `ANSPRACHE`, `VERSANDZEIT`,
`RETOURE_TAGE`, `HEIMATMARKT`, `LAND_CODE`, `REGION`, `INSTAGRAM_HANDLE`,
`TIKTOK_HANDLE`

**Telegram-Alarme** (VIP-Radar, Notbremse, Großbestellung-Radar, ...):
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — ohne diese Secrets werden
Telegram-Nachrichten übersprungen (nur geloggt), kein Fehler.

**Meta/Facebook Ads** (Ads-Manager, Auto-Skalierer, Notbremse, Lookalike-Futter,
Winning-Ad-Creatives):
`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `FB_PAGE_ID`, `FB_PAGE_TOKEN`,
`CUSTOM_AUDIENCE_ID`

**Judge.me Bewertungen** (Bewertungs-Magnet, Bewertungs-Antwort-Bot):
`JUDGEME_API_TOKEN`, `JUDGEME_SHOP_DOMAIN`

**Wetter-Marketing:**
`LAT`, `LON` (Standort-Koordinaten, Default: Berlin)

**KI-Kundenservice** (liest Postfach per IMAP):
`IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`

**Google-Maps-Lead-Jäger** (findet Firmen ohne/mit schlechter Website zum
Website-Verkauf, schickt Treffer per WhatsApp):
`COMPOSIO_API_KEY` (composio.dev → Settings → API Keys; nutzt die dort bereits
verbundene `google_maps`-Verbindung — kein eigener Google-Cloud-Projekt/
Billing-Account nötig), `LEAD_SUCHBEGRIFFE` (kommagetrennte Suchen, z.B.
`Frisör in Hamburg Altona, Restaurant in Köln Ehrenfeld`), `LEAD_MAX_PRO_LAUF`
(Default `15`, deckelt Kosten/Nachrichtenlänge pro Lauf),
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (aus Meta for Developers →
WhatsApp → API-Setup), `WHATSAPP_TO_NUMBER` (deine eigene Nummer im Format
`491701234567`, ohne `+`, muss in der Meta-App als Test-Empfänger hinterlegt
sein). Ohne `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_TO_NUMBER`
wird die Nachricht nur geloggt, kein Fehler. Ohne `LEAD_SUCHBEGRIFFE` läuft die
Automation gar nicht erst los.

Für jeden gefundenen Lead wird zusätzlich ein kleiner Website-Entwurf generiert
(`lead-previews/<slug>.html`, mit Name/Branche/Adresse/Telefon/Bewertung
befüllt) und live über GitHub Pages ausgeliefert
(`https://ziyabicilecommerce-hub.github.io/ai-cash-machine/lead-previews/...`).
Der Link steht direkt in der WhatsApp-Nachricht — so hast du beim Anschreiben
schon etwas Vorzeigbares statt einer kalten Anfrage.

Zusätzlich veröffentlicht der Lead-Jäger jeden Lead mit Telefonnummer in
`automations/state/leads-warten-auf-antwort.json`. Antwortet die Firma auf
WhatsApp, löst `whatsapp-call-trigger/` (ein separat zu deployender Cloudflare
Worker, siehe dessen README) automatisch einen KI-Telefonanruf über Vapi aus —
**bewusst nur nach einer Antwort**, nicht vorher, aus rechtlichen Gründen
(unerlaubte automatisierte Kaltakquise-Anrufe, UWG §7). Ohne dieses separate
Setup läuft der Lead-Jäger unverändert weiter, nur der Rückruf bleibt inaktiv.

**🔎 Product Hunter** (schlägt Produktideen vor, Claude-Einschätzung statt
Live-Trenddaten): `PRODUCT_HUNTER_NISCHEN` (kommagetrennt, z.B. `Küche,Fitness,Haustier`
— fällt ohne diesen Wert auf `SHOP_NISCHE` zurück), `PRODUCT_HUNTER_ANZAHL_PRO_NISCHE`
(Default `3`). Nutzt `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/
`WHATSAPP_TO_NUMBER` wie die anderen WhatsApp-Automationen. Merkt sich bereits
vorgeschlagene Produkte, damit nicht jede Woche dieselben Ideen kommen.

**⚠️ Trading-Bot** (Krypto-Spot-Handel, echtes finanzielles Risiko - keine
Anlageberatung, keine Erfolgsgarantie): `BINANCE_API_KEY`, `BINANCE_API_SECRET`
(Binance → API-Verwaltung; **nur Spot-Trading-Rechte aktivieren, niemals
Auszahlungsrechte**), `TRADING_PAPER_MODE` (Default `ja` = simuliert, kein
echtes Geld; erst bewusst auf `nein` stellen, wenn die Strategie sich im
Paper-Modus bewährt hat), `TRADING_SYMBOL` (Default `BTCUSDT`),
`TRADING_KAPITAL_USDT` (dem Bot zugewiesenes Kapital, Default `100`),
`TRADING_MAX_POSITION_PROZENT` (max. Kapitalanteil pro Trade, Default `25`),
`TRADING_MAX_TAGESVERLUST_PROZENT` (stoppt neue Einstiege für den Rest des
Tages, Default `5`), `TRADING_MAX_GESAMTVERLUST_PROZENT` (Kill-Switch - Bot
stoppt sich komplett und dauerhaft, Default `20`), `TRADING_STOP_LOSS_PROZENT`
(Default `3`), `TRADING_EMA_SCHNELL`/`TRADING_EMA_LANGSAM` (EMA-Crossover-
Strategie, Default `9`/`21`).

Handelt ausschließlich Spot (kein Hebel/Margin) - der maximal mögliche Verlust
ist immer nur das zugewiesene Kapital, nie mehr. Der Kill-Switch bei
`TRADING_MAX_GESAMTVERLUST_PROZENT` ist **dauerhaft**: nach dem Auslösen
bleibt der Bot inaktiv, bis `automations/state/trading-bot-state.json` manuell
gelöscht/zurückgesetzt wird - bewusst kein automatisches Wiederanlaufen nach
einem großen Verlust.

**Wichtig:** Binance blockiert die IP-Bereiche der GitHub-Actions-Runner
(HTTP 451) - dieses Skript kann von hier aus nie erfolgreich handeln, daher
hat #49 keinen Zeitplan mehr (nur `workflow_dispatch` zum manuellen Testen/
als Referenz). Der echte Betrieb läuft über `trading-bot-worker/` (Cloudflare
Worker, gleiche Sicherheitsgrenzen, zusätzlich Multi-Coin-fähig) - siehe
dessen README für Setup.

**🚀 Pump-Scanner** (reiner Alarm, kein Handel - meldet per WhatsApp, wenn
eine Kryptowährung gerade stark steigt): `PUMP_QUOTE_WAEHRUNG` (Default
`USDT`, nur Paare gegen diese Währung werden geprüft), `PUMP_SCHWELLE_PROZENT`
(Mindest-24h-Kursanstieg für einen Alarm, Default `15`),
`PUMP_MIN_VOLUMEN_USDT` (Mindest-24h-Handelsvolumen, filtert illiquide/
manipulierbare Micro-Caps raus, Default `1000000`), `PUMP_COOLDOWN_STUNDEN`
(kein erneuter Alarm für dieselbe Münze innerhalb dieser Zeit, Default `6`),
`PUMP_MAX_PRO_LAUF` (Default `10`). Braucht **keinen** `BINANCE_API_KEY` -
nutzt ausschließlich Binances öffentliche 24h-Ticker-Daten, kein Account
nötig. Läuft unabhängig vom Trading-Bot und handelt selbst nichts.

Gleicher Binance-IP-Block wie beim Trading-Bot - auch hier kein Zeitplan mehr,
nur `workflow_dispatch`. Noch kein Cloudflare-Worker-Ersatz gebaut (im
Gegensatz zum Trading-Bot); bei Bedarf gleiches Muster wie
`trading-bot-worker/` nachbauen.

**Geschäfts-Schwellwerte / Rabattcodes** (alle mit funktionierenden Defaults,
nur bei Bedarf überschreiben):
`VIP_UMSATZ_SCHWELLE`, `VIP_BESTELLUNGEN_SCHWELLE`, `VIP_RABATT_CODE`,
`WINBACK_TAGE`, `WINBACK_RABATT_CODE`, `WINBACK_RABATT_PROZENT`,
`NACHBESTELL_TAGE`, `NACHBESTELL_RABATT_CODE`, `SCHLAEFER_RABATT_CODE`,
`JUBILAEUM_RABATT_CODE`, `NEWSLETTER_RABATT_CODE`, `UPSELL_RABATT_CODE`,
`RABATT_CODE`, `RABATT_PROZENT`, `KAMPAGNEN_RABATT_CODE`, `MIN_UMSATZ`,
`MIN_BESTELLUNGEN`, `GROSS_SCHWELLE_WERT`, `GROSS_SCHWELLE_MENGE`,
`KAUF_VOR_TAGEN`, `TAGE_NACH_BESTELLUNG`, `FRAGE_TAGE`, `UGC_BELOHNUNG`,
`BEWERTUNG_LINK`, `FEEDBACK_ANREIZ`, `MIN_SPEND_FUER_BEWERTUNG`,
`MAX_EMPFAENGER`, `MIN_TEXTLAENGE`, `ANZAHL_ADS`, `ANZAHL_SKRIPTE`,
`MARKETING_BUDGET_MONAT`, `MONATSZIEL_UMSATZ`, `WERBEKOSTEN_PRO_TAG`,
`MIN_SPEND`, `MIN_SPEND_HEUTE`, `ROAS_ZIEL`, `KRITISCHER_ROAS`,
`SKALIER_PROZENT`, `MAX_TAGESBUDGET`, `AUTO_SKALIEREN`, `AUTO_PAUSE`,
`AUTO_STOP`, `AUTO_POST_FACEBOOK`, `KONKURRENT_URLS`, `VORLAUF_TAGE`,
`REICHWEITE_TAGE_WARNUNG`, `PRODUKTKOSTEN_PROZENT`

Alle Standardwerte stehen in `automations/lib/config.mjs`.

`AUTO_SKALIEREN`, `AUTO_STOP`, `AUTO_PAUSE`, `AUTO_POST_FACEBOOK`: stehen per
Default auf `nein` (nur Empfehlung/Alarm, nichts wird automatisch verändert).
Erst auf `ja` setzen, wenn du den Automationen vertraust, echte Budgets zu
ändern bzw. Ads zu pausieren.

## Die 50 Automationen (46 aus n8n + 4 neue)

| Nr | Skript | Zeitplan (UTC) | Zweck |
|---|---|---|---|
| 01 | Gewinn-Radar | täglich 08:00 | tägliche Gewinn-/Umsatz-Kennzahlen, speist auch Finance Cockpit |
| 02 | KI-Kundenservice | alle 10 Min | IMAP-Postfach lesen, Claude antwortet, Eskalation an Telegram |
| 04 | Bewertungs-Magnet | täglich 10:00 | fragt zufriedene Käufer nach Bewertungen |
| 05 | Winback-Maschine | täglich 11:00 | reaktiviert inaktive Kunden |
| 06 | Content-Kanone | täglich 07:30 | Social-Content-Ideen |
| 07 | Ad-Fabrik | montags 09:00 | Ad-Konzepte pro Woche |
| 08 | Trend-Scout | täglich 07:00 | Reddit-Trends für die Nische |
| 09 | Newsletter-Autopilot | donnerstags 09:00 | wöchentlicher Newsletter |
| 10 | VIP-Radar | täglich 12:00 | erkennt neue VIP-Kunden, dankt persönlich |
| 11 | Ads-Manager | täglich 08:30 | Ad-Performance-Übersicht |
| 12 | Marketing-Chef (KI-CMO) | sonntags 18:00 | Wochenstrategie |
| 13 | Willkommens-Booster | täglich 09:30 | Willkommens-Mail für Neukunden |
| 14 | Preis-Spion | täglich 06:00 | Konkurrenz-Preisbeobachtung |
| 15 | Warenkorb-Sequenz 3.0 | stündlich | Warenkorbabbrecher-Mails |
| 16 | Cross-Sell-Radar | täglich 15:00 | Zusatzverkauf-Empfehlungen |
| 17 | Promo-Kampagnen-Maschine | alle 14 Tage | Rabattkampagnen-Ideen |
| 18 | Multi-Plattform-Poster | täglich 16:00 | Social-Posts für mehrere Plattformen |
| 19 | Saison-Planer | 25. jedes Monats | saisonale Planung |
| 20 | Lager-Wächter | täglich 07:00 | Lagerbestand-Warnungen |
| 21 | Retouren-Detektiv | montags 09:00 | Retouren-Muster erkennen |
| 22 | Dead-Stock-Räumer | mittwochs 09:00 | Ladenhüter abverkaufen |
| 23 | Kunden-Jubiläum | täglich 10:30 | Kundschafts-Jubiläen feiern |
| 24 | Bundle-Bauer | freitags 10:00 | Produktbundles vorschlagen |
| 25 | Wetter-Marketing | täglich 08:00 | wetterbasiertes Marketing |
| 26 | Schläfer-Wecker | täglich 11:30 | inaktive Kunden reaktivieren |
| 27 | Wochen-Sieger-Report | sonntags 19:00 | wöchentlicher Bestseller-Report |
| 28 | SEO-Text-Doktor | dienstags 09:00 | SEO-Textverbesserungen |
| 29 | Zahlungs-Retter | täglich 14:00 | fehlgeschlagene Zahlungen retten |
| 30 | Bewertungs-Antwort-Bot | täglich 13:00 | beantwortet Kundenbewertungen |
| 31 | Umsatz-Prognose | sonntags 20:00 | Umsatzprognose |
| 32 | UGC-Anfrage-Automat | täglich 15:00 | bittet treue Kunden um UGC |
| 33 | Feiertags-Radar | täglich 07:15 | erkennt nahende Feiertage |
| 34 | Neukunden-Quellen-Report | montags 08:30 | Traffic-Quellen-Analyse |
| 35 | Lead-Magnet-Maschine | montags 08:00 | Lead-Gen-Ideen |
| 36 | FAQ-Bauer | donnerstags 08:00 | FAQ-Sektion generieren |
| 37 | Static-Ad-Fabrik XL | dienstags 07:30 | viele Static-Ad-Konzepte |
| 38 | UGC-Video-Skript-Fabrik | mittwochs 07:30 | Video-Skripte |
| 39 | Nachbestell-Erinnerung | täglich 09:45 | Nachbestell-Erinnerungen |
| 40 | Kunden-Feedback-Sammler | täglich 16:30 | Feedback einholen |
| 41 | Post-Purchase-Sofort-Upsell | stündlich | Upsell direkt nach Kauf |
| 42 | Meta-Ads-Auto-Skalierer | täglich 08:45 | skaliert gute Ad-Sets |
| 43 | Meta-Ads-Notbremse | alle 3 Stunden | stoppt Ads bei schlechtem ROAS |
| 44 | Winning-Ad neue Creatives | montags 07:00 | neue Varianten der besten Ad |
| 45 | Meta-Lookalike-Futter | montags 06:30 | Top-Kunden an Meta für Lookalikes |
| 46 | Großbestellung-Radar | stündlich | Alarm bei Großbestellungen |
| 47 | Länder-Expansions-Scout | 1. jedes Monats | Expansionsmarkt-Empfehlung |
| 48 | Google-Maps-Lead-Jäger | täglich 08:00 | findet Firmen ohne/mit schlechter Website, meldet per WhatsApp |
| 49 | ⚠️ Trading-Bot | manuell (Referenz) | Krypto-Spot-Handel (EMA-Crossover), Paper-Modus per Default. **Läuft produktiv als Cloudflare Worker**, siehe `trading-bot-worker/` - GitHub Actions wird von Binance blockiert (HTTP 451) |
| 50 | 🚀 Pump-Scanner | manuell (Referenz) | Alarm per WhatsApp, wenn eine Kryptowährung stark steigt (kein Handel). Gleicher Binance-IP-Block wie #49, noch kein Cloudflare-Ersatz gebaut |
| 51 | 🔎 Product Hunter | montags 08:00 | schlägt konkrete Produktideen vor, bewertet Nachfrage/Konkurrenz/Marge/Trend/Lieferzeit/Risiko (Claude-Einschätzung, keine Live-Trenddaten) |

**Hinweis zur Nummer 48:** der ursprüngliche n8n-Workflow 48 ("Review zu
Werbung") war in der Export-Datei korrupt (0 Byte) und konnte nicht
wiederhergestellt werden. Die freie Nummer wurde für den neuen, nicht aus n8n
stammenden Google-Maps-Lead-Jäger vergeben.
