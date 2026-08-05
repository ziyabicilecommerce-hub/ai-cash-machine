// Ad Commander - Kampagnen-Portfolio-Übersicht über ALLE aktiven Meta-Kampagnen
// hinweg, mit Budget-Umschichtungs-Empfehlung von schwachen zu starken
// Kampagnen. Neu, kein n8n-Workflow · Zeitplan: wöchentlich.
//
// Unterscheidet sich bewusst von den bestehenden Ads-Automationen: #11
// Ads-Manager bewertet einzelne ADS (killen/skalieren/beobachten), #42 Auto-
// Skalierer erhöht Budget pro AD-SET. Ad Commander schaut eine Ebene höher -
// auf KAMPAGNEN-Ebene - und schlägt vor, Budget zwischen Kampagnen zu
// verschieben, nicht nur einzelne Ad-Sets zu skalieren.
//
// TikTok Ads: noch nicht angebunden. TikToks Marketing-API-Vertrag wurde in
// dieser Session nicht verifiziert (anders als Meta/Binance/OpenAI, wo der
// Code gegen bekannte, geprüfte Endpunkte gebaut ist) - das lieber offen
// lassen als raten und stillschweigend falsche Felder verwenden. Bei Bedarf
// mit echtem TikTok-Ads-Account nachrüsten.
import { config } from './lib/config.mjs';
import { getAdInsights } from './lib/meta.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';

const WHATSAPP_MAX_CHARS = 3500;

function purchaseValueAgg(row) {
  const x = (row.action_values || []).find((v) =>
    ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'].includes(v.action_type),
  );
  return x ? parseFloat(x.value) : 0;
}

async function main() {
  if (!config.META_ACCESS_TOKEN || !config.META_AD_ACCOUNT_ID) {
    console.log('[56-ad-commander] META_ACCESS_TOKEN/META_AD_ACCOUNT_ID nicht konfiguriert - übersprungen.');
    return;
  }

  const insights = await getAdInsights({
    level: 'campaign',
    datePreset: 'last_7d',
    fields: 'campaign_id,campaign_name,spend,action_values',
  });

  if (!insights.length) {
    await notifyWhatsapp('📈 *Ad Commander*: Keine Kampagnen-Daten der letzten 7 Tage gefunden.');
    console.log('[56-ad-commander] Keine Kampagnen-Insights gefunden.');
    return;
  }

  const kampagnen = insights.map((row) => {
    const spend = parseFloat(row.spend || 0);
    const umsatz = purchaseValueAgg(row);
    const roas = spend > 0 ? umsatz / spend : 0;
    return { name: row.campaign_name, spend, umsatz, roas };
  });
  kampagnen.sort((a, b) => b.roas - a.roas);

  const gesamtSpend = kampagnen.reduce((s, k) => s + k.spend, 0);
  const gesamtUmsatz = kampagnen.reduce((s, k) => s + k.umsatz, 0);
  const gesamtRoas = gesamtSpend > 0 ? gesamtUmsatz / gesamtSpend : 0;

  const liste = kampagnen
    .map((k, i) => `${i + 1}. ${k.name} | Spend ${k.spend.toFixed(2)} | Umsatz ${k.umsatz.toFixed(2)} | ROAS ${k.roas.toFixed(2)}`)
    .join('\n');

  const prompt = `Du bist Head of Performance Marketing für den Onlineshop "${config.SHOP_NAME}". Ziel-ROAS: ${config.ROAS_ZIEL || '2.0'}.

Kampagnen-Portfolio der letzten 7 Tage (bereits nach ROAS sortiert):
${liste}

Gesamt: Spend ${gesamtSpend.toFixed(2)}, Umsatz ${gesamtUmsatz.toFixed(2)}, ROAS ${gesamtRoas.toFixed(2)}

Gib eine KONKRETE Budget-Umschichtungs-Empfehlung: von welchen schwachen Kampagnen (niedriger ROAS) sollte Budget zu welchen starken (hoher ROAS, Spielraum für mehr Skalierung) verschoben werden? Nenne ungefähre Prozent-Verschiebung. Maximal 3 Sätze, direkt und konkret, keine Floskeln.

Antworte NUR mit validem JSON, ohne Markdown:
{"empfehlung": "..."}`;

  const antwort = await askClaude(prompt, { maxTokens: 800 });
  const daten = parseJsonFromText(antwort, { empfehlung: antwort });

  const zeilen = [
    `📈 *Ad Commander* - Kampagnen-Portfolio (letzte 7 Tage)`,
    `Gesamt: Spend ${gesamtSpend.toFixed(2)} · Umsatz ${gesamtUmsatz.toFixed(2)} · ROAS ${gesamtRoas.toFixed(2)}`,
    liste,
    `*Budget-Empfehlung:*\n${daten.empfehlung}`,
    `(TikTok Ads noch nicht angebunden - nur Meta aktuell.)`,
  ];

  const chunks = chunkZeilen(zeilen, WHATSAPP_MAX_CHARS);
  for (const chunk of chunks) {
    await notifyWhatsapp(chunk.join('\n\n'));
  }

  console.log(`[56-ad-commander] ${kampagnen.length} Kampagne(n) analysiert, Gesamt-ROAS ${gesamtRoas.toFixed(2)}.`);
}

main().catch((err) => {
  console.error('[56-ad-commander] Fehler:', err);
  process.exit(1);
});
