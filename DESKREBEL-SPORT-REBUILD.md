# DeskRebel — SPORT EDITION Rebuild

Kompletter Design-Umbau des DeskRebel-Themes (Shopify Theme ID 196851859783,
Duplikat vom 1. Juli) vom Gold/Mint-Luxus-Look auf einen Sport-Performance-Look.

## Design-System
- **Farben:** Volt-Neongrün `#c8ff00` (Primär) + Blaze-Orange `#ff3d00` (Sekundär) auf tiefem Schwarz
- **Typografie:** Anton (Display, kursiv, GROSSBUCHSTABEN — Sport-Jersey-Stil) + Inter (Fließtext)
- **Motive:** Speed-Lines, Racing-Streifen, schräge Kanten (clip-path), Ticker-Bänder, Jersey-Zahlen

## Geänderte Dateien
| Datei | Änderung |
|---|---|
| `layout/theme.liquid` | Sport-Variablen, Anton-Font, F1-Startampel-Loader, Cursor-Ring/Dot, Volt-Funken-Trail, Partikel-Explosion auf Buttons, 3D-Tilt, Magnetic Buttons, Grain-Overlay, Canvas-Hintergründe (Galaxy/Aurora/Constellation/Embers) auf Volt/Orange umgefärbt |
| `assets/dr-sport.css` | NEU: Globale Sport-Overrides (Titel, Karten, Preise, Formulare, Warenkorb, Popups, Produktseite) |
| `sections/hero.liquid` | Komplett neu: Anton-Riesenheadline, Racing-Streifen, Speed-Streaks, REBEL-Watermark, Sport-Stats, Ticker-Band |
| `sections/announcement-bar.liquid` | GAME-ON-Flag, Sport-Ticker, Volt/Orange-Flow-Line |
| `sections/header.liquid` | Anton-Logo, Sport-Nav mit Gradient-Underline |
| `sections/footer.liquid` | Volt-Topline, Anton-Logo, Sport-Hovers |
| `sections/features-bar.liquid` | Express/Geld-zurück/SSL/Coach-Support |
| `sections/stats-counter.liquid` | Jersey-Zahlen-Stats |
| `sections/cta-banner.liquid` | „Bereit fürs nächste Level?" + Speed-Streaks |
| `sections/social-proof-bar.liquid` | Anton-Werte, schräge Trenner |
| `sections/newsletter.liquid` | „Bleib im Spiel", Volt-Puls-Button |
| `sections/faq.liquid` | Sport-Hover, Volt-Icons |
| `sections/about-preview.liquid` | Sport-DNA-Story, Volt/Orange-Akzente |
| `sections/brand-promise.liquid` | Startelf-Qualität/Coach-Support-Karten, Performer-Zitat in Anton |
| `sections/categories-showcase.liquid` | „Wähl deine Disziplin", Volt-Hovers |
| `sections/featured-products.liquid` | „Unser MVP", Volt-Preis, Orange-Flow-Lines |

Warenkorb, Produktseite und Popups (Welcome/Morning) werden über `dr-sport.css` mitgezogen.
Keine Fake-Reviews/Fake-Scarcity hinzugefügt.

## V2 — ui-ux-pro-max Pass (100M Polish + Fixes)
- **Header-Fix:** `.dr-header-force` erzwingt Sichtbarkeit (fixed, Glas-Blur, z-index 1001, animierte Volt-Linie unten) — Header kann nicht mehr verschwinden
- **Hero V5:** Echtes Produktbild rechts (Product-Picker-Setting + Auto-Fallback), schwebend mit Orbit-Ringen, Scan-Line, Preis-Karte mit MVP-Tag; choreografierte Eingangsanimation (Index → Tag → Zeile 1 → Zeile 2 → Sub → Buttons → Stats)
- **Canvas-Hintergrund jetzt auf ALLEN Seiten** (auch Startseite: Volt-Konstellation)
- **Produktseite WOW:** Conic-Glow-Galerie, Ecken-Brackets, Scan-Line, Bild-Crossfade bei Thumbnail-Wechsel, pulsierender Kauf-Button mit Shine, Sticky-Kaufleiste (mobil) via IntersectionObserver
- **Typo-Upgrade:** Barlow Condensed für Buttons/Nav (Sport-Sekundärschrift zu Anton)
- **Animations-Engine:** Count-Up-Zahlen (data-countup), gestaffelte Reveals, prefers-reduced-motion überall respektiert
- **Lieferzeit überall 6–10 Werktage** (EU 10–14): Announcement, Hero, Ticker, Features, Social-Proof, Stats, Brand-Promise, FAQ, Produktseite

## V3 — Mobile-Rettung + Finish
- **Handy-Absturz gefixt:** Vollbild-Canvas läuft nur noch auf Desktop (>900px, pointer:fine); alle backdrop-filter-Blurs, animierte drop-shadows/Filter, Parallax, Streaks, Watermark, Grain auf Mobil deaktiviert (GPU-Killer). Desktop behält alles. Canvas pausiert zusätzlich bei verstecktem Tab.
- **„Sofort kaufen" entfernt** (Produktseite, per display:none global)
- **Header mobil abgesichert:** solide Farbe statt Blur, höhere CSS-Spezifität erzwingt Sichtbarkeit
- **Sport-Boost:** Hazard-Tape-Streifen (Volt/Orange diagonal) an Features-Bar & Footer, Section-Labels jetzt schräg (skewX) in Barlow Condensed

## V4 — FINAL: Announcement-Ticker + Speed-Paket
- **Announcement-Bar V3:** Fester Volt-Flag "GAME ON" links + endlos laufender Ticker (Gratis Versand ▸ 6–10 Werktage ▸ 30 Tage Geld-zurück ▸ SSL ▸ 10% Newsletter), Fade-Kanten, transform-only (mobilfreundlich), reduced-motion-safe
- **Speed-Paket:** F1-Loader nur beim ersten Besuch pro Session (sessionStorage) — Folgeseiten laden sofort; Reveals 0.5s, Stagger enger, Buttons 0.2s, Karten 0.22s, Marquee-Bänder schneller (17s/21s)
