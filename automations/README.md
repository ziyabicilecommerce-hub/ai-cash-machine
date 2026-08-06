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

**KI-Kundenservice / "Customer Support AI"** (liest Postfach per IMAP,
gleicht die echte Bestellung des Kunden bei Shopify ab, erstellt bei
Eskalation ein echtes GitHub-Issue-Ticket zusätzlich zum Telegram-Ping):
`IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`. Braucht zusätzlich
`SHOP`/`SHOPIFY_TOKEN` (für den Bestellabgleich, meist ohnehin schon
gesetzt). Die Ticket-Erstellung braucht **keinen zusätzlichen Secret** -
`GITHUB_TOKEN` wird von GitHub Actions automatisch bereitgestellt, der
Workflow (`automation-02-ki-kundenservice.yml`) hat dafür bewusst zusätzlich
`issues: write` angefordert (als einziger von allen 56 Workflows - Prinzip
der geringsten Rechte). Tickets landen als Issues mit Label `kundenservice`
in diesem Repo.

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

**🎥 Creative Studio** (Ad-Kreativ-Paket pro Produkt: Hooks, Ad-Copy,
UGC-Idee, Bild-Prompts): `CREATIVE_STUDIO_PRODUKTE` (kommagetrennt, z.B.
`Faltbare Klimmzugstange,Silikon-Küchenmatte XL` — ohne diesen Wert werden
automatisch die zuletzt vom Product Hunter vorgeschlagenen Produkte
genutzt), `CREATIVE_STUDIO_ANZAHL_PRODUKTE` (wie viele Produkte pro Lauf
bearbeitet werden, Default `1`). Merkt sich bereits bearbeitete Produkte.

Echte Bildgenerierung ist **optional**: mit `OPENAI_API_KEY` (platform.openai.com)
generiert die Automation tatsächlich ein Bild (DALL-E 3) aus dem ersten
Bild-Prompt und schickt es direkt per WhatsApp. Ohne Key liefert sie
trotzdem das komplette Text-Paket inkl. beider Bild-Prompts zum manuellen
Einsetzen in ein beliebiges Bildtool - kein Fehler, nur reduzierter
Funktionsumfang. Schlägt die Bildgenerierung fehl (z.B. abgelehnter Prompt),
kommt eine Warnung statt eines Absturzes, das Text-Paket wird trotzdem
verschickt.

**🛒 Store Builder & Optimizer** (legt Produktseiten als Shopify-Entwurf an,
prüft die Live-Storefront): `STORE_BUILDER_PRODUKTE` (kommagetrennt — ohne
diesen Wert automatisch die zuletzt vom Product Hunter vorgeschlagenen
Produkte), `STORE_BUILDER_ANZAHL_PRODUKTE` (Default `1`). Braucht `SHOP` +
`SHOPIFY_TOKEN` (wie die meisten Automationen) sowie Schreibrechte für
Produkte im Shopify Admin API Access Token. Neu angelegte Produkte werden
**immer als Entwurf** (`status: draft`) erstellt - erscheinen nie
automatisch im Shop, du musst sie bewusst selbst veröffentlichen.

Der Optimizer-Teil prüft zusätzlich `SHOP_URL` (deine echte Live-Storefront,
nicht die Admin-API) auf Ladezeit, HTTPS, Mobile-Tauglichkeit und ob
Impressum/AGB/Datenschutz/Kontakt/Bewertungen auf der Startseite verlinkt
sind - ein einfacher Heuristik-Check, kein vollständiger SEO-/A11y-Audit.
Bundle-Ideen aus echten Kaufdaten gibt es bereits separat in #24
Bundle-Bauer.

