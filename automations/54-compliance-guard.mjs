// Compliance Guard - prüft echte Produkte aus dem Shopify-Katalog auf
// mögliche Compliance-Themen (CE/WEEE/Batterien, Verpackung/LUCID,
// Textilkennzeichnung, riskante Werbeaussagen/Health-Claims).
// Neu, kein n8n-Workflow · Zeitplan: monatlich.
//
// WICHTIG (siehe auch Disclaimer in jeder Nachricht): das hier sind
// KEINE rechtsverbindlichen Aussagen und KEINE Rechtsberatung - nur
// Warnungen/Checklisten-Hinweise auf Basis von Claudes allgemeinem Wissen.
// Bei echten Zweifeln IMMER einen Fachanwalt/Steuerberater konsultieren.
//
// Ergänzt (nicht dupliziert) den Store-Optimizer (#53), der die
// Pflichtseiten-Verlinkung (Impressum/AGB/Datenschutz) auf der Startseite
// prüft - Compliance Guard schaut stattdessen auf PRODUKT-Ebene.
import { config } from './lib/config.mjs';
import { getProducts } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const STATE_NAME = 'compliance-guard-state';
const MAX_HISTORIE = 2000;
const WHATSAPP_MAX_CHARS = 3500;
const DISCLAIMER = '⚠️ Nur Hinweise/Checkliste, KEINE Rechtsberatung. Bei Unsicherheit einen Fachanwalt/Steuerberater fragen.';

async function main() {
  const alleProdukte = await getProducts({ limit: '100', fields: 'id,title,body_html,product_type,tags' });
  if (!alleProdukte.length) {
    console.log('[54-compliance-guard] Keine Produkte im Shop gefunden.');
    return;
  }

  const state = loadState(STATE_NAME);
  const bereitsGeprueft = new Set(state.geprueft || []);
  const maxProLauf = parseInt(config.COMPLIANCE_GUARD_MAX_PRO_LAUF, 10) || 20;

  const neueProdukte = alleProdukte.filter((p) => !bereitsGeprueft.has(p.id)).slice(0, maxProLauf);

  if (!neueProdukte.length) {
    console.log('[54-compliance-guard] Keine neuen/ungeprüften Produkte.');
    return;
  }

  const produktListe = neueProdukte
    .map((p, i) => `${i + 1}. "${p.title}" (Typ: ${p.product_type || 'unbekannt'}, Tags: ${p.tags || 'keine'})\nBeschreibung (Auszug): ${(p.body_html || '').replace(/<[^>]+>/g, ' ').slice(0, 500)}`)
    .join('\n\n');

  const prompt = `Du bist ein vorsichtiger E-Commerce-Compliance-Checker für den deutschen/EU-Markt (Onlineshop "${config.SHOP_NAME}"). Du gibst AUSDRÜCKLICH KEINE Rechtsberatung, sondern nur allgemeine Hinweise, worauf der Shop-Betreiber selbst achten oder einen Fachanwalt/Steuerberater fragen sollte.

Prüfe diese Produkte auf mögliche Compliance-Themen:
${produktListe}

Achte insbesondere auf:
- CE-Kennzeichnungspflicht (Elektronik, Spielzeug, Maschinen)
- WEEE/Elektrogesetz + Batterien-Verordnung (Elektrogeräte, Akkus/Batterien enthalten)
- Verpackungsgesetz/LUCID-Registrierungspflicht (generelle Erinnerung bei Versandverpackung)
- Textilkennzeichnungspflicht (Textilien: Materialzusammensetzung muss angegeben sein)
- Riskante Werbeaussagen/Health-Claims (z.B. "heilt", "garantiert", "100% sicher", medizinische Versprechen ohne Beleg)
- Lebensmittel-/Kosmetik-nahe Angaben ohne Kennzeichnung

Für JEDES Produkt mit mindestens einem Hinweis: liefere den Produktnamen, die betroffenen Themen (Stichpunkte), und einen kurzen, konkreten Checklisten-Hinweis, was der Betreiber prüfen/ergänzen sollte. Produkte OHNE Auffälligkeiten einfach weglassen.

Antworte NUR mit validem JSON, ohne Markdown:
{"hinweise": [{"produkt": "...", "themen": ["...", "..."], "checkliste": "..."}]}`;

  const antwort = await askClaude(prompt, { maxTokens: 3000 });
  const daten = parseJsonFromText(antwort, { hinweise: [] });
  const hinweise = Array.isArray(daten.hinweise) ? daten.hinweise : [];

  // Erst NACH der erfolgreichen Claude-Prüfung als "geprüft" markieren - vorher
  // wären Produkte bei einem Claude-Fehler fälschlich als geprüft abgehakt,
  // ohne dass je ein echtes Ergebnis für sie existiert (nie wieder geprüft).
  for (const p of neueProdukte) bereitsGeprueft.add(p.id);
  saveState(STATE_NAME, { geprueft: [...bereitsGeprueft].slice(-MAX_HISTORIE) });

  if (!hinweise.length) {
    await notifyWhatsapp(`🛡️ *Compliance Guard*: ${neueProdukte.length} Produkt(e) geprüft, keine auffälligen Themen gefunden.\n\n${DISCLAIMER}`);
    console.log(`[54-compliance-guard] ${neueProdukte.length} Produkt(e) geprüft, keine Auffälligkeiten.`);
    return;
  }

  const zeilen = hinweise.map((h, i) => `${i + 1}. *${h.produkt}*\nThemen: ${(h.themen || []).join(', ')}\nCheckliste: ${h.checkliste}`);
  const chunks = chunkZeilen(zeilen, WHATSAPP_MAX_CHARS);
  for (let i = 0; i < chunks.length; i++) {
    const kopf = chunks.length > 1
      ? `🛡️ Compliance Guard - ${hinweise.length} Produkt(e) mit Hinweisen (Teil ${i + 1}/${chunks.length}):`
      : `🛡️ Compliance Guard - ${hinweise.length} Produkt(e) mit Hinweisen:`;
    await notifyWhatsapp(`${kopf}\n\n${chunks[i].join('\n\n')}\n\n${DISCLAIMER}`);
  }

  console.log(`[54-compliance-guard] ${neueProdukte.length} Produkt(e) geprüft, ${hinweise.length} mit Hinweisen.`);
}

main().catch((err) => {
  console.error('[54-compliance-guard] Fehler:', err);
  process.exit(1);
});
