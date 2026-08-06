// Ads-Autopilot-Agent - führt eine echte Budget-Umschichtung zwischen dem
// besten und dem schwächsten aktiven Ad-Set aus, statt wie Ad Commander (#56)
// nur eine Empfehlung auf Kampagnen-Ebene auszusprechen. Ergänzt (nicht
// ersetzt) #42 Auto-Skalierer (erhöht nur Gewinner, ohne Budget woanders
// wegzunehmen) und #43 Notbremse (stoppt nur, verschiebt nichts). Der
// Autopilot ist der einzige, der wirklich Budget von SCHWACH zu STARK
// UMSCHICHTET. Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Sicherheitsgrenzen: nur EIN Shift pro Lauf (bester <- schwächster
// Ad-Set), gedeckelt auf ADS_AUTOPILOT_MAX_SHIFT_PROZENT des schwächsten
// Budgets, niemals unter eine Mindest-Budget-Grenze. Wie bei den anderen
// budget-bewegenden Agenten standardmäßig NUR EMPFEHLUNG, bis
// AUTO_BUDGET_UMSCHICHTEN explizit auf "ja" steht.
import { config } from './lib/config.mjs';
import { getAdInsights, getAdSets, purchaseValue, updateAdSetBudget } from './lib/meta.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';
const MINDEST_BUDGET_CENT = 500; // nie unter 5.00 (Währungseinheit) drücken

async function main() {
  if (!config.META_ACCESS_TOKEN || !config.META_AD_ACCOUNT_ID) {
    console.log('[64-ads-autopilot-agent] META_ACCESS_TOKEN/META_AD_ACCOUNT_ID nicht konfiguriert - übersprungen.');
    return;
  }

  const minSpend = parseFloat(config.ADS_AUTOPILOT_MIN_SPEND || '15');
  const maxShift = parseFloat(config.ADS_AUTOPILOT_MAX_SHIFT_PROZENT || '15') / 100;
  const autoAn = config.AUTO_BUDGET_UMSCHICHTEN === 'ja';

  const insights = await getAdInsights({
    level: 'adset',
    datePreset: 'last_7d',
    fields: 'adset_id,adset_name,spend,action_values',
  });
  const adsets = await getAdSets({ fields: 'id,name,daily_budget,status,effective_status' });
  const budgetMap = {};
  for (const a of adsets) budgetMap[a.id] = a;

  const kandidaten = [];
  for (const row of insights) {
    const as = budgetMap[row.adset_id];
    if (!as || !as.daily_budget || (as.effective_status || as.status) !== 'ACTIVE') continue;
    const spend = parseFloat(row.spend || 0);
    if (spend < minSpend) continue;
    const roas = spend > 0 ? purchaseValue(row) / spend : 0;
    kandidaten.push({ id: row.adset_id, name: row.adset_name, roas, budget: parseInt(as.daily_budget, 10) });
  }

  if (kandidaten.length < 2) {
    console.log(`[64-ads-autopilot-agent] Nur ${kandidaten.length} Ad-Set(s) mit genug Spend - nichts zum Umschichten.`);
    return;
  }

  kandidaten.sort((a, b) => b.roas - a.roas);
  const bester = kandidaten[0];
  const schwaechster = kandidaten[kandidaten.length - 1];

  if (bester.id === schwaechster.id || bester.roas <= schwaechster.roas) {
    console.log('[64-ads-autopilot-agent] Kein klarer Unterschied zwischen bestem und schwächstem Ad-Set - nichts umgeschichtet.');
    return;
  }

  let shiftCent = Math.round(schwaechster.budget * maxShift);
  const schwaechsterNeu = schwaechster.budget - shiftCent;
  if (schwaechsterNeu < MINDEST_BUDGET_CENT) {
    shiftCent = schwaechster.budget - MINDEST_BUDGET_CENT;
  }
  if (shiftCent <= 0) {
    console.log('[64-ads-autopilot-agent] Schwächstes Ad-Set schon an der Mindest-Budget-Grenze - nichts umgeschichtet.');
    return;
  }

  const besterNeu = bester.budget + shiftCent;
  const schwaechsterFinal = schwaechster.budget - shiftCent;

  const text = `📊 ADS-AUTOPILOT-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}Bestes Ad-Set: ${bester.name} | ROAS ${bester.roas.toFixed(2)} | Budget ${(bester.budget / 100).toFixed(2)} -> ${(besterNeu / 100).toFixed(2)}${NL}Schwächstes Ad-Set: ${schwaechster.name} | ROAS ${schwaechster.roas.toFixed(2)} | Budget ${(schwaechster.budget / 100).toFixed(2)} -> ${(schwaechsterFinal / 100).toFixed(2)}${NL}${NL}${autoAn ? 'AUTO_BUDGET_UMSCHICHTEN ist AN: Budgets werden jetzt live umgeschichtet!' : 'AUTO_BUDGET_UMSCHICHTEN steht auf nein - nur Empfehlung, ich ändere nichts.'}`;
  await notifyTelegram(text);

  if (autoAn) {
    await updateAdSetBudget(bester.id, besterNeu);
    await updateAdSetBudget(schwaechster.id, schwaechsterFinal);
  }

  console.log(`[64-ads-autopilot-agent] Shift ${(shiftCent / 100).toFixed(2)} von "${schwaechster.name}" zu "${bester.name}" ${autoAn ? 'ausgeführt' : 'empfohlen'}.`);
}

main().catch((err) => {
  console.error('[64-ads-autopilot-agent] Fehler:', err);
  process.exit(1);
});
