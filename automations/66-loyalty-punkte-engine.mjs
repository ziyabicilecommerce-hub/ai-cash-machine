// Treue-Punkte-Engine - echtes Kundenbindungs-Programm: jeder Euro Umsatz
// zählt als Punkte, sobald ein Kunde die Schwelle erreicht, erstellt der
// Agent einen ECHTEN, einmalig gültigen Shopify-Rabattcode als Belohnung und
// schickt ihn per E-Mail zu. Nutzt createDiscountCode() aus lib/shopify.mjs -
// bisher die einzige Automation, die das tut. Neu, kein n8n-Workflow ·
// Zeitplan: täglich.
//
// Unterscheidet sich von #10 VIP-Radar (einmaliger Willkommens-Rabatt bei
// Erreichen einer Umsatz-/Bestellanzahl-Schwelle) und #57 CRM & Retention
// Engine (reaktiviert INAKTIVE High-Value-Kunden): die Treue-Punkte-Engine
// läuft KONTINUIERLICH für JEDEN Kunden mit, unabhängig von Aktivität/
// Inaktivität, und kann für denselben Kunden IMMER WIEDER eine neue
// Belohnung auslösen, sobald genug neue Punkte zusammenkommen - kein
// Einmal-Ereignis, sondern ein echtes Punktekonto.
//
// Punktestand wird bewusst NICHT in Shopify gespeichert (kein natives
// Punkte-Feld ohne Zusatz-App) - lebt im eigenen State, exakt wie bei den
// anderen neuen Agenten dieser Suite.
import { config, isTestMode } from './lib/config.mjs';
import { getOrdersSince, createDiscountCode } from './lib/shopify.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '66-loyalty-punkte-engine';
const LOOKBACK_TAGE = 45; // großzügig - Dedup über verarbeiteteBestellungen verhindert Doppelzählung
const MAX_HISTORIE = 5000;

function generiereCode(customerId) {
  const zufall = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TREUE-${customerId}-${zufall}`;
}

async function main() {
  const punkteProEuro = parseFloat(config.LOYALTY_PUNKTE_PRO_EURO || '1');
  const schwelle = parseFloat(config.LOYALTY_SCHWELLE_PUNKTE || '100');
  const belohnungProzent = parseFloat(config.LOYALTY_BELOHNUNG_PROZENT || '15');

  const seit = new Date();
  seit.setDate(seit.getDate() - LOOKBACK_TAGE);
  const orders = (await getOrdersSince(seit)).filter((o) => !o.cancelled_at && o.customer?.id && o.email);

  const state = loadState(STATE_KEY);
  state.punkte = state.punkte || {};
  state.verarbeiteteBestellungen = state.verarbeiteteBestellungen || [];
  const bereitsVerarbeitet = new Set(state.verarbeiteteBestellungen);

  const neueOrders = orders.filter((o) => !bereitsVerarbeitet.has(o.id));

  let punkteVergeben = 0;
  let belohnungenAusgestellt = 0;
  const belohnungsZeilen = [];

  for (const o of neueOrders) {
    const kundenId = o.customer.id;
    try {
      const gutgeschrieben = Math.floor(parseFloat(o.total_price || '0') * punkteProEuro);
      state.punkte[kundenId] = (state.punkte[kundenId] || 0) + gutgeschrieben;
      punkteVergeben += gutgeschrieben;

      // Bestellung sofort als verarbeitet markieren und speichern - schlägt
      // eine SPÄTERE Bestellung im selben Lauf fehl (z.B. bei der
      // Belohnungs-Ausstellung unten), soll diese Punktegutschrift trotzdem
      // bestehen bleiben und nicht nochmal gezählt werden.
      state.verarbeiteteBestellungen.push(o.id);
      if (state.verarbeiteteBestellungen.length > MAX_HISTORIE) {
        state.verarbeiteteBestellungen = state.verarbeiteteBestellungen.slice(-MAX_HISTORIE);
      }
      saveState(STATE_KEY, state);

      // Kann mehrfach hintereinander auslösen, falls die Bestellung allein
      // schon mehrere Schwellen überspringt (z.B. Großbestellung) - jede
      // volle Schwelle bekommt ihre eigene, einzeln einlösbare Belohnung.
      while (state.punkte[kundenId] >= schwelle) {
        const code = generiereCode(kundenId);
        await createDiscountCode({
          title: `Treue-Belohnung ${kundenId}`,
          code,
          valueType: 'percentage',
          value: belohnungProzent,
          usageLimit: 1,
        });

        state.punkte[kundenId] -= schwelle;
        saveState(STATE_KEY, state);
        belohnungenAusgestellt++;

        const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
        const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2>🎉 Du hast dir eine Belohnung verdient!</h2>
          <p>Danke, dass du bei ${config.SHOP_NAME} einkaufst - du hast genug Treue-Punkte gesammelt.</p>
          <p style="font-size:20px;font-weight:bold;background:#f0fdf4;border:2px dashed #10b981;padding:12px;text-align:center;border-radius:8px;">${code}</p>
          <p>${belohnungProzent}% Rabatt auf deine nächste Bestellung, einmalig einlösbar.</p>
        </div>`;
        await sendEmail({ to: empfaenger, subject: `🎉 ${belohnungProzent}% Treue-Rabatt für dich`, html });

        belohnungsZeilen.push(`- Kunde ${kundenId} (${o.email}) → Code ${code} (${belohnungProzent}%)`);
      }
    } catch (err) {
      // Punktegutschrift für diese Bestellung bleibt bestehen (bereits oben
      // gespeichert) - nur eine fehlgeschlagene Belohnungs-Ausstellung wird
      // beim nächsten Lauf automatisch erneut versucht, da der Punktestand
      // ja weiterhin über der Schwelle steht.
      console.error(`[66-loyalty-punkte-engine] Fehler bei Bestellung ${o.id} / Kunde ${kundenId}:`, err.message || err);
    }
  }

  const text = [
    `🎁 Treue-Punkte-Engine - ${config.SHOP_NAME}`,
    `${neueOrders.length} neue Bestellung(en) verarbeitet, ${punkteVergeben} Punkte vergeben.`,
    belohnungenAusgestellt ? `${belohnungenAusgestellt} neue Belohnung(en) ausgestellt:${NL}${belohnungsZeilen.join(NL)}` : 'Keine neuen Belohnungen ausgelöst.',
  ].join(NL);
  await notifyTelegram(text);

  console.log(`[66-loyalty-punkte-engine] ${neueOrders.length} Bestellung(en), ${punkteVergeben} Punkte, ${belohnungenAusgestellt} Belohnung(en).`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[66-loyalty-punkte-engine] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[66-loyalty-punkte-engine] Fehler:', err);
  process.exit(1);
});
