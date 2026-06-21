"""
Google Maps Lead Generator
Findet Firmen ohne Website und speichert sie als CSV.

Installation:
  pip install playwright scrapling pandas
  playwright install chromium
"""

import csv
import time
from playwright.sync_api import sync_playwright

# ─── EINSTELLUNGEN ────────────────────────────────────────────
SUCHBEGRIFFE = [
    "Friseur Frankfurt",
    "Bäcker Frankfurt",
    "Zahnarzt Frankfurt",
    "Reinigung Frankfurt",
]
ERGEBNIS_DATEI = "leads.csv"
MAX_PRO_SUCHE = 20  # Wie viele Firmen pro Suche
# ──────────────────────────────────────────────────────────────


def scrape_google_maps(page, suchbegriff, max_ergebnisse):
    leads = []

    url = f"https://www.google.com/maps/search/{suchbegriff.replace(' ', '+')}"
    page.goto(url)
    time.sleep(3)

    # Cookie-Banner wegklicken falls vorhanden
    try:
        page.click("button:has-text('Alle ablehnen')", timeout=3000)
    except:
        try:
            page.click("button:has-text('Akzeptieren')", timeout=2000)
        except:
            pass

    time.sleep(2)

    # Scroll um mehr Ergebnisse zu laden
    for _ in range(3):
        page.keyboard.press("End")
        time.sleep(1)

    # Alle Einträge sammeln
    eintraege = page.query_selector_all('[role="article"]')
    print(f"  {len(eintraege)} Einträge gefunden für '{suchbegriff}'")

    for i, eintrag in enumerate(eintraege[:max_ergebnisse]):
        try:
            eintrag.click()
            time.sleep(2)

            # Name
            name_el = page.query_selector('h1[class*="fontHeadlineLarge"]')
            name = name_el.inner_text() if name_el else "Unbekannt"

            # Telefonnummer
            tel_el = page.query_selector('[data-tooltip="Telefonnummer kopieren"]')
            if not tel_el:
                tel_el = page.query_selector('button[data-item-id^="phone"]')
            telefon = tel_el.inner_text() if tel_el else ""

            # Website vorhanden?
            website_el = page.query_selector('[data-tooltip="Website öffnen"]')
            if not website_el:
                website_el = page.query_selector('a[data-item-id^="authority"]')
            hat_website = website_el is not None

            # Bewertung
            rating_el = page.query_selector('[role="img"][aria-label*="Stern"]')
            bewertung = rating_el.get_attribute("aria-label") if rating_el else ""

            if not hat_website and telefon:
                leads.append({
                    "Name": name,
                    "Telefon": telefon,
                    "Bewertung": bewertung,
                    "Suchbegriff": suchbegriff,
                    "WhatsApp": f"https://wa.me/{telefon.replace(' ', '').replace('+', '').replace('-', '')}"
                })
                print(f"  ✓ LEAD: {name} — {telefon}")
            else:
                print(f"  ✗ {name} — hat bereits Website")

            # Zurück zur Liste
            page.go_back()
            time.sleep(1.5)

        except Exception as e:
            print(f"  Fehler bei Eintrag {i}: {e}")
            continue

    return leads


def main():
    alle_leads = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # headless=True für Hintergrund
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        for suchbegriff in SUCHBEGRIFFE:
            print(f"\n🔍 Suche: {suchbegriff}")
            leads = scrape_google_maps(page, suchbegriff, MAX_PRO_SUCHE)
            alle_leads.extend(leads)
            print(f"  → {len(leads)} Leads gefunden")
            time.sleep(2)

        browser.close()

    # CSV speichern
    if alle_leads:
        with open(ERGEBNIS_DATEI, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["Name", "Telefon", "Bewertung", "Suchbegriff", "WhatsApp"])
            writer.writeheader()
            writer.writerows(alle_leads)

        print(f"\n✅ {len(alle_leads)} Leads gespeichert in '{ERGEBNIS_DATEI}'")
    else:
        print("\n❌ Keine Leads gefunden.")


if __name__ == "__main__":
    main()
