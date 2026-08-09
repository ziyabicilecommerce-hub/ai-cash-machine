// Lager-Wächter - warnt bevor Bestseller ausverkauft sind, basierend auf Verkaufstempo
// Original: n8n Workflow "20_Lager_Wächter" · Zeitplan: täglich 07:00
import { config } from './lib/config.mjs';
import { getProducts, getOrdersSince } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

async function main() {
  const warnTage = parseFloat(config.REICHWEITE_TAGE_WARNUNG || '10');
  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);

  const orders = (await getOrdersSince(vor30Tagen)).filter((o) => !o.cancelled_at);
  const verkauf = {};
  for (const o of orders) {
    for (const li of o.line_items || []) {
      const key = li.variant_id || li.title;
      verkauf[key] = (verkauf[key] || 0) + li.quantity;
    }
  }

  const produkte = await getProducts({ limit: '250', fields: 'id,title,variants' });
  const kritisch = [];
  const ausverkauft = [];

  for (const p of produkte) {
    for (const v of p.variants || []) {
      const bestand = parseInt(v.inventory_quantity);
      if (isNaN(bestand)) continue;
      const proTag = (verkauf[v.id] || 0) / 30;
      const name = p.title + (v.title && v.title !== 'Default Title' ? ` (${v.title})` : '');
      if (bestand <= 0 && proTag > 0) {
        ausverkauft.push(`- ${name} | AUSVERKAUFT, verkauft sich aber ~${(proTag * 7).toFixed(1)}x/Woche!`);
        continue;
      }
      if (proTag <= 0) continue;
      const reichweite = bestand / proTag;
      if (reichweite <= warnTage) kritisch.push({ name, bestand, proTag, reichweite });
    }
  }
  kritisch.sort((a, b) => a.reichweite - b.reichweite);

  let prompt;
  if (kritisch.length === 0 && ausverkauft.length === 0) {
    prompt = `Sage in einem lockeren, kurzen Satz auf Deutsch (Du-Form), dass der Lagerbestand von "${config.SHOP_NAME}" gesund ist und aktuell kein Bestseller in Gefahr ist auszulaufen. Klartext, ohne Markdown.`;
  } else {
    const liste = kritisch.map(
      (k) => `- ${k.name} | Bestand: ${k.bestand} | Tempo: ~${(k.proTag * 7).toFixed(1)}x/Woche | reicht noch ~${k.reichweite.toFixed(0)} Tage`
    );
    prompt = `Du bist Einkaufs-/Supply-Chain-Manager für den Onlineshop "${config.SHOP_NAME}".${NL}${NL}Diese Artikel gehen bald aus (Reichweite unter ${warnTage} Tage):${NL}${liste.join(NL)}${NL}${
      ausverkauft.length ? `${NL}BEREITS AUSVERKAUFT (aber gefragt):${NL}${ausverkauft.join(NL)}${NL}` : ''
    }${NL}Gib mir eine kurze, konkrete Nachbestell-Empfehlung auf Deutsch: Was zuerst nachbestellen, grobe Mengen-Idee (für ~30 Tage Puffer), und was der größte Umsatzverlust wäre wenn es leer läuft. Knapp, Klartext ohne Markdown.`;
  }

  const rat = await askClaude(prompt, { maxTokens: 1500 });
  await notifyTelegram(`LAGER-WÄCHTER - ${config.SHOP_NAME}${NL}--------------------${NL}${NL}${rat}`);

  console.log(`[20-lager-waechter] ${kritisch.length} kritisch, ${ausverkauft.length} ausverkauft`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[20-lager-waechter] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[20-lager-waechter] Fehler:', err);
  process.exit(1);
});
