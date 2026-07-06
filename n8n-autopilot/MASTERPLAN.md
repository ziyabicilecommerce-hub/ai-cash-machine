# 🧭 MASTERPLAN — Dein 30-Tage-Aktivierungs-Fahrplan

**19 Workflows sind viel. Damit du dich nicht verzettelst: Aktiviere sie in dieser Reihenfolge.** Jede Woche kommt eine Schicht dazu — erst Geld sichern, dann Wachstum, dann Skalierung.

---

## 📅 Woche 1: Das Fundament (Umsatz retten + Überblick)

**Diese 4 zuerst — sie bringen ab Tag 1 messbar Geld oder Klarheit:**

| Aktivieren | Warum zuerst |
|------------|--------------|
| 📊 03 · Gewinn-Radar | Ab morgen früh weißt du jeden Tag, wo du stehst. Ohne Zahlen fliegst du blind. |
| 🔥 15 · Warenkorb-Sequenz 3.0 | Der größte sofortige Umsatzhebel. (NICHT zusammen mit 01 aktivieren!) |
| 🤝 13 · Willkommens-Booster | Jeder neue Kunde wird ab sofort richtig begrüßt. |
| 🔭 08 · Trend-Scout | Dein täglicher Markt-Kompass. |

**Checkliste Woche 1:**
- [ ] Alle Setup-Nodes ausgefüllt (Keys, Shop, Nische, Zielgruppe)
- [ ] Rabattcodes in Shopify angelegt (`COMEBACK10`, `WILLKOMMEN15`, `VIP20`, `BOOM20`)
- [ ] Timezone in n8n auf `Europe/Berlin`
- [ ] Alles 3 Tage im TEST_MODE beobachtet → dann scharf

## 📅 Woche 2: Die Content- & E-Mail-Maschine

| Aktivieren | Warum jetzt |
|------------|-------------|
| 🎬 06 · Content-Kanone | Ab jetzt filmst du nur noch ab — jeden Morgen fertige Skripte. |
| 🌍 18 · Multi-Plattform-Poster | Ein Inhalt → 7 Plattformen. Deine Reichweiten-Maschine. |
| ⭐ 04 · Bewertungs-Magnet | Social Proof beginnt sich zu stapeln. |
| 🤖 02 · KI-Kundenservice | Support läuft nebenbei — du gewinnst 1–2h pro Tag zurück. |

## 📅 Woche 3: Die Geld-Nachpresse (Bestandskunden melken)

| Aktivieren | Warum jetzt |
|------------|-------------|
| 🔄 05 · Winback-Maschine | Inaktive Kunden werden automatisch zurückgeholt. |
| 🎁 16 · Cross-Sell-Radar | Zweitkäufe ohne Werbekosten. |
| 👑 10 · VIP-Radar | Deine besten Kunden fühlen sich ab jetzt königlich. |
| 💥 17 · Promo-Kampagnen-Maschine | Alle 14 Tage ein Umsatz-Spike aus deiner Liste. |

## 📅 Woche 4: Die Kommandozentrale (Strategie + Skalierung)

| Aktivieren | Warum zuletzt |
|------------|---------------|
| 🧠 12 · Marketing-Chef (KI-CMO) | Jetzt gibt es genug Daten für echte Strategie-Briefings. |
| 🎛️ 11 · Ads-Manager | Sobald du erste Ads schaltest (siehe REICH-IN-60-TAGEN.md Phase 2). AUTO_PAUSE erst nach 1 Woche Vertrauen. |
| 🎯 07 · Ad-Fabrik | Wöchentliche Werbetexte aus echten Verkaufsdaten. |
| 🗓️ 19 · Saison-Planer | Ab dem 25. bekommst du den Kalender für den Folgemonat. |
| 📰 09 · Newsletter-Autopilot | Rundet die E-Mail-Strategie ab. |
| 🕵️ 14 · Preis-Spion | Sobald du weißt, wer deine 2–3 echten Konkurrenten sind. |

---

## 🔁 Deine Wartungsroutine (danach nur noch das)

| Rhythmus | Aufgabe | Zeit |
|----------|---------|------|
| Täglich | Telegram checken (Radar, Trends, Content, Ads-Briefing), 3 Videos posten | 60–90 Min |
| Sonntags | CMO-Briefing lesen und die 3 Prioritäten in den Kalender schreiben | 15 Min |
| Monatlich (25.+) | Saison-Planer-Kalender durchgehen, Promo-Termine festzurren, Rabattcodes anlegen | 30 Min |
| Monatlich | Claude-API-Guthaben & SMTP-Limits checken, StaticData-mäßig alles ok (Executions-Log grün?) | 10 Min |

## 🎯 Erfolgs-Messung: Woran du merkst, dass die Maschine greift

- **Nach 2 Wochen:** Warenkorb-Mails erzeugen erste zurückgeholte Bestellungen (siehst du im Gewinn-Radar)
- **Nach 4 Wochen:** Erste Bewertungen trudeln ein, E-Mail-Anteil am Umsatz > 5 %
- **Nach 6 Wochen:** Winback + Cross-Sell erzeugen Zweitkäufe, E-Mail-Anteil > 15 %
- **Nach 8 Wochen:** Promo-Kampagnen machen messbare Umsatz-Spikes; Ads laufen mit ROAS ≥ 2 unter Aufsicht des Ads-Managers

**Faustregel: Wenn ein Workflow nach 30 Tagen nichts bringt → Prompt in der 🧠-Node schärfen (Nische/Zielgruppe genauer beschreiben), nicht gleich abschalten.**

---

## 🆘 Wenn was klemmt

| Problem | Lösung |
|---------|--------|
| Workflow läuft, aber keine Mails kommen an | SMTP-Credential testen (n8n → Credentials → Test), Spam-Ordner checken, Absender-Domain mit SPF/DKIM verifizieren |
| Claude-Node wirft 401 | API-Key falsch/abgelaufen → console.anthropic.com |
| Claude-Node wirft 429 | Guthaben leer oder Rate-Limit → Guthaben aufladen |
| Shopify-Node wirft 401/403 | Token falsch oder Scope fehlt (read_orders, read_products, read_customers, read_checkouts) |
| Doppelte Mails an Kunden | 01 UND 15 gleichzeitig aktiv? Einen davon deaktivieren! |
| Zeitpläne feuern zur falschen Zeit | n8n-Timezone auf Europe/Berlin stellen |

**Das System steht. Der Fahrplan liegt vor dir. Woche 1 beginnt jetzt. 🚀**
