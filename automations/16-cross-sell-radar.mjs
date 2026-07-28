// Cross-Sell-Radar - passende Produktempfehlung X Tage nach dem letzten Kauf
// Original: n8n Workflow "16_Cross_Sell_Radar" · Zeitplan: täglich 15:00
import { config, isTestMode } from './lib/config.mjs';
import { getOrders, getProducts } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '16-cross-sell-radar';

async function main() {
  const tage = parseInt(config.KAUF_VOR_TAGEN || '14');
  const von = new Date();
  von.setDate(von.getDate() - (tage + 1));
  von.setHours(0, 0, 0, 0);
  const bis = new Date();
  bis.setDate(bis.getDate() - tage);
  bis.setHours(0, 0, 0, 0);

  const orders = (
    await getOrders({
      created_at_min: encodeURIComponent(von.toISOString()),
      created_at_max: encodeURIComponent(bis.toISOString()),
    })
  ).filter((o) => !o.cancelled_at && o.email);

  const produkte = await getProducts({ limit: '50', fields: 'id,title,handle,product_type,variants' });
  const katalog = produkte
    .slice(0, 25)
    .map((p) => `- ${p.title} | Typ: ${p.product_type || '-'} | Preis: ${p.variants?.[0]?.price || '?'} | Link: ${config.SHOP_URL}/products/${p.handle}`)
    .join(NL);

  const state = loadState(STATE_KEY);
  state.crosssell = state.crosssell || [];
  let verarbeitet = 0;

  for (const o of orders) {
    if (state.crosssell.includes(o.id)) continue;
    state.crosssell.push(o.id);
    verarbeitet++;

    const gekauft = (o.line_items || []).map((li) => li.title).join(', ');
    const vorname = o.customer?.first_name || '';

    const prompt = `Du bist Empfehlungs-Experte für den Onlineshop "${config.SHOP_NAME}".${NL}Der Kunde hat vor ${tage} Tagen gekauft: ${gekauft}${NL}Vorname: ${vorname || 'unbekannt (neutral anreden)'}${NL}${NL}Produktkatalog:${NL}${katalog}${NL}${NL}Aufgabe: (1) Wähle 1-2 Produkte aus dem Katalog, die WIRKLICH sinnvoll zum Gekauften passen (ergänzen, nicht ersetzen). Wenn nichts wirklich passt, nimm die 1-2 beliebtesten Allrounder. (2) Schreibe eine persönliche Empfehlungs-Mail auf Deutsch (Du-Form), max 120 Wörter: Einstieg = kurze Frage wie zufrieden er mit dem gekauften Produkt ist. Dann die Empfehlung als ehrlichen Tipp mit Produktlink(s) als Button/Link. KEIN Rabatt nötig. Mobiltaugliches HTML mit Inline-CSS.${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

    const antwort = await askClaude(prompt, { maxTokens: 2000 });
    const daten = parseJsonFromText(antwort, { betreff: 'Das könnte dir auch gefallen', html: antwort });

    const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
    await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });
  }

  if (state.crosssell.length > 2000) state.crosssell = state.crosssell.slice(-2000);
  saveState(STATE_KEY, state);

  console.log(`[16-cross-sell-radar] ${verarbeitet} Empfehlung(en) versendet`);
}

main().catch((err) => {
  console.error('[16-cross-sell-radar] Fehler:', err);
  process.exit(1);
});
