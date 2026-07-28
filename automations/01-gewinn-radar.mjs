// Gewinn Radar - täglicher Profit-Report mit 3 KI-Tipps per Telegram
// Original: n8n Workflow "01_Gewinn_Radar" · Zeitplan: täglich 08:00
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

async function main() {
  const gestern = new Date();
  gestern.setDate(gestern.getDate() - 1);
  gestern.setHours(0, 0, 0, 0);

  const orders = (await getOrdersSince(gestern)).filter((o) => !o.cancelled_at);

  let umsatz = 0;
  let retourenWert = 0;
  let waehrung = 'EUR';
  const produkte = {};

  for (const o of orders) {
    umsatz += parseFloat(o.total_price || 0);
    waehrung = o.currency || waehrung;
    for (const r of o.refunds || []) {
      for (const t of r.transactions || []) retourenWert += parseFloat(t.amount || 0);
    }
    for (const li of o.line_items || []) {
      produkte[li.title] = (produkte[li.title] || 0) + li.quantity;
    }
  }

  const anzahl = orders.length;
  const aov = anzahl ? umsatz / anzahl : 0;
  const top = Object.entries(produkte)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map((e, i) => `${i + 1}. ${e[0]} (${e[1]}x)`)
    .join(NL);

  const werbekosten = parseFloat(config.WERBEKOSTEN_PRO_TAG || 0);
  const produktkosten = umsatz * (parseFloat(config.PRODUKTKOSTEN_PROZENT || 0) / 100);
  const gewinn = umsatz - retourenWert - werbekosten - produktkosten;

  const zahlen = [
    `Umsatz: ${umsatz.toFixed(2)} ${waehrung}`,
    `Bestellungen: ${anzahl}`,
    `Durchschnittlicher Bestellwert: ${aov.toFixed(2)} ${waehrung}`,
    `Erstattungen: ${retourenWert.toFixed(2)} ${waehrung}`,
    `Werbekosten: ${werbekosten.toFixed(2)} ${waehrung}`,
    `Geschätzter Gewinn: ${gewinn.toFixed(2)} ${waehrung}`,
    '',
    'Top-Produkte:',
    top || 'keine Verkäufe',
  ].join(NL);

  const prompt = `Du bist E-Commerce-Berater für den Shop "${config.SHOP_NAME}".${NL}Hier die Zahlen von gestern:${NL}${NL}${zahlen}${NL}${NL}Gib genau 3 kurze, KONKRETE Handlungsempfehlungen für heute (jeweils 1-2 Sätze, direkt umsetzbar, keine Floskeln). Nummeriert 1-3, auf Deutsch, Du-Form. Antworte nur mit den 3 Punkten.`;

  const tipps = await askClaude(prompt, { maxTokens: 1000 });

  const telegramText = `GEWINN-RADAR · ${config.SHOP_NAME}${NL}Gestern:${NL}${NL}${zahlen}${NL}${NL}Deine 3 Moves für heute:${NL}${tipps}`;

  await notifyTelegram(telegramText);
  console.log(telegramText);
}

main().catch((err) => {
  console.error('[01-gewinn-radar] Fehler:', err);
  process.exit(1);
});
