// Ads-Manager - tägliches Meta-Ads-Briefing mit Kill/Skalier-Empfehlungen (+ optional Auto-Pause)
// Original: n8n Workflow "11_Ads_Manager" · Zeitplan: täglich 08:30
import { config } from './lib/config.mjs';
import { getAdInsights, purchaseCount, purchaseValue, pauseAd } from './lib/meta.mjs';
import { askClaude } from './lib/claude.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

async function main() {
  const ads = await getAdInsights({
    fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,actions,action_values',
  });

  const roasZiel = parseFloat(config.ROAS_ZIEL);
  const minSpend = parseFloat(config.MIN_SPEND_FUER_BEWERTUNG);

  if (ads.length === 0) {
    await notifyTelegram(`ADS-MANAGER - ${config.SHOP_NAME}${NL}${NL}Gestern liefen keine Ads (oder noch keine Daten). Nichts zu tun.`);
    console.log('[11-ads-manager] Keine Ads gefunden');
    return;
  }

  const bewertet = [];
  const killListe = [];

  for (const a of ads) {
    const spend = parseFloat(a.spend || 0);
    const rev = purchaseValue(a);
    const k = purchaseCount(a);
    const roas = spend > 0 ? rev / spend : 0;
    let status = 'BEOBACHTEN';
    if (spend >= minSpend && roas >= roasZiel) status = 'SKALIEREN';
    if (spend >= minSpend && roas < 1) {
      status = 'KILLEN';
      killListe.push({ ad_id: a.ad_id, ad_name: a.ad_name, spend: spend.toFixed(2), roas: roas.toFixed(2) });
    }
    bewertet.push(
      `- [${status}] "${a.ad_name}" (Kampagne: ${a.campaign_name}) | Spend: ${spend.toFixed(2)} | Käufe: ${k} | Umsatz: ${rev.toFixed(2)} | ROAS: ${roas.toFixed(2)} | CTR: ${a.ctr || '0'}% | CPC: ${a.cpc || '0'}`
    );
  }

  const prompt = `Du bist Senior Media Buyer und managst die Meta-Ads vom Onlineshop "${config.SHOP_NAME}". Ziel-ROAS: ${roasZiel}. Hier die Performance von GESTERN (vorklassifiziert):${NL}${NL}${bewertet.join(NL)}${NL}${NL}Gib mir dein tägliches Ads-Briefing auf Deutsch:${NL}1. LAGE in einem Satz (Gesamtspend vs. Gesamtumsatz, läuft es?)${NL}2. ENTSCHEIDUNGEN pro auffälliger Ad: killen / skalieren (+20-30% Budget) / beobachten - mit 1-Satz-Begründung. Bei Skalier-Kandidaten: konkreter Budget-Vorschlag.${NL}3. MUSTER: Was haben die Gewinner gemeinsam, was die Verlierer? (Hook? Zielgruppe? Format?)${NL}4. EIN Test für morgen.${NL}Sei knapp und direkt, keine Floskeln. Klartext ohne Markdown, Emojis als Trenner.`;

  const briefing = await askClaude(prompt, { maxTokens: 2500 });

  let killInfo = '';
  if (killListe.length > 0) {
    killInfo = `${NL}${NL}Kill-Kandidaten (ROAS unter 1):${NL}${killListe
      .map((k) => `- ${k.ad_name} (Spend ${k.spend}, ROAS ${k.roas})`)
      .join(NL)}`;
    killInfo +=
      config.AUTO_PAUSE === 'ja'
        ? `${NL}${NL}AUTO-PAUSE ist AN: Diese Ads werden jetzt automatisch pausiert!`
        : `${NL}${NL}AUTO_PAUSE steht auf nein - ich pausiere nichts, nur Empfehlung.`;
  }

  const voll = `ADS-MANAGER - ${config.SHOP_NAME}${NL}--------------------${NL}${NL}${briefing}${killInfo}`;
  for (let i = 0; i < voll.length; i += 3900) {
    await notifyTelegram(voll.slice(i, i + 3900));
  }

  if (config.AUTO_PAUSE === 'ja') {
    for (const k of killListe) {
      await pauseAd(k.ad_id);
    }
  }

  console.log(`[11-ads-manager] Briefing versendet, ${killListe.length} Kill-Kandidat(en)`);
}

main().catch((err) => {
  console.error('[11-ads-manager] Fehler:', err);
  process.exit(1);
});
