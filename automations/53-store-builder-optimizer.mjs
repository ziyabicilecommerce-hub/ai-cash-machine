// Store Builder & Optimizer - zwei Teile in einem Skript:
// (A) Builder: legt für neue Produktideen echte Shopify-Produktseiten als
//     ENTWURF an (status: draft, geht nie automatisch live) inkl. Titel,
//     Beschreibung, SEO-Meta.
// (B) Optimizer: prüft die eigene Live-Storefront (SHOP_URL) auf Geschwindigkeit,
//     Vertrauens-Elemente (Impressum/AGB/Datenschutz/Bewertungen) und
//     Conversion-Basics (Warenkorb-Button, Mobile-Tauglichkeit).
// Neu, kein n8n-Workflow · Zeitplan: wöchentlich.
//
// Bundle-Ideen aus echten Kaufdaten gibt es bereits in #24 Bundle-Bauer -
// hier bewusst nicht dupliziert.
import { config } from './lib/config.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { createProduct } from './lib/shopify.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const STATE_NAME = 'store-builder-state';
const PRODUCT_HUNTER_STATE_NAME = 'product-hunter-state';
const MAX_HISTORIE = 300;
const WHATSAPP_MAX_CHARS = 3500;
const FETCH_TIMEOUT_MS = 8000;

