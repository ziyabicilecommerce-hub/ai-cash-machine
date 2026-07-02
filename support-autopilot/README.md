# 📬 Support-Autopilot — dein monatliches Retainer-Produkt

Ein KI-System, das eingehende Kundenmails automatisch **klassifiziert** und **Antwort-Entwürfe**
schreibt. Du richtest es einmal pro Kunde ein und kassierst **jeden Monat** fürs Betreiben,
Pflegen und Verbessern. Gebaut mit **n8n + Claude API**.

> Zielgruppe: **Online-Shops / E-Commerce** — täglich viele gleiche Mails (Bestellstatus,
> Retoure, Produktfragen), klarer Zeitgewinn, einfach zu verkaufen.

---

## 💰 Preise (wiederkehrend = das Ziel!)

| Paket | Setup (einmalig) | **Monatlich** | Enthalten |
|---|---|---|---|
| **Starter** | 490 € | **99 €/Mon** | 1 Postfach, Entwurfs-Modus, bis 500 Mails/Mon, Monatsreport |
| **Pro** | 890 € | **249 €/Mon** | bis 2.000 Mails, mehrsprachig, Slack-Eskalation, Pflege der Wissensbasis |
| **Auto** | 1.490 € | **490 €/Mon** | Auto-Versand einfacher Kategorien, CRM-Anbindung, monatl. Optimierung |

**Warum das funktioniert:**
- Deine laufenden Kosten pro Kunde: ~5–20 € Claude-API + n8n-Hosting → **hohe Marge**.
- Schon **10 Starter-Kunden = ~1.000 €/Monat wiederkehrend** + Setup-Umsätze obendrauf.
- Der Kunde spart real Support-Zeit → die 99–490 € sind für ihn ein No-Brainer.

**Verkaufs-Pitch (eine Zeile):**
> „Ich schalte Ihrem Shop einen KI-Support-Assistenten davor, der auf jede Standardmail
> in Sekunden einen fertigen Antwort-Entwurf legt — Ihr Team klickt nur noch Senden.
> Einrichtung diese Woche, danach ein fester Monatsbeitrag."

---

## 🧩 Wie das System arbeitet

```
Neue Mail → Claude klassifiziert → Verzweigung:
   ├─ Standardanfrage  → Claude schreibt Entwurf → Gmail-Entwurf (Mensch prüft & sendet)
   └─ Reklamation/unklar → Eskalation an Team (Slack/Mail)
Alles wird geloggt → monatlicher Report für den Kunden
```

Dateien in diesem Ordner:
- **`n8n-workflow.json`** — in n8n importieren (Menü → Import from File). Danach nur noch
  Credentials + die zwei Prompts + die Google-Sheet-ID einsetzen.
- **`prompts.md`** — die zwei Claude-Prompts (das eigentliche Produkt). Pro Kunde nur den
  Kontext-Block (Firma, Ton, FAQ) tauschen.

## 🚀 Setup in 6 Schritten (pro Kunde ~1–2 h)

1. **n8n aufsetzen** (self-hosted per Docker, oder n8n Cloud). Workflow importieren.
2. **Credentials** hinterlegen: Gmail/IMAP des Kunden-Postfachs, `ANTHROPIC_API_KEY` als
   Environment-Variable, optional Slack + Google Sheets.
3. **Wissensbasis** vom Kunden holen (FAQ, Versand-/Retouren-Regeln, Ton) → in Prompt 2 einsetzen.
4. **Im Entwurfs-Modus testen** mit echten alten Mails, bis die Qualität sitzt.
5. **Live schalten** — Trigger auf das echte Postfach.
6. **Monatsreport** aus dem Log ziehen ("X Mails automatisch bearbeitet, ~Y Std. gespart")
   → das rechtfertigt den monatlichen Beitrag und verhindert Kündigungen.

## ⚖️ Rechtlich sauber bleiben (DE)
- **Auftragsverarbeitung (AVV/DSGVO):** Du verarbeitest personenbezogene Kundendaten der Firma
  → schließt einen **AV-Vertrag** ab. Vorlagen gibt's kostenlos online.
- **Kunden-Akquise:** Firmen kalt per Mail anschreiben ist in DE heikel (§7 UWG). Besser über
  **LinkedIn/persönlich** oder echte Signale. Siehe Gespräch.
- **Transparenz:** Der Kunde sollte wissen, dass KI beim Verfassen hilft (Entwurfs-Modus macht's einfach).

---

*Nächster Schritt: n8n aufsetzen und mit einem echten (deinem eigenen) Postfach testen —
dann hast du eine Live-Demo, die du Interessenten zeigen kannst. Das verkauft besser als jede Folie.*