**🛡️ Compliance Guard** (prüft Produkte auf mögliche Compliance-Themen -
**ausdrücklich keine Rechtsberatung, nur Hinweise/Checkliste**):
`COMPLIANCE_GUARD_MAX_PRO_LAUF` (wie viele neue/ungeprüfte Produkte pro Lauf
geprüft werden, Default `20`). Braucht `SHOP`/`SHOPIFY_TOKEN` (liest den
echten Produktkatalog). Prüft auf CE/WEEE/Batterien-Themen bei Elektronik,
Verpackungsgesetz/LUCID-Erinnerung, Textilkennzeichnung, und riskante
Werbeaussagen/Health-Claims ("heilt", "garantiert" o.ä.). Jede Nachricht
enthält den Disclaimer, dass dies keine rechtsverbindliche Aussage ist -
bei echten Zweifeln immer einen Fachanwalt/Steuerberater fragen. Ergänzt
(nicht dupliziert) den Store Optimizer (#53), der die Pflichtseiten-
Verlinkung auf der Startseite prüft - Compliance Guard schaut auf
Produkt-Ebene. Merkt sich geprüfte Produkte dauerhaft (kein Re-Check bei
unveränderten Produkten).

**📦 Fulfillment & Supplier Hub** (verzögerte Bestellungen, Zustellungs-
probleme, Lieferanten-Ranking): `FULFILLMENT_VERZUG_STUNDEN` (ab wann eine
unbearbeitete Bestellung als verzögert gilt, Default `48`). Braucht nur
`SHOP`/`SHOPIFY_TOKEN` - **keinen separaten Dropshipping-/Fulfillment-API-
Zugang**. Nutzt Shopifys eigene Felder: `fulfillment_status` für offene
Bestellungen, `shipment_status` pro Sendung (von Shopify automatisch für
viele Versanddienste getrackt) für gescheiterte Zustellungen, und das
Produkt-Feld `vendor` für ein einfaches Lieferanten-Ranking nach
Verzögerungshäufigkeit. Lagerbestand-Warnungen gibt es bereits separat in
#20 Lager-Wächter. Für eine tiefere Anbindung an einen konkreten
Dropshipping-Anbieter (CJ Dropshipping, Zendrop etc.) müsste dessen
API-Key ergänzt werden - aktuell bewusst ohne, um nichts vorzutäuschen.

**📈 Ad Commander** (Kampagnen-Portfolio-Übersicht + Budget-Umschichtungs-
Empfehlung): nutzt dieselben `META_ACCESS_TOKEN`/`META_AD_ACCOUNT_ID` wie
die anderen Meta-Automationen, keine zusätzlichen Secrets. Anders als #11
Ads-Manager (bewertet einzelne ADS) und #42 Auto-Skalierer (Budget pro
AD-SET) schaut Ad Commander auf KAMPAGNEN-Ebene und schlägt vor, Budget von
schwachen zu starken Kampagnen zu verschieben. **TikTok Ads ist noch nicht
angebunden** - TikToks Marketing-API-Vertrag wurde nicht verifiziert
(anders als Meta/Binance/OpenAI, deren Endpunkte bekannt/geprüft sind).
Lieber offen und in jeder Nachricht sichtbar als raten und stillschweigend
falsche Felder verwenden. Bei echtem TikTok-Ads-Account und Bedarf
nachrüstbar.

**❤️ CRM & Retention Engine** (Kundenstamm-Segmentierung + personalisierte
At-Risk-Angebote): `CRM_AT_RISK_TAGE` (ab wann ein wertvoller Kunde als
gefährdet gilt, Default `45`), `CRM_SMS_TOP_N` (wie viele der wertvollsten
At-Risk-Kunden zusätzlich per SMS angeschrieben werden, Default `3`),
`CRM_MAX_PRO_LAUF` (Default `10`). Nutzt `VIP_UMSATZ_SCHWELLE` (bereits
vorhanden) für die Werteinteilung. Braucht `SHOP`/`SHOPIFY_TOKEN`.

