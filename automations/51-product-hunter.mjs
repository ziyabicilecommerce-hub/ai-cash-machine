// Product Hunter - schlägt konkrete Produktideen vor und bewertet sie auf
// Nachfrage, Konkurrenz, Marge, Trend, Lieferzeit und Risiko.
// Neu, kein n8n-Workflow · Zeitplan: wöchentlich, siehe automation-51-product-hunter.yml
//
// WICHTIG zur Einordnung: es gibt keinen kostenlosen Zugang zu echten
// Live-Trenddaten (Google Trends Ads, Jungle Scout o.ä. sind kostenpflichtig).
// Claude bewertet hier wie ein erfahrener Dropshipping-Scout anhand seines
// Trainingswissens - das ist eine fundierte Einschätzung, KEINE live
// gecrawlten Verkaufszahlen. Für belastbarere Daten später einen echten
// Trend-API-Key ergänzen (siehe README).
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const STATE_NAME = 'product-hunter-state';
const MAX_HISTORIE = 500;
const MAX_DETAIL_HISTORIE = 150;
const WHATSAPP_MAX_CHARS = 3500;
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');

function parseNischen() {
  const roh = config.PRODUCT_HUNTER_NISCHEN || config.SHOP_NISCHE || '';
  return roh.split(',').map((s) => s.trim()).filter(Boolean);
}

function bewertungsZeile(label, wert) {
  return `${label}: ${wert}/10`;
}

