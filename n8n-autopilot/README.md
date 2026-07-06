# 🤖💰 E-Com Marketing-Autopilot — 14 n8n-Workflows

**14 fertige n8n-Workflows, die dein Shop-Marketing komplett auf Autopilot stellen — inklusive KI-Ads-Manager und deinem persönlichen KI-Marketing-Chef.**
Importieren → Keys eintragen → aktivieren → läuft. Nichts davon fasst deine Website an.

---

## 🗺️ Was du bekommst

| # | Workflow | Was er macht | Wann er läuft | Warum er Geld bringt |
|---|----------|--------------|---------------|----------------------|
| 01 | 🛒 **Warenkorb-Retter** | Findet verlassene Warenkörbe, Claude schreibt jedem Kunden eine persönliche Rückhol-Mail mit Rabattcode | alle 30 Min | ~70% aller Warenkörbe werden abgebrochen — jede zurückgeholte Bestellung ist Geld, das sonst weg wäre |
| 02 | 🤖 **KI-Kundenservice** | Liest jede Kundenmail, beantwortet Standardfragen selbst, eskaliert heikle Fälle per Telegram an dich (mit fertigem Antwort-Entwurf) | bei jeder Mail | Spart dir täglich Stunden — und schnelle Antworten = weniger Stornos |
| 03 | 📊 **Gewinn-Radar** | Umsatz, Bestellungen, AOV, geschätzter Gewinn von gestern + 3 konkrete Handlungsempfehlungen | täglich 08:00 | Du weißt jeden Morgen in 30 Sekunden, wo du stehst und was heute zu tun ist |
| 04 | ⭐ **Bewertungs-Magnet** | Fragt Kunden 7 Tage nach Versand automatisch nach einer Bewertung + UGC-Foto | täglich 10:00 | Bewertungen = höhere Conversion = mehr Umsatz mit dem gleichen Traffic |
| 05 | 🔄 **Winback-Maschine** | Findet Kunden, die vor 60 Tagen gekauft und seitdem nichts bestellt haben — Claude schreibt persönliche Comeback-Mails | täglich 11:00 | Einen Bestandskunden zu reaktivieren ist 5x billiger als einen neuen zu gewinnen |
| 06 | 🎬 **Content-Kanone** | Jeden Morgen: 3 TikTok-Hooks, 1 komplettes Video-Skript, 1 Insta-Caption, 1 Story-Idee — basierend auf deinen echten Bestsellern, jeden Tag ein anderer viraler Winkel | täglich 07:30 | Nie wieder „was poste ich heute?" — du filmst nur noch ab |
| 07 | 🎯 **Ad-Fabrik** | Analysiert deine Top-Produkte der letzten 30 Tage und baut das komplette Werbe-Paket: 5 Hooks, 2 UGC-Skripte, Meta-Ad-Texte, Targeting-Ideen, A/B-Test der Woche | montags 09:00 | Fertige Ads aus deinen ECHTEN Verkaufsdaten statt Bauchgefühl |
| 08 | 🔭 **Trend-Scout** | Scannt täglich die heißesten E-Com-Diskussionen im Netz und destilliert daraus 3 konkrete Chancen für DEINE Nische | täglich 07:00 | Du siehst Trends bevor die Konkurrenz sie sieht |
| 09 | 📰 **Newsletter-Autopilot** | Schreibt jeden Donnerstag deinen kompletten Wochen-Newsletter (70% Mehrwert, 30% Verkauf) aus deinem Produktkatalog + Bestsellern | donnerstags 09:00 | E-Mail ist der profitabelste Marketing-Kanal überhaupt — jetzt kostet er dich 2 Min/Woche |
| 10 | 👑 **VIP-Radar** | Erkennt automatisch deine besten Kunden (Umsatz/Bestellanzahl über Schwelle) und schickt ihnen eine persönliche Dankes-Mail vom „Gründer" + VIP-Code. Du kriegst einen Telegram-Alarm | täglich 12:00 | 20% deiner Kunden machen 80% deines Umsatzes — die musst du wie Könige behandeln |
| 11 | 🎛️ **Ads-Manager** | Zieht täglich deine Meta-Ads-Performance, bewertet jede Ad (💀 killen / 🚀 skalieren / 👀 beobachten), erkennt Muster bei Gewinnern & Verlierern, schlägt Budgets vor — und kann Geldverbrenner auf Wunsch **automatisch pausieren** | täglich 08:30 | Schlechte Ads verbrennen Geld im Schlaf — der hier schläft nie |
| 12 | 🧠 **Marketing-Chef (KI-CMO)** | Dein persönlicher Marketing-Chef: vergleicht Woche vs. Vorwoche, checkt dein Monatsziel, gibt dir 3 Prioritäten, Budget-Verteilung, 1 Wachstums-Experiment und 1 Stopp-Empfehlung — voll ausformuliert per Mail + Kurzfassung per Telegram | sonntags 18:00 | Wie ein CMO für 100k im Jahr — nur dass deiner Cent-Beträge kostet |
| 13 | 🤝 **Willkommens-Booster** | Jeder Erstkäufer bekommt am Tag nach dem Kauf eine herzliche Willkommens-Mail mit Profi-Tipp zum gekauften Produkt + Social-Follow-Einladung — bewusst OHNE Verkaufsdruck | täglich 09:30 | Die erste Mail nach dem Erstkauf entscheidet, ob jemand Stammkunde wird |
| 14 | 🕵️ **Preis-Spion** | Beobachtet täglich die Produktseiten deiner Konkurrenten, merkt sich die Preise und schlägt Alarm, sobald jemand den Preis ändert oder einen Sale startet | täglich 06:00 | Du erfährst von Preiskämpfen, bevor sie dich Umsatz kosten |

