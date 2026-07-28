// Umsatz-Prognose - wöchentliche Hochrechnung ob das Monatsziel erreicht wird, mit Coaching
// Original: n8n Workflow "31_Umsatz_Prognose" · Zeitplan: sonntags 20:00
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

async function main() {
  const ziel = parseFloat(config.MONATSZIEL_UMSATZ || '10000');
  const vor28Tagen = new Date();
  vor28Tagen.setDate(vor28Tagen.getDate() - 28);

  const orders = (await getOrdersSince(vor28Tagen)).filter((o) => !o.cancelled_at);
  const jetzt = new Date();
  const tagImMonat = jetzt.getDate();
  const tageImMonat = new Date(jetzt.getFullYear(), jetzt.getMonth() + 1, 0).getDate();

  let umsatz28 = 0;
  let umsatzMonat = 0;
  for (const o of orders) {
    const p = parseFloat(o.total_price || 0);
    umsatz28 += p;
    const d = new Date(o.created_at);
    if (d.getMonth() === jetzt.getMonth() && d.getFullYear() === jetzt.getFullYear()) umsatzMonat += p;
  }

  const proTag = umsatz28 / 28;
  const prognose = umsatzMonat + proTag * (tageImMonat - tagImMonat);
  const zielProzent = ziel > 0 ? (prognose / ziel) * 100 : 0;
  const restBenoetigtProTag = ziel > umsatzMonat ? (ziel - umsatzMonat) / Math.max(1, tageImMonat - tagImMonat) : 0;

  const daten = `Tag ${tagImMonat} von ${tageImMonat} im Monat${NL}Umsatz bisher diesen Monat: ${umsatzMonat.toFixed(0)}${NL}Tempo (Schnitt/Tag, 28 Tage): ${proTag.toFixed(0)}${NL}PROGNOSE Monatsende: ~${prognose.toFixed(0)} (${zielProzent.toFixed(0)}% vom Ziel ${ziel.toFixed(0)})${NL}Nötiger Tagesumsatz, um Ziel noch zu schaffen: ~${restBenoetigtProTag.toFixed(0)}`;

  const prompt = `Du bist Finanz-Coach für den Onlineshop "${config.SHOP_NAME}".${NL}${NL}ZAHLEN:${NL}${daten}${NL}${NL}Gib mir kurz und ehrlich auf Deutsch (Du-Form):${NL}1. Liegen wir auf Kurs, drüber oder drunter? (1 Satz, klare Ansage)${NL}2. Wenn drunter: die 2 realistischsten Hebel, um bis Monatsende aufzuholen${NL}3. Wenn drüber: was jetzt verdoppeln, damit es so bleibt${NL}${NL}Maximal 600 Zeichen, Klartext ohne Markdown, Emojis als Trenner.`;

  const coaching = await askClaude(prompt, { maxTokens: 900 });

  await notifyTelegram(`UMSATZ-PROGNOSE - ${config.SHOP_NAME}${NL}--------------------${NL}${daten}${NL}${NL}${coaching}`);

  console.log(`[31-umsatz-prognose] Prognose: ${prognose.toFixed(0)} (${zielProzent.toFixed(0)}% vom Ziel)`);
}

main().catch((err) => {
  console.error('[31-umsatz-prognose] Fehler:', err);
  process.exit(1);
});
