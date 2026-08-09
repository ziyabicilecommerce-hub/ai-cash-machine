// Margen-Erosions-Wächter - vergleicht bei jedem Lauf den ECHTEN Shopify-
// Einkaufspreis (inventory_item.cost) jeder Variante mit dem zuletzt
// bekannten Wert. Steigt der Einkaufspreis deutlich (MARGE_WARNUNG_SCHWELLE_PROZENT),
// der Verkaufspreis aber nicht mit, warnt der Agent BEVOR die Marge
// unbemerkt wegschmilzt. Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Unterscheidet sich vom Pricing-Agent (#61, reagiert auf VERKAUFSTEMPO,
// nicht auf Einkaufspreis-Änderungen) und Preis-Spion (#14, beobachtet
// Konkurrenz-Preise, nicht die eigenen Einkaufskosten). Rein meldend -
// ändert selbst keine Preise, das bleibt bewusst dem Pricing-Agent
// vorbehalten, der dafür die vollständigen Sicherheitsgrenzen hat.
import { config } from './lib/config.mjs';
import { getProducts, getInventoryItem } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '71-margen-erosions-waechter';
const TELEGRAM_MAX_CHARS = 3500;

async function main() {
  const schwelle = parseFloat(config.MARGE_WARNUNG_SCHWELLE_PROZENT || '10') / 100;
  const produkte = await getProducts({ limit: '100', status: 'active' });

  const state = loadState(STATE_KEY);
  state.letzteKosten = state.letzteKosten || {};

  const warnungen = [];
  for (const p of produkte) {
    for (const v of p.variants || []) {
      if (!v.inventory_item_id) continue;
      const preis = parseFloat(v.price);
      if (isNaN(preis) || preis <= 0) continue;

      let kosten;
      try {
        const item = await getInventoryItem(v.inventory_item_id);
        kosten = parseFloat(item?.cost);
      } catch (err) {
        console.error(`[71-margen-erosions-waechter] Einkaufspreis nicht abrufbar für Variante ${v.id}:`, err.message);
        continue;
      }
      if (isNaN(kosten) || kosten <= 0) continue;

      const name = p.title + (v.title && v.title !== 'Default Title' ? ` (${v.title})` : '');
      const vorherigeKosten = state.letzteKosten[v.id];

      if (vorherigeKosten && kosten >= vorherigeKosten * (1 + schwelle)) {
        const margeJetzt = ((preis - kosten) / preis) * 100;
        const anstiegProzent = ((kosten - vorherigeKosten) / vorherigeKosten) * 100;
        warnungen.push(
          `- ${name}: Einkauf ${vorherigeKosten.toFixed(2)} → ${kosten.toFixed(2)} € (+${anstiegProzent.toFixed(1)}%), Verkaufspreis unverändert bei ${preis.toFixed(2)} € → Marge jetzt nur noch ${margeJetzt.toFixed(1)}%`,
        );
      }

      // Immer aktualisieren (auch ohne Warnung) - sonst würde ein einmal
      // gemeldeter Anstieg bei jedem folgenden Lauf erneut gemeldet, obwohl
      // sich seitdem nichts weiter geändert hat.
      state.letzteKosten[v.id] = kosten;
    }
  }

  saveState(STATE_KEY, state);

  if (!warnungen.length) {
    console.log('[71-margen-erosions-waechter] Keine auffälligen Kostenanstiege.');
    return;
  }

  const chunks = chunkZeilen(warnungen, TELEGRAM_MAX_CHARS);
  for (let i = 0; i < chunks.length; i++) {
    const kopf = chunks.length > 1
      ? `📉 Margen-Erosions-Wächter (Teil ${i + 1}/${chunks.length}):`
      : `📉 Margen-Erosions-Wächter:`;
    await notifyTelegram(`${kopf}${NL}${NL}${chunks[i].join(NL)}`);
  }

  console.log(`[71-margen-erosions-waechter] ${warnungen.length} Produkt(e) mit Margen-Erosion gemeldet.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[71-margen-erosions-waechter] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[71-margen-erosions-waechter] Fehler:', err);
  process.exit(1);
});