Anders als #05 Winback-Maschine (schickt ALLEN Inaktiven denselben
Rabattcode) segmentiert dieses Skript den GESAMTEN Kundenstamm nach
Customer-Lifetime-Value und schickt nur den wertvollsten gefährdeten
Kunden ein individuell auf sie zugeschnittenes Angebot. Wöchentlicher
Kundenstamm-Digest per WhatsApp (VIP/At-Risk/Neu/Ruhend-Zahlen).

**SMS ist optional** (erste SMS-Fähigkeit der Suite, via Twilio):
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. Ohne diese
Secrets läuft alles normal weiter, nur eben ohne SMS - bewusst nur für die
wenigen wertvollsten Fälle reserviert, kein Massen-SMS-Versand. Ein Kunde
wird höchstens alle 90 Tage erneut kontaktiert (kein Spam bei wiederholten
Läufen).

**🎯 Brand Assassin Auto-Scan** (Markt-Scan aus der Brand-Assassin-App
automatisch, wöchentlich): keine neuen Secrets, nutzt `SHOP_NISCHE`
(bereits vorhanden) und die üblichen `ANTHROPIC_API_KEY`/`WHATSAPP_*`.
Ohne `SHOP_NISCHE` überspringt sich die Automation selbst.

Wichtig zur Einordnung: **Brand Assassin selbst bleibt unverändert live und
interaktiv** - Product Scan, Creative-Analyse und Brand-Audit brauchen
jeweils eine konkrete Eingabe (welches Produkt, welcher Ad-Text, welche
Brand) und können deshalb nicht "von selbst" laufen. Nur der Markt-Scan hat
mit `SHOP_NISCHE` einen sinnvollen Fixwert und läuft deshalb automatisch,
mit demselben Prompt/JSON-Format wie in der App. **Jarvis** hat als reiner
Chat-Hub keinen vergleichbaren wiederkehrenden Task - sein automatisches
Gegenstück ist bereits die App Oracle (tägliches Briefing).

