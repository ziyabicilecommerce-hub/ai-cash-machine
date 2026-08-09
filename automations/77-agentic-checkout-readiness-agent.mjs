// Agentic-Checkout-Readiness-Agent - prüft, ob der Produktkatalog überhaupt
// von KI-Einkaufsagenten (ChatGPT Instant Checkout, Perplexity Shopping u.ä.)
// zuverlässig gefunden, verstanden und empfohlen werden kann. Diese Agenten
// lesen KEINE Marketing-Website, sondern strukturierte Produktdaten direkt -
// fehlt Beschreibung/Bild/Preis/Kategorie, wird das Produkt von ihnen einfach
// übersprungen, ohne dass der Shop-Besitzer das je merkt. Neu, kein
// n8n-Workflow · Zeitplan: wöchentlich.
//
// Rein prüfend/meldend - ändert nichts an Produkten. Wir raten hier bewusst
// nicht an einem konkreten Feed-Format herum (die Agentic-Commerce-Protokolle
// sind noch in Bewegung); stattdessen prüfen wir die Grundvoraussetzungen,
// die JEDES dieser Protokolle braucht: vollständige, verständliche Produktdaten.
import { config } from './lib/config.mjs';
import { getProducts } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '77-agentic-checkout-readiness-agent';
const TELEGRAM_MAX_CHARS = 3500;

function strippeHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function bewerteProdukt(produkt, minBeschreibungZeichen) {
  const gruende = [];
  let punkte = 0;
  const kriterien = 6;

  if (produkt.title && produkt.title.trim().length >= 10) {
    punkte++;
  } else {
    gruende.push('Titel fehlt oder ist zu kurz');
  }

  const beschreibung = strippeHtml(produkt.body_html);
  if (beschreibung.length >= minBeschreibungZeichen) {
    punkte++;
  } else {
    gruende.push(`Beschreibung zu kurz (${beschreibung.length}/${minBeschreibungZeichen} Zeichen) - KI-Agenten können das Produkt nicht einordnen`);
  }

  if (Array.isArray(produkt.images) && produkt.images.length > 0) {
    punkte++;
  } else {
    gruende.push('Kein Produktbild');
  }

  const variants = Array.isArray(produkt.variants) ? produkt.variants : [];
  const hatPreis = variants.some((v) => parseFloat(v.price) > 0);
  if (hatPreis) {
    punkte++;
  } else {
    gruende.push('Kein gültiger Preis auf einer Variante');
  }

  if (produkt.product_type && produkt.product_type.trim()) {
    punkte++;
  } else {
    gruende.push('Keine Produktkategorie (product_type) gesetzt');
  }

  const verfuegbar = variants.some((v) => v.inventory_policy === 'continue' || (v.inventory_quantity ?? 0) > 0);
  if (verfuegbar) {
    punkte++;
  } else {
    gruende.push('Keine Variante verfügbar/auf Lager');
  }

  return { score: Math.round((punkte / kriterien) * 100), gruende };
}

async function main() {
  const minBeschreibungZeichen = parseInt(config.AGENTIC_READINESS_MIN_BESCHREIBUNG_ZEICHEN || '100', 10);
  const schwelle = parseInt(config.AGENTIC_READINESS_SCHWELLE || '70', 10);
  const maxImReport = parseInt(config.AGENTIC_READINESS_MAX_PRODUKTE_IM_REPORT || '15', 10);

  const produkte = await getProducts({ status: 'active' });
  if (!produkte.length) {
    console.log('[77-agentic-checkout-readiness-agent] Keine aktiven Produkte.');
    return;
  }

  const bewertet = produkte.map((p) => ({ produkt: p, ...bewerteProdukt(p, minBeschreibungZeichen) }));
  const gesamtScore = Math.round(bewertet.reduce((sum, b) => sum + b.score, 0) / bewertet.length);

  const state = loadState(STATE_KEY);
  const vorherigerScore = typeof state.letzterGesamtScore === 'number' ? state.letzterGesamtScore : null;
  const trend = vorherigerScore === null ? '' : gesamtScore > vorherigerScore ? ` (↑ von ${vorherigerScore})` : gesamtScore < vorherigerScore ? ` (↓ von ${vorherigerScore})` : ' (unverändert)';

  const problemProdukte = bewertet
    .filter((b) => b.score < schwelle)
    .sort((a, b) => a.score - b.score)
    .slice(0, maxImReport);

  const kopf = [
    `🤖 Agentic-Checkout-Readiness-Agent:`,
    `Katalog-Score für KI-Einkaufsagenten: ${gesamtScore}/100${trend}`,
    `${produkte.length} aktive Produkte geprüft, ${problemProdukte.length} davon unter ${schwelle}/100.`,
  ].join(NL);

  if (!problemProdukte.length) {
    await notifyTelegram(`${kopf}${NL}${NL}Alle Produkte sind bereit für KI-Einkaufsagenten. 👍`);
  } else {
    const zeilen = problemProdukte.map(
      (b) => `- "${b.produkt.title || b.produkt.id}" (${b.score}/100): ${b.gruende.join('; ')}`,
    );
    const chunks = chunkZeilen(zeilen, TELEGRAM_MAX_CHARS);
    for (let i = 0; i < chunks.length; i++) {
      const teilKopf = i === 0 ? kopf : `🤖 Agentic-Checkout-Readiness-Agent (Teil ${i + 1}/${chunks.length}):`;
      try {
        await notifyTelegram(`${teilKopf}${NL}${NL}${chunks[i].join(NL)}`);
      } catch (err) {
        console.error(`[77-agentic-checkout-readiness-agent] Meldung Teil ${i + 1} fehlgeschlagen:`, err.message || err);
      }
    }
  }

  state.letzterGesamtScore = gesamtScore;
  state.letzterLauf = new Date().toISOString();
  saveState(STATE_KEY, state);

  console.log(`[77-agentic-checkout-readiness-agent] Score ${gesamtScore}/100, ${problemProdukte.length} Produkt(e) unter Schwelle gemeldet.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[77-agentic-checkout-readiness-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[77-agentic-checkout-readiness-agent] Fehler:', err);
  process.exit(1);
});