---

## 🚀 Setup in 5 Schritten (~20 Minuten)

### Schritt 1: Shopify-Token holen (5 Min)

1. Shopify Admin → **Einstellungen → Apps und Vertriebskanäle → Apps entwickeln**
2. **App erstellen** → Name z.B. `n8n-autopilot`
3. **Admin-API-Zugriffsbereiche** aktivieren:
   - `read_orders`
   - `read_products`
   - `read_customers`
   - `read_checkouts`
4. **App installieren** → **Admin-API-Zugriffstoken** kopieren (fängt mit `shpat_` an — wird nur EINMAL angezeigt!)
5. Deine Shop-Subdomain notieren: bei `https://mein-laden.myshopify.com` ist es `mein-laden`

### Schritt 2: Claude API-Key holen (3 Min)

1. [console.anthropic.com](https://console.anthropic.com) → Account erstellen
2. **API Keys** → **Create Key** → kopieren (fängt mit `sk-ant-` an)
3. Guthaben aufladen (5–10 € reichen für Wochen, siehe Kosten unten)

### Schritt 3: Telegram-Bot bauen (3 Min)

1. In Telegram [@BotFather](https://t.me/BotFather) anschreiben → `/newbot` → Namen vergeben → **Bot-Token** kopieren
2. Deinem neuen Bot irgendeine Nachricht schicken (wichtig, sonst darf er dir nicht schreiben!)
3. Im Browser öffnen: `https://api.telegram.org/bot<DEIN_TOKEN>/getUpdates` → in der Antwort steht `"chat":{"id":123456789}` → das ist deine **Chat-ID**

### Schritt 3b: Meta-Ads-Token holen (nur für Workflow 11 · Ads-Manager, 5 Min)

1. [developers.facebook.com](https://developers.facebook.com) → **Meine Apps → App erstellen** (Typ: Business)
2. Produkt **Marketing API** hinzufügen
3. **Werkzeuge → Graph API Explorer** → deine App auswählen → Berechtigungen `ads_read` und `ads_management` anfordern → **Access Token generieren**
4. Token verlängern: **Werkzeuge → Access Token Debugger** → „Verlängern" (60 Tage gültig; für dauerhaft: System-User-Token im Business Manager anlegen)
5. Deine **Werbekonto-ID** findest du im [Ads Manager](https://adsmanager.facebook.com) oben links (nur die Zahlen, ohne `act_`)
6. ⚠️ `AUTO_PAUSE` steht standardmäßig auf `nein` — der Workflow gibt dann nur Empfehlungen. Erst auf `ja` stellen, wenn du ihm nach ein paar Tagen vertraust. Für Auto-Pause braucht der Token `ads_management`.

### Schritt 4: In n8n einrichten (5 Min)

1. n8n öffnen → **Workflows → Import from File** → alle 14 Dateien aus `workflows/` importieren
2. In jedem Workflow den Node **„⚙️ Setup"** öffnen und deine Werte eintragen (SHOP, Token, Keys, E-Mails, Nische, Zielgruppe…)
3. **SMTP-Zugangsdaten** anlegen (für die E-Mail-Workflows 01, 02, 04, 05, 07, 09, 10, 12, 13):
   n8n → Credentials → **SMTP** → Daten deines Mail-Anbieters eintragen
   (bei Gmail: App-Passwort nutzen; besser: der SMTP deiner Shop-Domain für gute Zustellbarkeit)
4. **IMAP-Zugangsdaten** anlegen (nur für 02 · KI-Kundenservice):
   n8n → Credentials → **IMAP** → Postfach deiner Support-Adresse
5. n8n-Einstellungen → **Timezone auf `Europe/Berlin`** stellen (sonst laufen die Zeitpläne nach UTC)

### Schritt 5: Testen → Scharfschalten

1. Workflows **01, 02, 04, 05, 10, 13** haben im Setup ein Feld **`TEST_MODE`** = `ja`
   → Alle Kunden-Mails gehen erstmal **an DICH** statt an Kunden. So prüfst du Qualität ohne Risiko.
2. Jeden Workflow einmal manuell ausführen (**Test Workflow**-Button) und Ergebnis prüfen
3. Wenn alles gut aussieht: `TEST_MODE` auf `nein` stellen
4. Jeden Workflow oben rechts auf **Active** schalten ✅

> ⚠️ **Wichtig:** Die Duplikat-Sperre (damit kein Kunde zweimal angeschrieben wird) funktioniert nur bei **aktiven** Workflows, nicht im manuellen Test-Modus. Also: erst TEST_MODE nutzen, dann aktivieren.

---

## 💶 Was kostet der Spaß?

| Posten | Kosten |
|--------|--------|
| n8n (self-hosted / Starter-Cloud) | 0–20 €/Monat |
| Claude API (Modell `claude-opus-4-8`) | je nach Bestellvolumen meist **2–15 €/Monat** |
| Telegram, Reddit, SMTP | 0 € |

**Spartipp:** Wenn du Kosten drücken willst, kannst du in den 🤖-Claude-Nodes das Modell von `claude-opus-4-8` auf `claude-haiku-4-5` ändern (5x billiger). Empfehlung: Opus für alles, was Kunden lesen (01, 02, 04, 05, 09) — Haiku höchstens für interne Reports (03, 08). Qualität der Kunden-Mails ist bares Geld.

---

## 🔧 Feintuning

- **Rabatt-Codes:** Die Codes aus Setup (`COMEBACK10`, `WILLKOMMEN15`) musst du einmalig in Shopify anlegen: Admin → Rabatte → Rabatt erstellen
- **Nische & Zielgruppe:** Je genauer du `SHOP_NISCHE` und `ZIELGRUPPE` in den Setups von 06/07/08/09 beschreibst, desto besser wird der Content. Schreib ruhig 2–3 Sätze rein.
- **Zeitpläne ändern:** Einfach den ⏰-Trigger-Node im jeweiligen Workflow anpassen
- **Winback-Timing:** `WINBACK_TAGE` in Workflow 05 (Standard 60) an deinen Kaufzyklus anpassen — Verbrauchsprodukte eher 30–45, langlebige eher 90
- **Prompts anpassen:** Die kompletten Claude-Anweisungen stehen in den 🧠-Code-Nodes — da kannst du Tonalität, Länge, Stil ändern wie du willst

## ⚠️ Rechtliches (kurz & wichtig)

- **Workflow 01 (Warenkorb) & 04 (Bewertung):** Mails an Kunden im Kontext ihrer Bestellung sind i.d.R. okay — Impressum + Abmeldehinweis in die Mail gehört trotzdem dazu (Claude baut auf Anweisung einen Footer ein, wenn du es im Prompt ergänzt)
- **Workflow 05 (Winback) mit Werbe-Charakter:** sauber ist es, wenn die Kunden beim Kauf dem E-Mail-Marketing zugestimmt haben (Shopify-Checkout-Häkchen). Prüf das kurz.
- **Workflow 09** sendet bewusst nur einen **Entwurf an dich** — den verschickst du über dein Newsletter-Tool mit sauberer Empfängerliste.

---

## 🧩 Wie die Workflows technisch ticken

- **Kein Vendor-Lock:** Alles läuft über Standard-HTTP-Nodes (Shopify Admin API 2024-10, Anthropic Messages API, Telegram Bot API) — keine exotischen n8n-Nodes nötig
- **Duplikat-Schutz:** Workflows 01/04/05 merken sich verarbeitete Bestellungen/Kunden im Workflow-Static-Data — niemand wird doppelt angeschrieben
- **Fehlertolerant:** Wenn Claude mal kein sauberes JSON liefert, greift ein Fallback statt dass der Workflow crasht
- **Telegram-Limits:** Lange Nachrichten werden automatisch in 3900-Zeichen-Häppchen gesplittet

Viel Erfolg — und denk dran: Die Maschine arbeitet nur, wenn sie **Active** ist. 🚀