function ermittleProdukte() {
  const konfiguriert = (config.STORE_BUILDER_PRODUKTE || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (konfiguriert.length) return konfiguriert;
  const phState = loadState(PRODUCT_HUNTER_STATE_NAME);
  return (phState.vorgeschlagen || []).slice(-10);
}

async function baueProduktseite(produkt) {
  const prompt = `Du bist E-Commerce-Copywriter/SEO-Experte für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE || 'nicht spezifiziert'}).

PRODUKT: ${produkt}

Schreibe eine vollständige Shopify-Produktseite auf Deutsch:
- title: knackiger, verkaufsstarker Produkttitel (max 70 Zeichen)
- body_html: vollständige Produktbeschreibung als sauberes HTML (h3-Zwischenüberschriften, Bulletpoints für Features, ein Absatz Nutzen-Storytelling), 200-350 Wörter
- seo_title: SEO-Titel (max 60 Zeichen)
- seo_description: Meta-Description (max 155 Zeichen, mit Kaufanreiz)
- tags: 4-6 relevante Tags, kommagetrennt
- vorgeschlagener_preis: realistischer Verkaufspreis in EUR als Zahl (ohne Währungssymbol)

Antworte NUR mit validem JSON, ohne Markdown:
{"title": "...", "body_html": "...", "seo_title": "...", "seo_description": "...", "tags": "...", "vorgeschlagener_preis": 0}`;

  const antwort = await askClaude(prompt, { maxTokens: 2500 });
  return parseJsonFromText(antwort, null);
}

async function pruefeStorefront() {
  if (!config.SHOP_URL) return null;

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(config.SHOP_URL, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    const ladezeitMs = Date.now() - start;

    if (!res.ok) return { fehler: `Shop antwortet mit Status ${res.status}` };

    const html = await res.text();
    const htmlLower = html.toLowerCase();

    const check = (label, gefunden) => ({ label, ok: gefunden });
    const checks = [
      check('HTTPS', config.SHOP_URL.startsWith('https://')),
      check('Mobile-optimiert (viewport-Meta-Tag)', /<meta[^>]+viewport/i.test(html)),
      check('Impressum verlinkt', /impressum/.test(htmlLower)),
      check('AGB verlinkt', /\bagb\b|allgemeine geschäftsbedingungen/.test(htmlLower)),
      check('Datenschutzerklärung verlinkt', /datenschutz/.test(htmlLower)),
      check('Kontaktmöglichkeit sichtbar', /kontakt/.test(htmlLower)),
      check('Bewertungen/Reviews sichtbar', /bewertung|review|judge\.me|trustpilot/.test(htmlLower)),
      check('Ladezeit unter 3 Sekunden', ladezeitMs < 3000),
    ];

    return { ladezeitMs, seitengroesseKb: Math.round(html.length / 1024), checks };
  } catch (err) {
    return { fehler: `Shop nicht erreichbar (${err.message})` };
  }
}

async function main() {
  const produkte = ermittleProdukte();
  const state = loadState(STATE_NAME);
  const bereitsGebaut = new Set(state.gebaut || []);
  const anzahl = parseInt(config.STORE_BUILDER_ANZAHL_PRODUKTE, 10) || 1;
  const neueProdukte = produkte.filter((p) => !bereitsGebaut.has(p)).slice(0, anzahl);

  const nachrichten = [];
  let verarbeitet = 0;

  for (const produkt of neueProdukte) {
    try {
      const seite = await baueProduktseite(produkt);
      if (!seite || !seite.title) {
        nachrichten.push(`⚠️ Store Builder: Konnte keine Produktseite für "${produkt}" erzeugen (ungültige Claude-Antwort).`);
        // Bewusst NICHT als "gebaut" markieren - eine ungültige Antwort ist
        // kein Erfolg, der nächste Lauf soll es erneut versuchen.
        continue;
      }

      let angelegtHinweis;
      try {
        const shopifyProdukt = await createProduct({
          title: seite.title,
          bodyHtml: seite.body_html,
          productType: config.SHOP_NISCHE,
          tags: seite.tags,
          seoTitle: seite.seo_title,
          seoDescription: seite.seo_description,
          price: seite.vorgeschlagener_preis,
        });
        const adminUrl = config.SHOP ? `https://${config.SHOP}.myshopify.com/admin/products/${shopifyProdukt.id}` : '(SHOP nicht konfiguriert)';
        angelegtHinweis = `✅ Als ENTWURF in Shopify angelegt: ${adminUrl}\nBitte prüfen und bewusst veröffentlichen - geht nie automatisch live.`;
      } catch (err) {
        angelegtHinweis = `⚠️ Konnte nicht in Shopify angelegt werden (${err.message}). Text unten manuell nutzbar.`;
      }

      nachrichten.push(
        [
          `🛒 *Store Builder: ${seite.title}*`,
          `Vorschlag-Preis: ${seite.vorgeschlagener_preis} EUR · Tags: ${seite.tags}`,
          `SEO: ${seite.seo_title} — ${seite.seo_description}`,
          angelegtHinweis,
        ].join('\n'),
      );

      // Erst NACH erfolgreicher Verarbeitung als "gebaut" markieren und sofort
      // speichern - schlägt ein späteres Produkt im selben Lauf fehl, geht
      // dieser Erfolg nicht verloren (sonst würde nächste Woche ein ZWEITER
      // Shopify-Entwurf für dasselbe Produkt angelegt).
      bereitsGebaut.add(produkt);
      const historie = [...bereitsGebaut].slice(-MAX_HISTORIE);
      saveState(STATE_NAME, { gebaut: historie });
      verarbeitet++;
    } catch (err) {
      console.error(`[53-store-builder-optimizer] Produkt "${produkt}" fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  const storefrontBericht = await pruefeStorefront();
  if (storefrontBericht) {
    if (storefrontBericht.fehler) {
      nachrichten.push(`⚠️ Store Optimizer: ${storefrontBericht.fehler}`);
    } else {
      const nichtErfuellt = storefrontBericht.checks.filter((c) => !c.ok);
      const zeilen = storefrontBericht.checks.map((c) => `${c.ok ? '✅' : '❌'} ${c.label}`);
      nachrichten.push(
        [
          `🔍 *Store Optimizer* — Ladezeit ${storefrontBericht.ladezeitMs}ms, Seitengröße ${storefrontBericht.seitengroesseKb}KB`,
          zeilen.join('\n'),
          nichtErfuellt.length
            ? `${nichtErfuellt.length} von ${storefrontBericht.checks.length} Punkten fehlen noch.`
            : 'Alle Basis-Checks bestanden! 🎉',
        ].join('\n'),
      );
    }
  }

  if (!nachrichten.length) {
    console.log('[53-store-builder-optimizer] Nichts zu tun (keine neuen Produkte, kein SHOP_URL konfiguriert).');
    return;
  }

  const chunks = chunkZeilen(nachrichten, WHATSAPP_MAX_CHARS);
  for (const chunk of chunks) {
    await notifyWhatsapp(chunk.join('\n\n'));
  }

  console.log(`[53-store-builder-optimizer] ${verarbeitet}/${neueProdukte.length} Produktseite(n) gebaut, Storefront-Check ${storefrontBericht ? 'durchgeführt' : 'übersprungen'}.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[53-store-builder-optimizer] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[53-store-builder-optimizer] Fehler:', err);
  process.exit(1);
});
