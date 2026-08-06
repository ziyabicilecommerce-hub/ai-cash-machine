// Gift-Card-Kompensations-Agent - wenn eine Bestellung einen ECHTEN
// Service-Fehler hatte (sehr lange unbearbeitet ODER gescheiterte
// Zustellung laut Shopify-Sendungsverfolgung), erstellt der Agent einen
// ECHTEN Shopify-Gutschein als Wiedergutmachung und schickt ihn dem Kunden
// zu - bevor der Kunde sich überhaupt beschweren muss. Neu, kein
// n8n-Workflow · Zeitplan: täglich.
//
// Unterscheidet sich von #55 Fulfillment & Supplier Hub (meldet dieselben
// Probleme nur an DICH, tut nichts für den Kunden) - deutlich strengere
// Schwelle als Fulfillment Hub (GIFTCARD_VERZUG_STUNDEN, Default 96h statt
// 48h), damit nicht jede normale Verzögerung sofort Geld kostet - nur
// wirklich schlechte Fälle. Wie bei den anderen geld-bewegenden Agenten
// standardmäßig NUR EMPFEHLUNG, bis AUTO_GUTSCHEIN_SENDEN explizit auf "ja"
// steht.
import { config, isTestMode } from './lib/config.mjs';
import { getOrders, createGiftCard } from './lib/shopify.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '67-giftcard-kompensations-agent';
const MAX_HISTORIE = 3000;

function alterInStunden(datumStr) {
  return (Date.now() - new Date(datumStr).getTime()) / 3600000;
}

async function main() {
  const verzugStunden = parseFloat(config.GIFTCARD_VERZUG_STUNDEN || '96');
  const wert = config.GIFTCARD_KOMPENSATION_WERT || '10';
  const autoSenden = config.AUTO_GUTSCHEIN_SENDEN === 'ja';

  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);
  const orders = (await getOrders({ status: 'open', created_at_min: encodeURIComponent(vor30Tagen.toISOString()) }))
    .filter((o) => !o.cancelled_at && o.email);

  const state = loadState(STATE_KEY);
  state.entschaedigt = state.entschaedigt || [];
  const bereitsEntschaedigt = new Set(state.entschaedigt);

  const faelle = [];
  for (const o of orders) {
    if (bereitsEntschaedigt.has(o.id)) continue;
    const alterH = alterInStunden(o.created_at);

    let grund = null;
    if (o.fulfillment_status !== 'fulfilled' && alterH >= verzugStunden) {
      grund = `seit ${(alterH / 24).toFixed(1)} Tagen unbearbeitet`;
    } else {
      const gescheitert = (o.fulfillments || []).find((f) => f.shipment_status === 'failure' || f.shipment_status === 'delivery_failed');
      if (gescheitert) grund = `Zustellung gescheitert (${gescheitert.shipment_status})`;
    }
    if (grund) faelle.push({ order: o, grund });
  }

  if (!faelle.length) {
    console.log('[67-giftcard-kompensations-agent] Keine neuen Fälle für eine Kompensation.');
    return;
  }

  const zeilen = faelle.map((f) => `- #${f.order.order_number || f.order.id} · ${f.order.email} · ${f.grund}`);
  const kopf = `🎟️ GIFT-CARD-KOMPENSATIONS-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}${autoSenden ? `AUTO_GUTSCHEIN_SENDEN ist AN: ${wert} EUR Gutscheine werden jetzt verschickt!` : 'Nur Empfehlung - AUTO_GUTSCHEIN_SENDEN steht auf nein, ich verschicke nichts.'}`;
  await notifyTelegram(`${kopf}${NL}${NL}${zeilen.join(NL)}`);

  let versendet = 0;
  for (const f of faelle) {
    if (!autoSenden) continue;
    try {
      const giftCard = await createGiftCard({
        initialValue: wert,
        note: `Wiedergutmachung für Bestellung #${f.order.order_number || f.order.id}: ${f.grund}`,
        recipientEmail: isTestMode() ? config.OWNER_EMAIL : f.order.email,
      });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : f.order.email;
      const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2>Entschuldige die Verzögerung 🙏</h2>
        <p>Bei deiner Bestellung #${f.order.order_number || f.order.id} ist bei uns etwas nicht rundgelaufen.</p>
        <p style="font-size:20px;font-weight:bold;background:#f0fdf4;border:2px dashed #10b981;padding:12px;text-align:center;border-radius:8px;">${giftCard.code || giftCard.last_characters}</p>
        <p>Als Entschuldigung schenken wir dir ${wert} EUR Guthaben für deinen nächsten Einkauf bei ${config.SHOP_NAME}.</p>
      </div>`;
      await sendEmail({ to: empfaenger, subject: `Entschuldigung + ${wert} EUR Gutschein von ${config.SHOP_NAME}`, html });

      // Erst NACH erfolgreicher Erstellung+Versand als entschädigt markieren
      // und sofort speichern - schlägt ein späterer Fall im selben Lauf
      // fehl, geht dieser Erfolg nicht verloren (sonst würde derselbe Kunde
      // beim nächsten Lauf nochmal einen Gutschein bekommen).
      state.entschaedigt.push(f.order.id);
      if (state.entschaedigt.length > MAX_HISTORIE) state.entschaedigt = state.entschaedigt.slice(-MAX_HISTORIE);
      saveState(STATE_KEY, state);
      versendet++;
    } catch (err) {
      console.error(`[67-giftcard-kompensations-agent] Fehler bei Bestellung ${f.order.id}:`, err.message || err);
    }
  }

  console.log(`[67-giftcard-kompensations-agent] ${faelle.length} Fall/Fälle erkannt, ${versendet} Gutschein(e) versendet.`);
}

main().catch((err) => {
  console.error('[67-giftcard-kompensations-agent] Fehler:', err);
  process.exit(1);
});