async function main() {
  const nischen = parseNischen();
  if (!nischen.length) {
    console.log('[51-product-hunter] Keine PRODUCT_HUNTER_NISCHEN (oder SHOP_NISCHE) konfiguriert - übersprungen.');
    return;
  }

  const anzahlProNische = parseInt(config.PRODUCT_HUNTER_ANZAHL_PRO_NISCHE, 10) || 3;
  const state = loadState(STATE_NAME);
  const bereitsVorgeschlagen = new Set(state.vorgeschlagen || []);

  const prompt = `Du bist ein erfahrener Dropshipping- und E-Commerce-Produktscout mit tiefem Marktwissen (Trends, Konkurrenzdichte, typische Margen, Lieferketten aus Fernost/EU-Lagern, rechtliche Fallstricke).

Nischen: ${nischen.join(', ')}
Shop-Kontext: "${config.SHOP_NAME}", Zielgruppe: ${config.ZIELGRUPPE || 'nicht spezifiziert'}, Heimatmarkt: ${config.HEIMATMARKT || 'DE'}

Schlage für JEDE Nische bis zu ${anzahlProNische} KONKRETE Produktideen vor (keine Oberkategorien wie "Fitnessgeräte", sondern spezifische Produkte wie "Faltbare Klimmzugstange für Türrahmen"). Vermeide diese bereits vorgeschlagenen Produkte: ${[...bereitsVorgeschlagen].slice(-100).join(', ') || 'keine'}.

Bewerte JEDES Produkt ehrlich 1-10 (10 = am besten):
- nachfrage: wie groß ist die Nachfrage aktuell einzuschätzen
- konkurrenz: 10 = wenig Konkurrenz/Nische frei, 1 = übersättigt
- marge: Gewinnspannen-Potenzial bei typischem Einkaufspreis vs. realistischem Verkaufspreis
- trend: 10 = klar steigender Trend, 1 = abnehmend/Modeerscheinung vorbei
- lieferzeit: 10 = kurze/verlässliche Lieferzeit erwartbar, 1 = typischerweise sehr lang
- risiko: 10 = risikoarm, 1 = hohes Risiko (Zoll/CE-Pflichten, Zerbrechlichkeit, hohe Retourenquote, Patente/Marken-Konflikte, starke Saisonalität)

Sei ehrlich und warne explizit, wenn ein Produkt trotz hoher Nachfrage riskant ist (z.B. Elektronik mit CE-Pflicht, saisonale Ware, patentierte Designs).

Antworte NUR mit validem JSON, ohne Markdown:
{"produkte": [{"name": "...", "nische": "...", "nachfrage": 0, "konkurrenz": 0, "marge": 0, "trend": 0, "lieferzeit": 0, "risiko": 0, "begruendung": "2-3 Sätze warum", "warnung": "konkrete Warnung oder leer"}]}`;

  const antwort = await askClaude(prompt, { maxTokens: 4000 });
  const daten = parseJsonFromText(antwort, { produkte: [] });
  const produkte = Array.isArray(daten.produkte) ? daten.produkte : [];

  const neueProdukte = produkte.filter((p) => p && p.name && !bereitsVorgeschlagen.has(p.name));
  if (!neueProdukte.length) {
    console.log('[51-product-hunter] Keine neuen Produktideen (alle bereits vorgeschlagen oder leere Antwort).');
    return;
  }

  for (const p of neueProdukte) {
    p.gesamtScore = Math.round(
      ((p.nachfrage || 0) + (p.konkurrenz || 0) + (p.marge || 0) + (p.trend || 0) + (p.lieferzeit || 0) + (p.risiko || 0)) / 6,
    );
  }
  neueProdukte.sort((a, b) => b.gesamtScore - a.gesamtScore);

  const zeilen = neueProdukte.map((p, i) => {
    const teile = [
      `${i + 1}. *${p.name}* (${p.nische}) — Score ${p.gesamtScore}/10`,
      [
        bewertungsZeile('Nachfrage', p.nachfrage || 0),
        bewertungsZeile('Konkurrenz', p.konkurrenz || 0),
        bewertungsZeile('Marge', p.marge || 0),
        bewertungsZeile('Trend', p.trend || 0),
        bewertungsZeile('Lieferzeit', p.lieferzeit || 0),
        bewertungsZeile('Risiko', p.risiko || 0),
      ].join(' · '),
      p.begruendung || '',
    ];
    if (p.warnung) teile.push(`⚠️ ${p.warnung}`);
    return teile.join('\n');
  });

  // Historie SOFORT nach der Ideengenerierung speichern, nicht erst nach dem
  // WhatsApp-Versand - ein Netzwerkfehler beim Senden (notifyWhatsapp() wirft
  // bei einem echten fetch()-Fehler) soll nicht dazu führen, dass dieselben
  // Produktideen nächste Woche nochmal vorgeschlagen (und erneut mit Tokens
  // bezahlt) werden.
  const historie = [...bereitsVorgeschlagen, ...neueProdukte.map((p) => p.name)].slice(-MAX_HISTORIE);
  // detailHistorie zusätzlich zur reinen Dedup-Namensliste oben - die App
  // braucht die vollen Bewertungen (Scores, Begründung, Warnung), nicht nur
  // "wurde schonmal vorgeschlagen ja/nein".
  const detailHistorie = [
    ...neueProdukte.map((p) => ({ ...p, gefundenAm: new Date().toISOString() })),
    ...(state.detailHistorie || []),
  ].slice(0, MAX_DETAIL_HISTORIE);
  saveState(STATE_NAME, { vorgeschlagen: historie, detailHistorie });

  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  writeFileSync(join(COMMAND_DIR, 'product-hunter.json'), JSON.stringify({ updatedAt: new Date().toISOString(), produkte: detailHistorie }, null, 2));

  const chunks = chunkZeilen(zeilen, WHATSAPP_MAX_CHARS);
  for (let i = 0; i < chunks.length; i++) {
    const kopf = chunks.length > 1
      ? `🔎 ${neueProdukte.length} neue Produktideen (Teil ${i + 1}/${chunks.length}):`
      : `🔎 ${neueProdukte.length} neue Produktidee${neueProdukte.length > 1 ? 'n' : ''}:`;
    await notifyWhatsapp(`${kopf}\n\n${chunks[i].join('\n\n')}`);
  }

  console.log(`[51-product-hunter] ${neueProdukte.length} neue Produktidee(n) per WhatsApp verschickt.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[51-product-hunter] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[51-product-hunter] Fehler:', err);
  process.exit(1);
});
