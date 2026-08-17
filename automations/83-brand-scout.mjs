// Brand Scout - analysiert das ECHTE, aktuelle Sortiment (nicht eine manuell
// eingetragene Nische wie bei Product Hunter #51/Brand Assassin #58) und
// leitet daraus die Marken-DNA ab: Kernkategorien, Preislage, Zielgruppe,
// Stil. Schlägt darauf aufbauend neue Produkte vor, die die Marke wirklich
// ERWEITERN statt zufällig zu ergänzen - inkl. Markenfit-Score. Neu, kein
// n8n-Workflow · Zeitplan: wöchentlich.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getProducts, getOrdersSince } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const STATE_NAME = 'brand-scout-state';
const MAX_HISTORIE = 500;
const MAX_DETAIL_HISTORIE = 100;
const MAX_PRODUKTE_IM_PROMPT = 60;
const WHATSAPP_MAX_CHARS = 3500;
const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(__dirname, '..', 'brand-scout');

async function main() {
  const produkte = await getProducts({ limit: '250', status: 'active' });
  if (!produkte.length) {
    console.log('[83-brand-scout] Keine aktiven Produkte im Shop - übersprungen (Marken-DNA braucht ein bestehendes Sortiment).');
    return;
  }

  const vor60Tagen = new Date();
  vor60Tagen.setDate(vor60Tagen.getDate() - 60);
  const orders = (await getOrdersSince(vor60Tagen)).filter((o) => !o.cancelled_at);
  const verkaufProProdukt = {};
  for (const o of orders) {
    for (const li of o.line_items || []) {
      if (!li.product_id) continue;
      verkaufProProdukt[li.product_id] = (verkaufProProdukt[li.product_id] || 0) + li.quantity;
    }
  }

  const sortimentZeilen = produkte
    .map((p) => {
      const preise = (p.variants || []).map((v) => parseFloat(v.price)).filter((n) => !isNaN(n));
      const preisSpanne = preise.length ? `${Math.min(...preise).toFixed(2)}-${Math.max(...preise).toFixed(2)} EUR` : 'kein Preis';
      const verkauft = verkaufProProdukt[p.id] || 0;
      return { zeile: `- ${p.title} | Typ: ${p.product_type || 'unbekannt'} | Tags: ${p.tags || '-'} | Preis: ${preisSpanne} | verkauft (60 Tage): ${verkauft}`, verkauft };
    })
    .sort((a, b) => b.verkauft - a.verkauft)
    .slice(0, MAX_PRODUKTE_IM_PROMPT)
    .map((x) => x.zeile);

  const state = loadState(STATE_NAME);
  const bereitsVorgeschlagen = new Set(state.vorgeschlagen || []);
  const anzahlIdeen = parseInt(config.BRAND_SCOUT_ANZAHL_IDEEN, 10) || 6;

  const prompt = `Du bist ein Brand-Stratege für den Onlineshop "${config.SHOP_NAME}" (Heimatmarkt ${config.HEIMATMARKT || 'DE'}).

Hier ist das AKTUELLE, ECHTE Sortiment (bis zu ${MAX_PRODUKTE_IM_PROMPT} Artikel, nach Verkäufen sortiert):
${sortimentZeilen.join('\n')}

AUFGABE 1 - Marken-DNA analysieren: Leite aus dem echten Sortiment (nicht aus Annahmen) ab:
- kernkategorien: die 2-4 dominanten Produktkategorien
- preislage: "günstig"/"mittel"/"premium" MIT ungefährer EUR-Spanne
- zielgruppe: wer kauft hier vermutlich (Alter/Interesse/Anlass)
- stil: Ästhetik/roter Faden, der die Marke zusammenhält

AUFGABE 2 - Neue, markentreue Produkte vorschlagen: Schlage ${anzahlIdeen} KONKRETE neue Produkte vor (keine Oberkategorien), die diese Marke sinnvoll ERWEITERN - nicht irgendwelche Trend-Produkte, sondern welche, die ins bestehende Sortiment und zur Zielgruppe passen. Vermeide bereits vorgeschlagene: ${[...bereitsVorgeschlagen].slice(-100).join(', ') || 'keine'}.

Bewerte JEDES neue Produkt ehrlich 1-10 (10 = am besten):
- markenfit: passt es wirklich zur abgeleiteten Marken-DNA (10) oder wäre es ein Fremdkörper (1)
- nachfrage, konkurrenz (10=wenig Konkurrenz), marge, trend, lieferzeit (10=kurz/verlässlich), risiko (10=risikoarm)

Sei ehrlich, auch wenn die Marken-DNA unklar wirkt (z.B. sehr gemischtes Sortiment) - sag das dann so.

Antworte NUR mit validem JSON, ohne Markdown:
{"markenDna": {"kernkategorien": "...", "preislage": "...", "zielgruppe": "...", "stil": "..."}, "produkte": [{"name": "...", "markenfit": 0, "nachfrage": 0, "konkurrenz": 0, "marge": 0, "trend": 0, "lieferzeit": 0, "risiko": 0, "begruendung": "2-3 Sätze warum es zur Marke passt", "warnung": "konkrete Warnung oder leer"}]}`;

  const antwort = await askClaude(prompt, { maxTokens: 4000 });
  const daten = parseJsonFromText(antwort, null);
  if (!daten || !daten.markenDna) {
    console.log('[83-brand-scout] Ungültige Antwort, kein Report versendet.');
    return;
  }

  const neueProdukte = (Array.isArray(daten.produkte) ? daten.produkte : []).filter((p) => p && p.name && !bereitsVorgeschlagen.has(p.name));
  for (const p of neueProdukte) {
    p.gesamtScore = Math.round(
      ((p.markenfit || 0) + (p.nachfrage || 0) + (p.konkurrenz || 0) + (p.marge || 0) + (p.trend || 0) + (p.lieferzeit || 0) + (p.risiko || 0)) / 7,
    );
  }
  neueProdukte.sort((a, b) => b.gesamtScore - a.gesamtScore);

  const historie = [...bereitsVorgeschlagen, ...neueProdukte.map((p) => p.name)].slice(-MAX_HISTORIE);
  const detailHistorie = [
    ...neueProdukte.map((p) => ({ ...p, gefundenAm: new Date().toISOString() })),
    ...(state.detailHistorie || []),
  ].slice(0, MAX_DETAIL_HISTORIE);
  saveState(STATE_NAME, { vorgeschlagen: historie, detailHistorie, letzteMarkenDna: daten.markenDna });

  if (!existsSync(APP_DIR)) mkdirSync(APP_DIR, { recursive: true });
  writeFileSync(
    join(APP_DIR, 'data.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), markenDna: daten.markenDna, produkte: detailHistorie }, null, 2),
  );

  if (neueProdukte.length) {
    const zeilen = neueProdukte.map((p, i) => {
      const teile = [
        `${i + 1}. *${p.name}* — Score ${p.gesamtScore}/10 (Markenfit ${p.markenfit || 0}/10)`,
        p.begruendung || '',
      ];
      if (p.warnung) teile.push(`⚠️ ${p.warnung}`);
      return teile.join('\n');
    });
    const kopf = `🧬 *Marken-DNA:* ${daten.markenDna.kernkategorien} · ${daten.markenDna.preislage} · ${daten.markenDna.zielgruppe}`;
    const chunks = chunkZeilen(zeilen, WHATSAPP_MAX_CHARS);
    for (let i = 0; i < chunks.length; i++) {
      const titel = chunks.length > 1 ? `${kopf}\n\n${neueProdukte.length} neue markentreue Ideen (Teil ${i + 1}/${chunks.length}):` : `${kopf}\n\n${neueProdukte.length} neue markentreue Idee${neueProdukte.length > 1 ? 'n' : ''}:`;
      await notifyWhatsapp(`${titel}\n\n${chunks[i].join('\n\n')}`);
    }
  }

  console.log(`[83-brand-scout] Marken-DNA aktualisiert, ${neueProdukte.length} neue Idee(n).`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[83-brand-scout] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[83-brand-scout] Fehler:', err);
  process.exit(1);
});
