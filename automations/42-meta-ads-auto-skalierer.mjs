// Meta-Ads-Auto-Skalierer - erhöht täglich das Budget von Ad-Sets, die das ROAS-Ziel schlagen
// Original: n8n Workflow "42_Meta_Ads_Auto_Skalierer" · Zeitplan: täglich 08:45
import { config } from './lib/config.mjs';
import { getAdInsights, getAdSets, purchaseValue, updateAdSetBudget } from './lib/meta.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

async function main() {
  const roasZiel = parseFloat(config.ROAS_ZIEL || '2.0');
  const minSpend = parseFloat(config.MIN_SPEND || '15');
  const skalier = parseFloat(config.SKALIER_PROZENT || '20') / 100;
  const maxCent = parseFloat(config.MAX_TAGESBUDGET || '100') * 100;
  const autoSkalieren = config.AUTO_SKALIEREN === 'ja';

  const insights = await getAdInsights({
    level: 'adset',
    datePreset: 'yesterday',
    fields: 'adset_id,adset_name,spend,action_values',
  });
  const adsets = await getAdSets({ fields: 'id,name,daily_budget,status,effective_status' });
  const budgetMap = {};
  for (const a of adsets) budgetMap[a.id] = a;

  const gewinner = [];
  const skalierListe = [];
  for (const row of insights) {
    const spend = parseFloat(row.spend || 0);
    const rev = purchaseValue(row);
    const roas = spend > 0 ? rev / spend : 0;
    if (spend < minSpend || roas < roasZiel) continue;
    const as = budgetMap[row.adset_id];
    if (!as || !as.daily_budget) continue;
    if ((as.effective_status || as.status) !== 'ACTIVE') continue;
    const alt = parseInt(as.daily_budget);
    let neu = Math.round(alt * (1 + skalier));
    if (neu > maxCent) neu = maxCent;
    if (neu <= alt) continue;
    gewinner.push(`- ${row.adset_name} | ROAS ${roas.toFixed(2)} | Budget ${(alt / 100).toFixed(2)} -> ${(neu / 100).toFixed(2)}`);
    skalierListe.push({ adset_id: row.adset_id, neu_budget: neu });
  }

  let text;
  if (gewinner.length === 0) {
    text = `META AUTO-SKALIERER - ${config.SHOP_NAME}${NL}${NL}Keine Ad-Sets über ROAS-Ziel (${roasZiel}) mit Spielraum. Nichts zu skalieren heute.`;
  } else {
    text = `META AUTO-SKALIERER - ${config.SHOP_NAME}${NL}--------------------${NL}Gewinner-Ad-Sets (ROAS >= ${roasZiel}):${NL}${gewinner.join(NL)}${NL}${NL}${autoSkalieren ? 'AUTO-SKALIEREN ist AN: Budgets werden jetzt automatisch erhöht!' : 'AUTO_SKALIEREN steht auf nein - nur Empfehlung, ich ändere nichts.'}`;
  }
  await notifyTelegram(text);

  if (autoSkalieren) {
    for (const k of skalierListe) await updateAdSetBudget(k.adset_id, k.neu_budget);
  }

  console.log(`[42-meta-ads-auto-skalierer] ${gewinner.length} Gewinner gefunden, autoSkalieren=${autoSkalieren}`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[42-meta-ads-auto-skalierer] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[42-meta-ads-auto-skalierer] Fehler:', err);
  process.exit(1);
});
