// Winning-Ad-neue-Creatives - findet wöchentlich die beste Ad (30 Tage) und lässt Claude 5 frische Varianten bauen
// Original: n8n Workflow "44_Winning_Ad_neue_Creatives" · Zeitplan: montags 07:00
import { config } from './lib/config.mjs';
import { getAdInsights, purchaseValue } from './lib/meta.mjs';
import { askClaude } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const minSpend = parseFloat(config.MIN_SPEND || '30');
  const ads = await getAdInsights({
    level: 'ad',
    datePreset: 'last_30d',
    fields: 'ad_name,campaign_name,spend,ctr,action_values',
    limit: 300,
  });

  let best = null;
  for (const a of ads) {
    const spend = parseFloat(a.spend || 0);
    if (spend < minSpend) continue;
    const roas = spend > 0 ? purchaseValue(a) / spend : 0;
    if (!best || roas > best.roas) best = { name: a.ad_name, kampagne: a.campaign_name, roas, spend, ctr: a.ctr };
  }

  let prompt;
  if (!best) {
    prompt =
      'Sage in einem kurzen Satz auf Deutsch, dass es diese Woche noch nicht genug Ad-Daten (Mindest-Spend) für eine Gewinner-Analyse gab. Ohne Markdown.';
  } else {
    prompt = `Du bist Performance-Creative-Director für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE}).${NL}${NL}Das ist unsere BESTE Ad der letzten 30 Tage:${NL}- Ad-Name/Angle: ${best.name}${NL}- Kampagne: ${best.kampagne}${NL}- ROAS: ${best.roas.toFixed(2)} | CTR: ${best.ctr || '?'}% | Spend: ${best.spend.toFixed(2)}${NL}${NL}Der Gewinner brennt mit der Zeit aus (Ad-Fatigue). Baue 5 FRISCHE Varianten, die denselben Kern-Winkel weiterdrehen, aber neu wirken:${NL}Für JEDE Variante:${NL}- Neue Angle-Variation (was diesmal anders ist)${NL}- Hook / Primary Text (die ersten Zeilen der Ad)${NL}- Headline (max 8 Wörter)${NL}- Bild-/Video-Idee${NL}- CTA${NL}${NL}Antworte als sauberes HTML: jede Variante als eigene Karte (<div> mit Rahmen, Nummer, gelabelte Felder). Ohne html/body-Gerüst, kein Markdown-Codeblock.`;
  }

  const html = await askClaude(prompt, { maxTokens: 4000 });

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Neue Creatives aus deiner Gewinner-Ad - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;">${html}</div>`,
  });

  console.log(`[44-winning-ad-neue-creatives] ${best ? `Gewinner: ${best.name}` : 'kein Gewinner gefunden'}`);
}

main().catch((err) => {
  console.error('[44-winning-ad-neue-creatives] Fehler:', err);
  process.exit(1);
});
