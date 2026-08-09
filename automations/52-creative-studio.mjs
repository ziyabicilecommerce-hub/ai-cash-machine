// Creative Studio - baut pro Produkt ein komplettes Ad-Kreativ-Paket:
// Hooks, Meta/TikTok-Ad-Copy-Varianten, eine UGC-Kernidee und detaillierte
// Bild-Prompts. Neu, kein n8n-Workflow · Zeitplan: wöchentlich.
//
// Anders als 06-content-kanone/38-ugc-video-skript-fabrik (die sich auf
// EXISTIERENDE Bestseller aus Shopify-Bestellungen stützen) arbeitet dieses
// Skript für NEUE/geplante Produkte - z.B. direkt die Ideen aus dem
// Product Hunter (#51), bevor überhaupt eine erste Bestellung existiert.
//
// Bildgenerierung ist ECHT, aber OPTIONAL: mit OPENAI_API_KEY generiert es
// tatsächlich ein Bild (DALL-E 3) und schickt es direkt per WhatsApp. Ohne
// Key liefert es trotzdem das volle Text-Paket inkl. der Bild-Prompts zum
// manuellen Einsetzen in ein beliebiges Bildtool - kein Fake, nur ehrlich
// reduzierter Funktionsumfang ohne Key.
import { config } from './lib/config.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { notifyWhatsapp, notifyWhatsappBild } from './lib/whatsapp.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { generiereBild } from './lib/openaiImage.mjs';
import { loadState, saveState } from './lib/state.mjs';

const STATE_NAME = 'creative-studio-state';
const PRODUCT_HUNTER_STATE_NAME = 'product-hunter-state';
const MAX_HISTORIE = 300;
const WHATSAPP_MAX_CHARS = 3500;

function ermittleProdukte() {
  const konfiguriert = (config.CREATIVE_STUDIO_PRODUKTE || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (konfiguriert.length) return konfiguriert;

  // Fallback: die zuletzt vom Product Hunter vorgeschlagenen Produkte nutzen,
  // damit Creative Studio auch ohne eigene Konfiguration sofort etwas zu tun hat.
  const phState = loadState(PRODUCT_HUNTER_STATE_NAME);
  return (phState.vorgeschlagen || []).slice(-10);
}

async function main() {
  const alleProdukte = ermittleProdukte();
  if (!alleProdukte.length) {
    console.log('[52-creative-studio] Keine CREATIVE_STUDIO_PRODUKTE und kein Product-Hunter-State - übersprungen.');
    return;
  }

  const state = loadState(STATE_NAME);
  const bereitsBearbeitet = new Set(state.bearbeitet || []);
  const anzahl = parseInt(config.CREATIVE_STUDIO_ANZAHL_PRODUKTE, 10) || 1;

  const neueProdukte = alleProdukte.filter((p) => !bereitsBearbeitet.has(p)).slice(0, anzahl);
  if (!neueProdukte.length) {
    console.log('[52-creative-studio] Keine neuen Produkte (alle bereits bearbeitet).');
    return;
  }

  let verarbeitet = 0;
  for (const produkt of neueProdukte) {
    try {
      const prompt = `Du bist Performance-Marketing-Creative-Director für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE || 'nicht spezifiziert'}).

PRODUKT: ${produkt}

Baue das komplette Ad-Kreativ-Paket auf Deutsch:
1. 3 Scroll-Stopper-Hooks (max 12 Wörter, erste 3 Sekunden eines Video-Ads)
2. 2 Ad-Copy-Varianten für Meta/TikTok (je: Headline + 2-3 Sätze Text + CTA), unterschiedliche Angles (z.B. Problem/Lösung vs. Social Proof)
3. 1 UGC-Kernidee (Format + zentrale Botschaft in 2-3 Sätzen, KEIN volles Skript)
4. 2 detaillierte Bild-Generierungs-Prompts auf Englisch (photorealistisch, für ein Produktfoto-KI-Tool: Beschreibung von Szene/Licht/Komposition/Stimmung, konkret genug zum direkten Einsetzen)

Antworte NUR mit validem JSON, ohne Markdown:
{"hooks": ["...", "...", "..."], "ad_copy": [{"angle": "...", "headline": "...", "text": "...", "cta": "..."}], "ugc_idee": "...", "bild_prompts": ["...", "..."]}`;

      const antwort = await askClaude(prompt, { maxTokens: 3000 });
      const daten = parseJsonFromText(antwort, { hooks: [], ad_copy: [], ugc_idee: '', bild_prompts: [] });

      const zeilen = [
        `🎥 *Creative-Paket: ${produkt}*`,
        daten.hooks.length ? `*Hooks:*\n${daten.hooks.map((h, i) => `${i + 1}. ${h}`).join('\n')}` : '',
        daten.ad_copy.length
          ? `*Ad-Copy:*\n${daten.ad_copy.map((a) => `[${a.angle}]\n${a.headline}\n${a.text}\nCTA: ${a.cta}`).join('\n\n')}`
          : '',
        daten.ugc_idee ? `*UGC-Idee:*\n${daten.ugc_idee}` : '',
        daten.bild_prompts.length ? `*Bild-Prompts:*\n${daten.bild_prompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : '',
      ].filter(Boolean);

      let bildFehler = null;
      if (daten.bild_prompts.length) {
        try {
          const bildUrl = await generiereBild(daten.bild_prompts[0]);
          if (bildUrl) {
            await notifyWhatsappBild(bildUrl, `Generiertes Bild für: ${produkt}`);
          } else {
            zeilen.push('(Bildgenerierung übersprungen - kein OPENAI_API_KEY konfiguriert, Prompts oben manuell nutzbar)');
          }
        } catch (err) {
          bildFehler = err;
          zeilen.push(`⚠️ Bildgenerierung fehlgeschlagen: ${err.message} - Prompts oben trotzdem manuell nutzbar.`);
        }
      }

      const chunks = chunkZeilen(zeilen, WHATSAPP_MAX_CHARS);
      for (const chunk of chunks) {
        await notifyWhatsapp(chunk.join('\n\n'));
      }

      if (bildFehler) console.error(`[52-creative-studio] Bildgenerierung für "${produkt}" fehlgeschlagen:`, bildFehler);

      // Erst NACH erfolgreichem Versand als "bearbeitet" markieren und sofort
      // speichern - schlägt ein späteres Produkt im selben Lauf fehl, geht
      // dieser Erfolg nicht verloren (sonst würde das Paket nächste Woche
      // nochmal generiert und erneut mit Tokens bezahlt).
      bereitsBearbeitet.add(produkt);
      const historie = [...bereitsBearbeitet].slice(-MAX_HISTORIE);
      saveState(STATE_NAME, { bearbeitet: historie });
      verarbeitet++;
    } catch (err) {
      console.error(`[52-creative-studio] Produkt "${produkt}" fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[52-creative-studio] ${verarbeitet}/${neueProdukte.length} Creative-Paket(e) versendet.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[52-creative-studio] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[52-creative-studio] Fehler:', err);
  process.exit(1);
});
