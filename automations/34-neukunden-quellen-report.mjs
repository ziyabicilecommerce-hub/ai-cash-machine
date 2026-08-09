// Neukunden-Quellen-Report - wöchentliche Analyse, welche Verkaufskanäle/Referrer Umsatz bringen
// Original: n8n Workflow "34_Neukunden_Quellen_Report" · Zeitplan: montags 08:30
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

function host(u) {
  try {
    return (u || '').split('/')[2] || u || 'direkt';
  } catch {
    return 'direkt';
  }
}

function top(obj, n) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);
  const orders = (await getOrdersSince(vor30Tagen)).filter((o) => !o.cancelled_at);

  const quelleUmsatz = {};
  const quelleAnzahl = {};
  const referrer = {};

  for (const o of orders) {
    const p = parseFloat(o.total_price || 0);
    const src = o.source_name || 'unbekannt';
    quelleUmsatz[src] = (quelleUmsatz[src] || 0) + p;
    quelleAnzahl[src] = (quelleAnzahl[src] || 0) + 1;
    const ref = host(o.referring_site) || 'direkt/keine';
    referrer[ref] = (referrer[ref] || 0) + 1;
  }

  const tQuelle = top(quelleUmsatz, 8).map((e) => `- ${e[0]}: ${e[1].toFixed(0)} Umsatz (${quelleAnzahl[e[0]] || 0} Bestellungen)`);
  const tRef = top(referrer, 8).map((e) => `- ${e[0]}: ${e[1]} Bestellungen`);

  const daten = `Umsatz nach Verkaufskanal (source_name):${NL}${tQuelle.length ? tQuelle.join(NL) : '- keine Daten'}${NL}${NL}Herkunft/Referrer (woher kamen die Besucher):${NL}${tRef.length ? tRef.join(NL) : '- keine Daten'}`;

  const prompt = `Du bist Traffic-/Growth-Analyst für den Onlineshop "${config.SHOP_NAME}".${NL}${NL}DATEN (letzte 30 Tage):${NL}${daten}${NL}${NL}Analysiere auf Deutsch:${NL}1. Welcher Kanal/welche Quelle bringt das meiste Geld - und welche wird unterschätzt?${NL}2. Wo steckt ungenutztes Potenzial (Kanal mit Bestellungen aber wenig Fokus)?${NL}3. DIE 2 konkreten Maßnahmen für diese Woche, um den stärksten Kanal auszubauen${NL}4. Falls fast alles "direkt/unbekannt" ist: Tipp, wie man Herkunft sauber trackt (UTM/Parameter)${NL}${NL}Antworte als sauberes HTML (h2/h3, Listen), ohne html/body-Gerüst, kein Markdown-Codeblock.`;

  const html = await askClaude(prompt, { maxTokens: 2500 });

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Traffic-Quellen-Report (30 Tage) - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${html}</div>`,
  });

  console.log('[34-neukunden-quellen-report] Report versendet');
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[34-neukunden-quellen-report] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[34-neukunden-quellen-report] Fehler:', err);
  process.exit(1);
});
