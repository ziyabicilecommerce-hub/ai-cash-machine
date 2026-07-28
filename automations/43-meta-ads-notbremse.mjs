// Meta-Ads-Notbremse - prüft alle 3 Stunden den Tages-ROAS und schlägt bei Verlustgefahr Alarm (optional Auto-Stop)
// Original: n8n Workflow "43_Meta_Ads_Notbremse" · Zeitplan: alle 3 Stunden
import { config } from './lib/config.mjs';
import { getAdInsights, getAdSets, purchaseValue, pauseAd } from './lib/meta.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

async function main() {
  const kritisch = parseFloat(config.KRITISCHER_ROAS || '0.7');
  const minSpend = parseFloat(config.MIN_SPEND_HEUTE || '30');
  const autoStop = config.AUTO_STOP === 'ja';

  const insights = await getAdInsights({
    level: 'account',
    datePreset: 'today',
    fields: 'spend,action_values',
    limit: 1,
  });
  const row = insights[0] || {};
  const spend = parseFloat(row.spend || 0);
  const rev = purchaseValue(row);
  const roas = spend > 0 ? rev / spend : 0;
  const notlage = spend >= minSpend && roas < kritisch;

  const adsets = notlage
    ? await getAdSets({ fields: 'id,name,effective_status', effectiveStatus: ['ACTIVE'] })
    : [];

  let text;
  if (!notlage) {
    text = `META NOTBREMSE - ${config.SHOP_NAME}${NL}${NL}Alles im grünen Bereich. Heute Spend ${spend.toFixed(2)}, Umsatz ${rev.toFixed(2)}, ROAS ${roas.toFixed(2)}. Keine Notbremse nötig.`;
  } else {
    text = `META NOTBREMSE AUSGELÖST - ${config.SHOP_NAME}${NL}--------------------${NL}Heute Spend ${spend.toFixed(2)} | Umsatz ${rev.toFixed(2)} | ROAS ${roas.toFixed(2)} (unter ${kritisch}!)${NL}Betroffene aktive Ad-Sets: ${adsets.length}${NL}${NL}${autoStop ? 'AUTO_STOP ist AN: Alle aktiven Ad-Sets werden JETZT pausiert!' : 'AUTO_STOP steht auf nein - ich pausiere nichts. Prüf die Ads selbst!'}`;
  }
  await notifyTelegram(text);

  if (notlage && autoStop) {
    for (const a of adsets) await pauseAd(a.id);
  }

  console.log(`[43-meta-ads-notbremse] notlage=${notlage} roas=${roas.toFixed(2)} autoStop=${autoStop}`);
}

main().catch((err) => {
  console.error('[43-meta-ads-notbremse] Fehler:', err);
  process.exit(1);
});
