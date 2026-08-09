// Marketing-Chef (KI-CMO) - wöchentliches strategisches Briefing (Lage, Prioritäten, Budget, Experiment)
// Original: n8n Workflow "12_Marketing_Chef_KI_CMO" · Zeitplan: sonntags 18:00
import { config } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

function statistik(orders) {
  orders = (orders || []).filter((o) => !o.cancelled_at);
  let umsatz = 0;
  let neukunden = 0;
  let stammkunden = 0;
  const produkte = {};
  for (const o of orders) {
    umsatz += parseFloat(o.total_price || 0);
    if (o.customer && parseInt(o.customer.orders_count || 1) <= 1) neukunden++;
    else stammkunden++;
    for (const li of o.line_items || []) produkte[li.title] = (produkte[li.title] || 0) + li.quantity;
  }
  const top = Object.entries(produkte).sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => `${e[0]} (${e[1]}x)`).join(', ');
  return { umsatz, anzahl: orders.length, aov: orders.length ? umsatz / orders.length : 0, neukunden, stammkunden, top };
}

function delta(a, b) {
  if (!b) return a > 0 ? '+unendlich' : '0%';
  return `${(((a - b) / b) * 100).toFixed(0)}%`;
}

async function main() {
  const vor7Tagen = new Date();
  vor7Tagen.setDate(vor7Tagen.getDate() - 7);
  const vor14Tagen = new Date();
  vor14Tagen.setDate(vor14Tagen.getDate() - 14);

  const dieseWocheOrders = await getOrders({ created_at_min: encodeURIComponent(vor7Tagen.toISOString()) });
  const vorwocheOrders = await getOrders({
    created_at_min: encodeURIComponent(vor14Tagen.toISOString()),
    created_at_max: encodeURIComponent(vor7Tagen.toISOString()),
  });

  const woche = statistik(dieseWocheOrders);
  const vorwoche = statistik(vorwocheOrders);

  const daten = `DIESE WOCHE: Umsatz ${woche.umsatz.toFixed(2)} | Bestellungen ${woche.anzahl} | AOV ${woche.aov.toFixed(2)} | Neukunden ${woche.neukunden} | Stammkunden ${woche.stammkunden}${NL}VORWOCHE: Umsatz ${vorwoche.umsatz.toFixed(2)} | Bestellungen ${vorwoche.anzahl} | AOV ${vorwoche.aov.toFixed(2)}${NL}VERÄNDERUNG: Umsatz ${delta(woche.umsatz, vorwoche.umsatz)} | Bestellungen ${delta(woche.anzahl, vorwoche.anzahl)}${NL}TOP-PRODUKTE: ${woche.top || 'keine'}${NL}MONATSZIEL: ${config.MONATSZIEL_UMSATZ} Umsatz | MARKETING-BUDGET: ${config.MARKETING_BUDGET_MONAT}/Monat`;

  const prompt = `Du bist der CMO (Marketing-Chef) vom Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE}). Der Gründer ist Solo-Unternehmer mit wenig Zeit. Du bist erfahren, direkt und sagst auch unbequeme Wahrheiten.${NL}${NL}WOCHENDATEN:${NL}${daten}${NL}${NL}Schreibe dein wöchentliches CMO-Briefing für die kommende Woche, auf Deutsch (Du-Form):${NL}1. LAGEBERICHT: Wo stehen wir? Sind wir auf Kurs zum Monatsziel? (ehrlich rechnen!)${NL}2. DIE 3 PRIORITÄTEN der Woche (konkret, mit Zeitaufwand-Schätzung, wichtigste zuerst)${NL}3. BUDGET-EMPFEHLUNG: Wie das Marketing-Budget diese Woche aufteilen (Ads / Content / Sonstiges) und warum${NL}4. EIN WACHSTUMS-EXPERIMENT für die Woche (Hypothese, Umsetzung, Erfolgskriterium)${NL}5. STOPP-LISTE: Eine Sache, die der Gründer diese Woche NICHT tun sollte (Zeitfresser/Ablenkung)${NL}${NL}Antworte NUR mit validem JSON, ohne Markdown:${NL}{"telegram_kurz": "<max 800 Zeichen Kurzfassung: Lage in 2 Sätzen + die 3 Prioritäten als Stichpunkte>", "html": "<das volle Briefing als sauberes HTML mit h2/h3, Listen, ohne html/body-Gerüst>"}`;

  const antwort = await askClaude(prompt, { maxTokens: 4000 });
  const daten2 = parseJsonFromText(antwort, {
    telegram_kurz: antwort.slice(0, 800),
    html: `<pre style="white-space:pre-wrap;font-family:sans-serif;">${antwort}</pre>`,
  });

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `CMO-Briefing für die Woche - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${daten2.html}</div>`,
  });

  await notifyTelegram(
    `CMO-BRIEFING - ${config.SHOP_NAME}${NL}--------------------${NL}${NL}${daten2.telegram_kurz}${NL}${NL}Das volle Briefing liegt in deinem Postfach.`
  );

  console.log('[12-marketing-chef-cmo] Wöchentliches Briefing versendet');
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[12-marketing-chef-cmo] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[12-marketing-chef-cmo] Fehler:', err);
  process.exit(1);
});
