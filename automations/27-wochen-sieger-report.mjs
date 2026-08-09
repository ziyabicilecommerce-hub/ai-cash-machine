// Wochen-Sieger-Report - feiert die Sieger-Zahlen der Woche (bester Tag/Uhrzeit/Produkt) mit Learning
// Original: n8n Workflow "27_Wochen_Sieger_Report" · Zeitplan: sonntags 19:00
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';
const TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function best(obj) {
  const e = Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
  return e || [null, 0];
}

async function main() {
  const vor7Tagen = new Date();
  vor7Tagen.setDate(vor7Tagen.getDate() - 7);
  const orders = (await getOrdersSince(vor7Tagen)).filter((o) => !o.cancelled_at);

  const proTag = {};
  const proStunde = {};
  const proProdukt = {};
  let umsatz = 0;
  let neu = 0;
  let wieder = 0;

  for (const o of orders) {
    const dt = new Date(o.created_at);
    const preis = parseFloat(o.total_price || 0);
    umsatz += preis;
    proTag[dt.getDay()] = (proTag[dt.getDay()] || 0) + preis;
    proStunde[dt.getHours()] = (proStunde[dt.getHours()] || 0) + 1;
    if (o.customer && parseInt(o.customer.orders_count || 1) <= 1) neu++;
    else wieder++;
    for (const li of o.line_items || []) proProdukt[li.title] = (proProdukt[li.title] || 0) + li.quantity;
  }

  const bTag = best(proTag);
  const bStunde = best(proStunde);
  const bProd = best(proProdukt);
  const aov = orders.length ? umsatz / orders.length : 0;

  const daten = `Bestellungen: ${orders.length} | Umsatz: ${umsatz.toFixed(2)} | AOV: ${aov.toFixed(2)}${NL}Bester Tag: ${
    bTag[0] !== null ? `${TAGE[bTag[0]]} (${bTag[1].toFixed(2)})` : 'k.A.'
  }${NL}Beste Uhrzeit: ${bStunde[0] !== null ? `${bStunde[0]}:00 Uhr (${bStunde[1]} Bestellungen)` : 'k.A.'}${NL}Top-Produkt: ${bProd[0] || 'k.A.'} (${bProd[1]}x)${NL}Neukunden: ${neu} | Wiederkäufer: ${wieder}`;

  const prompt = `Du bist Datencoach für den Onlineshop "${config.SHOP_NAME}". Hier die Sieger-Zahlen der letzten 7 Tage:${NL}${NL}${daten}${NL}${NL}Gib mir kurz und motivierend auf Deutsch (Du-Form):${NL}1. Was lief diese Woche am besten (1-2 Sätze, feier den Sieg)${NL}2. DAS eine Learning: Was sollte der Shop-Besitzer aus dem besten Tag/Uhrzeit/Produkt konkret nächste Woche tun? (z.B. Posts/Ads zur besten Zeit timen)${NL}3. EIN Fokus für nächste Woche${NL}${NL}Maximal 700 Zeichen, Klartext ohne Markdown, Emojis als Trenner.`;

  const learning = await askClaude(prompt, { maxTokens: 1000 });

  await notifyTelegram(`WOCHEN-SIEGER - ${config.SHOP_NAME}${NL}--------------------${NL}${daten}${NL}${NL}${learning}`);

  console.log('[27-wochen-sieger-report] Report versendet');
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[27-wochen-sieger-report] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[27-wochen-sieger-report] Fehler:', err);
  process.exit(1);
});
