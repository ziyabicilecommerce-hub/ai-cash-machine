// VIP-Radar - erkennt täglich neue VIP-Kunden (Umsatz/Bestellanzahl-Schwelle) und dankt persönlich
// Original: n8n Workflow "10_VIP_Radar" · Zeitplan: täglich 12:00
import { config, isTestMode } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '10-vip-radar';

async function main() {
  const von = new Date();
  von.setDate(von.getDate() - 1);
  von.setHours(0, 0, 0, 0);
  const bis = new Date();
  bis.setHours(0, 0, 0, 0);

  const orders = (
    await getOrders({
      created_at_min: encodeURIComponent(von.toISOString()),
      created_at_max: encodeURIComponent(bis.toISOString()),
    })
  ).filter((o) => !o.cancelled_at && o.email && o.customer);

  const umsatzSchwelle = parseFloat(config.VIP_UMSATZ_SCHWELLE || '150');
  const bestellSchwelle = parseInt(config.VIP_BESTELLUNGEN_SCHWELLE || '3');

  const state = loadState(STATE_KEY);
  state.vips = state.vips || [];
  let neueVips = 0;

  for (const o of orders) {
    const k = o.customer;
    const totalSpent = parseFloat(k.total_spent || 0);
    const ordersCount = parseInt(k.orders_count || 0);
    const istVip = totalSpent >= umsatzSchwelle || ordersCount >= bestellSchwelle;
    if (!istVip) continue;
    if (state.vips.includes(k.id)) continue;

    try {
      const artikel = (o.line_items || []).map((li) => li.title).slice(0, 3).join(', ');

      const prompt = `Du schreibst im Namen des Gründers vom Onlineshop "${config.SHOP_NAME}".${NL}Dieser Kunde ist gerade offiziell VIP geworden: ${ordersCount} Bestellungen, ${totalSpent.toFixed(0)} Gesamtumsatz. Letzte Bestellung: ${artikel}.${NL}${NL}Schreibe eine PERSÖNLICHE Dankes-E-Mail auf Deutsch (Du-Form), maximal 120 Wörter:${NL}- Klingt wie vom Gründer persönlich getippt, NICHT wie Marketing${NL}- Ehrlicher Dank, dass er/sie immer wieder kauft${NL}- Vorname: ${k.first_name || 'unbekannt (neutral anreden)'}${NL}- Als Dankeschön: exklusiver VIP-Code ${config.VIP_RABATT_CODE} (dauerhaft gültig, nur für ihn/sie)${NL}- Frage am Ende: Was können wir besser machen? (echte Antworten erwünscht)${NL}- Schlichtes HTML, wenig Styling, wie eine normale persönliche Mail${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

      const antwort = await askClaude(prompt, { maxTokens: 1500 });
      const daten = parseJsonFromText(antwort, { betreff: 'Danke, dass du dabei bist', html: antwort });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
      const betreff = (isTestMode() ? '[TEST] ' : '') + daten.betreff;
      await sendEmail({ to: empfaenger, subject: betreff, html: daten.html });

      const telegramText = `NEUER VIP-KUNDE!${NL}${NL}Name: ${k.first_name || '?'}${NL}E-Mail: ${o.email}${NL}Bestellungen: ${ordersCount}${NL}Gesamtumsatz: ${totalSpent.toFixed(2)}${NL}${NL}Persönliche Dankes-Mail wurde ${isTestMode() ? 'im TEST-MODUS an dich' : 'automatisch an den Kunden'} gesendet.`;
      await notifyTelegram(telegramText);

      // Erst NACH erfolgreichem Versand als VIP markieren und sofort speichern -
      // schlägt ein späterer Kunde im selben Lauf fehl, geht dieser Erfolg nicht
      // verloren (sonst würde der nächste Lauf denselben Kunden nochmal anschreiben).
      state.vips.push(k.id);
      if (state.vips.length > 5000) state.vips = state.vips.slice(-5000);
      saveState(STATE_KEY, state);
      neueVips++;
    } catch (err) {
      console.error(`[10-vip-radar] Kunde ${k.id} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[10-vip-radar] ${neueVips}/${orders.length} neue VIP(s) erkannt`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[10-vip-radar] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[10-vip-radar] Fehler:', err);
  process.exit(1);
});
