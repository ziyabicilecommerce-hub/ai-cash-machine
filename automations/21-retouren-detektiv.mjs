// Retouren-Detektiv - wöchentlicher Report über Retourenquote, betroffene Produkte und Gründe
// Original: n8n Workflow "21_Retouren_Detektiv" · Zeitplan: montags 09:00
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askKI } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);
  const orders = await getOrdersSince(vor30Tagen);

  let gesamt = 0;
  let mitRetoure = 0;
  let erstattetSumme = 0;
  const proProdukt = {};
  const gruende = {};

  for (const o of orders) {
    gesamt++;
    const refunds = o.refunds || [];
    if (refunds.length === 0) continue;
    mitRetoure++;
    for (const r of refunds) {
      for (const rli of r.refund_line_items || []) {
        const titel = rli.line_item?.title || 'Unbekannt';
        proProdukt[titel] = (proProdukt[titel] || 0) + (rli.quantity || 1);
        erstattetSumme += parseFloat(rli.subtotal || 0);
      }
      const grund = (r.note || '').trim();
      if (grund) gruende[grund] = (gruende[grund] || 0) + 1;
    }
  }

  const quote = gesamt ? ((mitRetoure / gesamt) * 100).toFixed(1) : '0';
  const topProd = Object.entries(proProdukt).sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => `- ${e[0]}: ${e[1]}x zurück`);
  const topGruende = Object.entries(gruende).sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => `- "${e[0]}": ${e[1]}x`);

  const daten = `Zeitraum: letzte 30 Tage${NL}Bestellungen gesamt: ${gesamt}${NL}Mit Retoure/Erstattung: ${mitRetoure} (${quote}%)${NL}Erstatteter Warenwert: ~${erstattetSumme.toFixed(2)}${NL}${NL}Am häufigsten zurückgeschickt:${NL}${topProd.length ? topProd.join(NL) : '- keine Produktdaten'}${NL}${NL}Angegebene Gründe (aus Refund-Notizen):${NL}${topGruende.length ? topGruende.join(NL) : '- keine Notizen hinterlegt'}`;

  const prompt = `Du bist Retouren-/Qualitäts-Analyst für den Onlineshop "${config.SHOP_NAME}".${NL}${NL}DATEN:${NL}${daten}${NL}${NL}Analysiere auf Deutsch:${NL}1. EINSCHÄTZUNG der Retourenquote (gut/normal/alarmierend für E-Commerce?)${NL}2. MUSTER: Welche Produkte/Gründe stechen heraus? Was könnte dahinter stecken (Größe, Erwartung, Qualität, Versand)?${NL}3. DIE 3 wirkungsvollsten Maßnahmen, um genau diese Retouren zu senken (konkret: Produkttext, Fotos, Größen-Guide, Verpackung...)${NL}4. Falls Notizen fehlen: kurzer Tipp, wie man Retourengründe sauber erfasst${NL}${NL}Antworte als sauberes HTML (h2/h3, Listen), ohne html/body-Gerüst, kein Markdown-Codeblock.`;

  const html = await askKI(prompt, { maxTokens: 3000 });

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Retouren-Report (30 Tage) - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${html}</div>`,
  });

  console.log(`[21-retouren-detektiv] Report versendet, Retourenquote ${quote}%`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[21-retouren-detektiv] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[21-retouren-detektiv] Fehler:', err);
  process.exit(1);
});