**🔮 Oracle Auto-Briefing** (tägliches Briefing aus der Oracle-App
automatisch, per WhatsApp): keine neuen Secrets, liest
`finance-cockpit/data.json` (von #01 Gewinn-Radar gefüllt) und nutzt die
üblichen `ANTHROPIC_API_KEY`/`WHATSAPP_*`. Läuft 30 Minuten nach dem
Gewinn-Radar, damit die Daten schon aktuell sind. Ohne `data.json` (Gewinn-
Radar noch nie gelaufen) überspringt sich die Automation selbst. Nutzt
exakt denselben Prompt (LAGE/ANALYSE/BEFEHL/PROGNOSE) wie `buildPrompt()`
in `oracle/index.html` - die App selbst bleibt unverändert live, inkl.
"Neu generieren"-Button.

**Hinweis zu Closer:** bleibt bewusst rein interaktiv. Es ist ein
Live-Rollenspiel-Verkaufstraining ohne festen Input (anders als Oracles
Finanzzahlen oder Brand Assassins Nische) - ein automatisch generiertes
Übungsgespräch hätte keinen sinnvollen Nutzen zum passiven Empfangen.

**👔 Chef-Agent** (fasst Finanzen/Fulfillment/Kundenstamm zu EINER
Tagesansage zusammen, statt einzelner Nachrichten aus jeder Automation):
keine neuen Secrets, nutzt `SHOP`/`SHOPIFY_TOKEN` + die üblichen
`ANTHROPIC_API_KEY`/`WHATSAPP_*` sowie bereits vorhandene Schwellwerte
(`FULFILLMENT_VERZUG_STUNDEN`, `VIP_UMSATZ_SCHWELLE`, `CRM_AT_RISK_TAGE`).
Berechnet die 3 wichtigsten Signale FRISCH aus Shopify + dem stabilen
`finance-cockpit/data.json`-Format (bewusst NICHT an interne State-Dateien
anderer Automationen gekoppelt, um nicht bei jeder dortigen Änderung zu
brechen). Trifft eine echte Priorisierungs-Entscheidung ("worauf es heute
ankommt"), nicht nur eine Zahlen-Liste. Fällt ein Bereich aus (z.B.
Shopify-API-Fehler), wird das als "keine Daten" markiert statt die ganze
Automation abstürzen zu lassen - die anderen Bereiche laufen normal weiter.
Läuft abends (20:00 UTC), nach den meisten anderen Automationen.

**💬 Kunden-Chat-Agent** (kein Eintrag in der Tabelle unten - läuft wie der
Trading-Bot als eigener Cloudflare Worker, nicht als GitHub-Actions-
Automation): siehe `customer-agent-worker/README.md`. Beantwortet allgemeine
Kundenfragen auf der Website (Versand, Rückgabe, Produkte) über ein
einbettbares Chat-Widget. Läuft serverseitig, damit der `ANTHROPIC_API_KEY`
des Shop-Besitzers nie im Browser fremder Besucher landet (anders als die
BYOK-Apps Jarvis/Brand Assassin/Oracle/Closer, die nur der Shop-Besitzer
selbst nutzt). Erfindet nie Bestell-/Kontodaten, verweist dafür an
`SUPPORT_EMAIL`. Pro-Besucher-Rate-Limit + globales Tages-Token-Budget über
Cloudflare KV, CORS auf die eigene Shop-Domain beschränkt.

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

**Profit & Tax Center** (Finance-Cockpit-Erweiterung um Gebühren/Steuern -
achter Baustein des 9-Systeme-Wunschs, keine eigene Automation sondern
Ausbau von #01 Gewinn-Radar + `finance-cockpit/`): `ZAHLUNGSGEBUEHR_PROZENT`
(Default `2.5`, typischer Shopify-Payments-/Stripe-Satz),
`ZAHLUNGSGEBUEHR_FIX_CENT` (Default `25`, Fixgebühr pro Bestellung in Cent),
`UMSATZSTEUER_PROZENT` (Default `19`, deutscher Regelsteuersatz - der
Umsatz aus Shopify ist brutto inkl. MwSt., die gehört ans Finanzamt statt
zum echten Gewinn). Alles wie gehabt nur Schätzwerte auf Basis dieser
Prozentsätze, keine echte Buchhaltung - für exakte Zahlen bitte
Steuerberater/echte Buchhaltungssoftware nutzen. Finance Cockpit zeigt
jetzt zusätzlich Gebühren/Steuer-Anteil in der Aufschlüsselung und einen
geschätzten Nettogewinn pro Top-Produkt. Ältere `finance-cockpit/data.json`-
Einträge ohne diese Felder werden weiterhin korrekt angezeigt (Fallback auf
den alten `gewinn`-Wert).

Alle Standardwerte stehen in `automations/lib/config.mjs`.

`AUTO_SKALIEREN`, `AUTO_STOP`, `AUTO_PAUSE`, `AUTO_POST_FACEBOOK`: stehen per
Default auf `nein` (nur Empfehlung/Alarm, nichts wird automatisch verändert).
Erst auf `ja` setzen, wenn du den Automationen vertraust, echte Budgets zu
ändern bzw. Ads zu pausieren.

## Die 5 neuen Agenten (#61-65) - echte Handlungsmacht statt nur Empfehlung

Unterschied zu den meisten anderen Automationen: diese hier SCHREIBEN
selbstständig in Shopify/Meta/E-Mail, statt nur einen Bericht zu schicken -
deshalb "Agenten". Wie schon bei `AUTO_SKALIEREN` (#42) etabliert: alles, was
echtes Geld bewegt (Preise, Ad-Budgets, Nachbestellungen), steht per Default
auf `nein`/nur-Empfehlung und muss bewusst aktiviert werden. Alles rein
Schützende/Reversible (Inventory-Guardian) ist per Default AN. Nichts hier
storniert jemals automatisch eine Bestellung oder gibt eine Zahlung frei.

**💰 Pricing-Agent** (#61, täglich 06:45): passt Verkaufspreise anhand des
Verkaufstempos an - schnelldrehende Artikel (Reichweite unter
`REICHWEITE_TAGE_WARNUNG`) werden vorsichtig teurer, 14 Tage unverkaufte
Artikel vorsichtig günstiger. Harte Preisuntergrenze über den echten
Shopify-Einkaufspreis (falls hinterlegt, sonst Schätzung über
`PRODUKTKOSTEN_PROZENT`) + `PREIS_MIN_MARGE_PROZENT` - der Agent unterbietet
nie die eigene Marge. Max. Änderung pro Lauf: `PREIS_MAX_AENDERUNG_PROZENT`
(Default 15%). Gate: `AUTO_PREISANPASSUNG` (Default `nein`).

**🚨 Risk-Guard-Agent** (#62, alle 2 Stunden): prüft neue Bestellungen ab
`RISK_GUARD_MIN_BESTELLWERT` auf Betrugssignale (Rechnungs-/Lieferland-
Mismatch, ungewöhnlich hohe Erstbestellung), lässt Claude die Risikostufe
einschätzen, markiert verdächtige Bestellungen mit einem echten Shopify-Tag
(`risiko-pruefung`) + erstellt ein GitHub-Ticket + Alarm. **Storniert oder
hält NIE automatisch eine Bestellung zurück** - nur Tag + Mensch alarmieren,
bewusst kein `AUTO_*`-Schalter nötig, da nicht-destruktiv.

**📦 Reorder-Agent** (#63, täglich 07:45): erkennt Artikel, die vor
Eintreffen einer Nachbestellung (`REORDER_LIEFERZEIT_TAGE`) ausverkauft
wären, berechnet die nötige Menge (`REORDER_PUFFER_TAGE` Sicherheitspuffer)
und schickt eine echte Bestell-Mail an `SUPPLIER_EMAIL`. Merkt sich bereits
angefragte Artikel, um den Lieferanten nicht mit Wiederholungen zu spammen.
Gate: `AUTO_BESTELLUNG_SENDEN` (Default `nein`).

**📊 Ads-Autopilot-Agent** (#64, täglich 09:00): schichtet Budget vom
schwächsten zum stärksten aktiven Meta-Ad-Set um (max.
`ADS_AUTOPILOT_MAX_SHIFT_PROZENT`, nie unter eine Mindest-Budget-Grenze).
Ergänzt #42 (erhöht nur, nimmt nichts weg) und #43 (stoppt nur) - ist der
einzige, der wirklich zwischen Ad-Sets umverteilt, statt nur zu skalieren
oder zu stoppen. Gate: `AUTO_BUDGET_UMSCHICHTEN` (Default `nein`).

**🛡️ Inventory-Guardian-Agent** (#65, alle 3 Stunden): stoppt echten
Überverkauf - wenn eine Variante auf Bestand 0 fällt, aber Shopify sie wegen
`inventory_policy=continue` trotzdem weiterverkaufen würde, schaltet der
Agent auf `deny` um. Sobald wieder Bestand da ist, macht er die Änderung
automatisch rückgängig (exakt die ursprüngliche Einstellung, gespeichert im
State). Gate: `AUTO_UEBERVERKAUF_STOPPEN` (Default `ja` - rein schützend und
reversibel, anders als die geld-bewegenden Agenten oben).

**🎁 Treue-Punkte-Engine** (#66, täglich 10:00): echtes Kundenbindungs-
Programm - jeder Euro Umsatz zählt als Punkte (`LOYALTY_PUNKTE_PRO_EURO`),
sobald ein Kunde `LOYALTY_SCHWELLE_PUNKTE` erreicht, erstellt der Agent
einen ECHTEN, einmalig gültigen Shopify-Rabattcode
(`LOYALTY_BELOHNUNG_PROZENT`) und schickt ihn per E-Mail zu - die erste
Automation, die die seit langem im Code liegende `createDiscountCode()`
tatsächlich nutzt. Läuft kontinuierlich für jeden Kunden mit (kein
Einmal-Ereignis wie #10 VIP-Radar), Punktestand lebt im eigenen State
(Shopify hat kein natives Punkte-Feld ohne Zusatz-App). Kein `AUTO_*`-
Schalter nötig - die Rabattcodes sind einmalig, prozentual und kosten den
Shop nichts, bis ein Kunde sie tatsächlich einlöst.

## 10 weitere Automationen (#67-76)

**🎟️ Gift-Card-Kompensations-Agent** (#67, täglich 11:00): erkennt echte
Service-Fehler (sehr lange unbearbeitete Bestellung ab
`GIFTCARD_VERZUG_STUNDEN`, Default 96h - deutlich strenger als Fulfillment
Hubs 48h, oder eine laut Shopify gescheiterte Zustellung) und erstellt
proaktiv einen echten Shopify-Gutschein (`GIFTCARD_KOMPENSATION_WERT`) als
Wiedergutmachung, bevor der Kunde sich überhaupt beschweren muss. Gate:
`AUTO_GUTSCHEIN_SENDEN` (Default `nein`).

**📝 Sonderwunsch-Flagger** (#68, alle 2 Stunden): liest echte
Bestellnotizen (Geschenkverpackung, Express-Wunsch, Kärtchen-Text) und
meldet sie gebündelt, damit beim Verpacken nichts übersehen wird. Rein
meldend.

**⚖️ DSGVO-Anfragen-Wächter** (#69, alle 2 Stunden): liest dasselbe
Postfach wie #02 KI-Kundenservice (eigener, unabhängiger Zustand), erkennt
aber NUR fristkritische Datenschutz-Anfragen (Auskunft/Löschung/
Widerspruch) und eskaliert sofort mit Frist-Hinweis (`DSGVO_FRIST_TAGE`,
Default 30 Tage) - beantwortet oder löscht selbst nichts, das bleibt
bewusst Menschenwerk.

**🚀 Produkt-Launch-Hype-Agent** (#70, alle 3 Stunden): merkt automatisch,
wenn ein Produkt neu auf "aktiv" gesetzt wird (egal ob manuell oder über
#53 Store Builder), und verschickt eine echte Launch-Ankündigung an die
Newsletter-Liste (`LAUNCH_HYPE_MAX_EMPFAENGER`). Erstlauf liest nur den
Bestand ein, kein rückwirkendes Hype für Altprodukte.

**📉 Margen-Erosions-Wächter** (#71, täglich 06:15): vergleicht den echten
Shopify-Einkaufspreis jeder Variante mit dem zuletzt bekannten Wert - steigt
er deutlich (`MARGE_WARNUNG_SCHWELLE_PROZENT`), der Verkaufspreis aber
nicht mit, warnt der Agent, bevor die Marge unbemerkt wegschmilzt. Rein
meldend, ändert selbst keine Preise (das bleibt dem Pricing-Agent
vorbehalten).

**🔗 Broken-Link-Guardian** (#72, täglich 05:00): ruft die echten
Produktseiten-URLs im eigenen Shop auf (`BROKEN_LINK_MAX_PRODUKTE`) und
meldet, welche nicht mehr erreichbar sind.

**🪞 Duplikat-Listing-Detektor** (#73, montags 08:15): vergleicht alle
aktiven Produkttitel per lokal berechneter Textähnlichkeit
(`DUPLIKAT_AEHNLICHKEIT_SCHWELLE`) - kein Claude-Aufruf nötig, kostet keine
Tokens - und meldet fast-identische Doppel-Listings.

**💸 Refund-Concierge-Agent** (#74, alle 2 Stunden): übernimmt die
Mehrschritt-Arbeit einer echten Shopify-Erstattung, aber NUR für
Bestellungen, die ein Mensch im Shopify-Adminbereich mit dem Tag
"erstattung-genehmigt" markiert hat UND unter `REFUND_MAX_BETRAG` liegen.
Bewusst kein vollautomatischer Beschwerde-Agent - der Mensch entscheidet
WAS erstattet wird, der Agent nur WIE. Gate: `AUTO_ERSTATTUNG_GENEHMIGEN`
(Default `nein`).

**🌍 Übersetzungs-Entwurf-Agent** (#75, dienstags 09:15): übersetzt
Produkttexte für neue Zielmärkte (`TRANSLATION_ZIELSPRACHEN`, z.B. "en,fr")
und schickt den Entwurf per Mail - schreibt bewusst NICHT direkt in
Shopifys Translate-&-Adapt-API zurück (deren genauer GraphQL-Vertrag wurde
nicht gegen einen echten Account verifiziert, gleiches Prinzip wie bei
TikTok Ads in #56).

**🎯 Nie-Gekauft-Konverter** (#76, mittwochs 10:15): findet Newsletter-
Abonnenten, die seit `NIEGEKAUFT_TAGE_ALS_ABONNENT` Tagen dabei sind, aber
noch NIE bestellt haben, und schickt einen speziellen Erstkauf-Anreiz -
schließt die Top-of-Funnel-Lücke, die weder #05 Winback (zielt auf
Ex-Käufer) noch #13 Willkommens-Booster (zielt auf frische Erstkäufer)
abdecken.

Alle Standardwerte stehen in `automations/lib/config.mjs`.

## Die 75 Automationen (46 aus n8n + 29 neue)

| Nr | Skript | Zeitplan (UTC) | Zweck |
|---|---|---|---|
| 01 | Gewinn-Radar / "Profit & Tax Center" | täglich 08:00 | tägliche Gewinn-/Umsatz-Kennzahlen inkl. Zahlungsgebühren, Umsatzsteuer-Anteil und echtem Nettogewinn pro Produkt - speist Finance Cockpit |
| 02 | KI-Kundenservice ("Customer Support AI") | alle 10 Min | IMAP-Postfach lesen, echter Bestellabgleich, Claude antwortet, Eskalation per Telegram + echtes GitHub-Issue-Ticket |
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
| 52 | 🎥 Creative Studio | mittwochs 08:00 | Ad-Kreativ-Paket pro Produkt: Hooks, Ad-Copy, UGC-Idee, Bild-Prompts + optional echte Bildgenerierung |
| 53 | 🛒 Store Builder & Optimizer | freitags 08:00 | legt Produktseiten als Shopify-Entwurf an + prüft die Live-Storefront auf Geschwindigkeit/Vertrauen/Conversion-Basics |
| 54 | 🛡️ Compliance Guard | 1. jedes Monats | prüft Produkte auf CE/WEEE/Verpackung/Werbeaussagen-Themen - nur Hinweise/Checkliste, KEINE Rechtsberatung |
| 55 | 📦 Fulfillment & Supplier Hub | täglich 09:00 | erkennt verzögerte Bestellungen, Zustellungsprobleme und rankt Lieferanten - nutzt nur die bestehende Shopify-Verbindung |
| 56 | 📈 Ad Commander | montags 08:00 | Kampagnen-Portfolio-Übersicht (Meta) mit Budget-Umschichtungs-Empfehlung zwischen Kampagnen; TikTok noch nicht angebunden |
| 57 | ❤️ CRM & Retention Engine | dienstags 09:00 | segmentiert den Kundenstamm (VIP/At-Risk/treu/neu/ruhend), personalisierte Angebote für die wertvollsten inaktiven Kunden + optional SMS |
| 58 | 🎯 Brand Assassin Auto-Scan | donnerstags 08:00 | lässt den Markt-Scan aus der Brand-Assassin-App automatisch für SHOP_NISCHE laufen, gleicher Prompt/Score wie in der App |
| 59 | 🔮 Oracle Auto-Briefing | täglich 08:30 | lässt das tägliche KI-Briefing aus der Oracle-App automatisch laufen und per WhatsApp verschicken, gleicher Prompt wie in der App |
| 60 | 👔 Chef-Agent | täglich 20:00 | fasst Finanzen/Fulfillment/Kundenstamm zu EINER priorisierten Tagesansage zusammen statt einzelner Automations-Nachrichten |
| 61 | 💰 Pricing-Agent | täglich 06:45 | passt echte Verkaufspreise ans Verkaufstempo an (rauf bei Schnelldrehern, runter bei Ladenhütern), harte Marge-Untergrenze |
| 62 | 🚨 Risk-Guard-Agent | alle 2 Stunden | prüft neue Bestellungen auf Betrugssignale, markiert Verdachtsfälle mit echtem Shopify-Tag + Ticket - storniert nie automatisch |
| 63 | 📦 Reorder-Agent | täglich 07:45 | erkennt drohende Ausverkäufe vor Lieferzeit-Ende, schickt echte Nachbestell-Mail an den Lieferanten |
| 64 | 📊 Ads-Autopilot-Agent | täglich 09:00 | schichtet Meta-Ad-Budget vom schwächsten zum stärksten aktiven Ad-Set wirklich um (nicht nur Empfehlung) |
| 65 | 🛡️ Inventory-Guardian-Agent | alle 3 Stunden | stoppt echten Überverkauf bei Bestand 0, gibt automatisch wieder frei sobald Nachschub da ist |
| 66 | 🎁 Treue-Punkte-Engine | täglich 10:00 | echtes Punkteprogramm - Umsatz sammelt Punkte, bei Schwelle wird ein echter Shopify-Rabattcode erstellt und per Mail verschickt |
| 67 | 🎟️ Gift-Card-Kompensations-Agent | täglich 11:00 | echte Gutscheine bei echten Service-Fehlern (langer Verzug/gescheiterte Zustellung), bevor sich der Kunde beschwert |
| 68 | 📝 Sonderwunsch-Flagger | alle 2 Stunden | findet Bestellnotizen (Geschenkverpackung, Express etc.), die beim Verpacken sonst übersehen werden |
| 69 | ⚖️ DSGVO-Anfragen-Wächter | alle 2 Stunden | erkennt fristkritische Datenschutz-Anfragen in der Support-Inbox, eskaliert sofort mit Frist |
| 70 | 🚀 Produkt-Launch-Hype-Agent | alle 3 Stunden | erkennt draft→aktiv Produktwechsel, verschickt echte Launch-Ankündigung an die Newsletter-Liste |
| 71 | 📉 Margen-Erosions-Wächter | täglich 06:15 | warnt, wenn Einkaufspreise steigen, aber der Verkaufspreis nicht mitzieht |
| 72 | 🔗 Broken-Link-Guardian | täglich 05:00 | ruft echte Produktseiten-URLs auf und meldet, welche nicht mehr erreichbar sind |
| 73 | 🪞 Duplikat-Listing-Detektor | montags 08:15 | findet fast-identische Produkt-Titel im Katalog per Textähnlichkeit, ohne Claude-Aufruf |
| 74 | 💸 Refund-Concierge-Agent | alle 2 Stunden | bearbeitet kleine, per Tag freigegebene Erstattungen automatisch, mit Obergrenze |
| 75 | 🌍 Übersetzungs-Entwurf-Agent | dienstags 09:15 | übersetzt Produkttexte für neue Zielmärkte als Entwurf per Mail |
| 76 | 🎯 Nie-Gekauft-Konverter | mittwochs 10:15 | Newsletter-Abonnenten, die noch nie bestellt haben, bekommen einen Erstkauf-Anreiz |

**Hinweis zur Nummer 48:** der ursprüngliche n8n-Workflow 48 ("Review zu
Werbung") war in der Export-Datei korrupt (0 Byte) und konnte nicht
wiederhergestellt werden. Die freie Nummer wurde für den neuen, nicht aus n8n
stammenden Google-Maps-Lead-Jäger vergeben.
