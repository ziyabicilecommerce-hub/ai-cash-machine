// Risk-Guard-Agent - prüft neue Bestellungen auf Betrugs-/Risiko-Signale und
// markiert verdächtige Bestellungen mit einem ECHTEN Shopify-Tag
// ("risiko-pruefung") + GitHub-Ticket + Alarm. Neu, kein n8n-Workflow ·
// Zeitplan: alle 2 Stunden.
//
// Bewusst NICHT wie ein Kill-Switch gebaut: der Agent storniert oder hält
// NIE automatisch eine Bestellung zurück (das wäre bei einem False Positive
// ein handfester Kundenschaden). Er markiert nur - sichtbar im Shopify-
// Adminbereich, jederzeit vom Gründer entfernbar - und alarmiert einen
// Menschen. Tagging ist nicht-destruktiv, deshalb ohne AUTO_*-Schalter aktiv
// (anders als Pricing-/Reorder-/Ads-Autopilot-Agent, die echtes Geld bewegen).
import { config } from './lib/config.mjs';
import { getOrdersSince, updateOrder } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { erstelleTicket } from './lib/githubIssues.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '62-risk-guard-agent';
const RISIKO_TAG = 'risiko-pruefung';

function heuristikVerdacht(o) {
  const gruende = [];
  const billingLand = o.billing_address?.country_code;
  const shippingLand = o.shipping_address?.country_code;
  if (billingLand && shippingLand && billingLand !== shippingLand) {
    gruende.push(`Rechnungsland (${billingLand}) != Lieferland (${shippingLand})`);
  }
  const bestellungenBisher = o.customer?.orders_count;
  const grossSchwelle = parseFloat(config.GROSS_SCHWELLE_WERT || '300');
  if (bestellungenBisher === 1 && parseFloat(o.total_price) >= grossSchwelle) {
    gruende.push(`Erstbestellung mit ungewöhnlich hohem Wert (${o.total_price} ${o.currency})`);
  }
  return gruende;
}

async function main() {
  const minWert = parseFloat(config.RISK_GUARD_MIN_BESTELLWERT || '50');
  const maxProLauf = parseInt(config.RISK_GUARD_MAX_PRO_LAUF || '20', 10);

  const vor3Tagen = new Date();
  vor3Tagen.setDate(vor3Tagen.getDate() - 3);
  const orders = (await getOrdersSince(vor3Tagen)).filter(
    (o) => !o.cancelled_at && parseFloat(o.total_price) >= minWert,
  );

  const state = loadState(STATE_KEY);
  state.geprueft = state.geprueft || [];
  const bereitsGeprueft = new Set(state.geprueft);

  const kandidaten = [];
  for (const o of orders) {
    if (bereitsGeprueft.has(o.id)) continue;
    if ((o.tags || '').includes(RISIKO_TAG)) continue;
    const gruende = heuristikVerdacht(o);
    if (gruende.length) kandidaten.push({ order: o, gruende });
    if (kandidaten.length >= maxProLauf) break;
  }

  if (!kandidaten.length) {
    console.log('[62-risk-guard-agent] Keine neuen Verdachtsfälle.');
    return;
  }

  const liste = kandidaten
    .map(
      (k, i) =>
        `${i + 1}. Bestellung #${k.order.order_number} | Wert: ${k.order.total_price} ${k.order.currency} | Erstbestellung: ${k.order.customer?.orders_count === 1 ? 'ja' : 'nein'} | Auffällig: ${k.gruende.join('; ')}`,
    )
    .join(NL);

  const prompt = `Du bist Risk-/Betrugsprüfer für den Onlineshop "${config.SHOP_NAME}". Hier eine Liste neuer Bestellungen mit automatisch erkannten Auffälligkeiten:${NL}${NL}${liste}${NL}${NL}Bewerte JEDE Bestellung mit einer Risikostufe (niedrig|mittel|hoch) und einer kurzen Begründung auf Deutsch. Sei nicht überängstlich - Rechnungsland != Lieferland ist z.B. bei Geschenken oder Umzügen normal, nur in Kombination mit anderen Signalen wirklich verdächtig.${NL}${NL}Antworte NUR mit validem JSON, ohne Markdown, in der Reihenfolge der Liste oben:${NL}{"bewertungen": [{"stufe": "niedrig|mittel|hoch", "begruendung": "..."}]}`;

  const antwort = await askClaude(prompt, { maxTokens: 2000 });
  const bewertungen = parseJsonFromText(antwort, {}).bewertungen || null;

  const zeilen = [];
  let neuMarkiert = 0;

  for (let i = 0; i < kandidaten.length; i++) {
    const { order } = kandidaten[i];
    state.geprueft.push(order.id);
    const bewertung = Array.isArray(bewertungen) ? bewertungen[i] : null;
    const stufe = bewertung?.stufe || 'mittel'; // ohne gültige Claude-Antwort lieber vorsichtig als blind durchwinken
    const begruendung = bewertung?.begruendung || 'Claude-Bewertung nicht verfügbar - heuristisch markiert.';

    if (stufe === 'niedrig') continue;

    const neueTags = [order.tags, RISIKO_TAG].filter(Boolean).join(', ');
    try {
      await updateOrder(order.id, { tags: neueTags });
      neuMarkiert++;
    } catch (err) {
      console.error(`[62-risk-guard-agent] Tag konnte nicht gesetzt werden für #${order.order_number}:`, err.message);
    }

    zeilen.push(`- #${order.order_number} | ${stufe.toUpperCase()} | ${order.total_price} ${order.currency} | ${begruendung}`);

    await erstelleTicket({
      title: `[Risk-Guard] Bestellung #${order.order_number} - Risiko ${stufe}`,
      body: `**Wert:** ${order.total_price} ${order.currency}\n**Kunde:** ${order.email || 'unbekannt'}\n**Risikostufe:** ${stufe}\n**Begründung:** ${begruendung}\n\n**Automatisch erkannte Signale:**\n${kandidaten[i].gruende.map((g) => `- ${g}`).join('\n')}\n\n_Bestellung wurde NICHT storniert oder zurückgehalten - nur mit Tag "${RISIKO_TAG}" markiert. Bitte manuell prüfen._`,
      labels: ['risk-guard', `risiko-${stufe}`],
    });
  }

  if (state.geprueft.length > 3000) state.geprueft = state.geprueft.slice(-3000);
  saveState(STATE_KEY, state);

  if (zeilen.length) {
    const text = `🚨 RISK-GUARD-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}${zeilen.join(NL)}${NL}${NL}Bestellungen wurden markiert (Tag "${RISIKO_TAG}"), NICHT storniert. Bitte manuell prüfen.`;
    await Promise.all([notifyTelegram(text), notifyWhatsapp(text)]);
  }

  console.log(`[62-risk-guard-agent] ${kandidaten.length} geprüft, ${neuMarkiert} markiert.`);
}

main().catch((err) => {
  console.error('[62-risk-guard-agent] Fehler:', err);
  process.exit(1);
});
