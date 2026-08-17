// Freunde-werben-Freunde - echtes Empfehlungsprogramm: jeder bisherige
// Kunde bekommt einen persönlichen Rabattcode zum Weitergeben. Bestellt ein
// NEUER Kunde (orders_count === 1) damit, bekommt der Werber automatisch
// einen eigenen Dank-Rabattcode. Nutzt createDiscountCode() aus lib/shopify.mjs
// - selbes Muster wie die Treue-Punkte-Engine (#66), aber für Weiter-
// empfehlung statt eigenen Umsatz. Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Unterscheidet sich von #66 (belohnt EIGENEN Umsatz eines Kunden): hier
// zählt nur, ob ein ANDERER, neuer Kunde über den Code bestellt hat -
// Selbst-Einlösung durch den Werber wird beim Belohnen ausgefiltert.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, isTestMode } from './lib/config.mjs';
import { getCustomers, getOrdersSince, createDiscountCode } from './lib/shopify.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '84-freunde-werben-freunde';
const LOOKBACK_TAGE = 45;
const MAX_NEUE_CODES_PRO_LAUF = 20;
const MAX_HISTORIE = 5000;
const MAX_BELOHNUNGS_HISTORIE = 50;
const CODE_PREFIX = 'FREUND';
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');

function generiereReferralCode(customerId) {
  return `${CODE_PREFIX}-${customerId}`;
}

function generiereBelohnungsCode(customerId) {
  const zufall = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DANKE-${customerId}-${zufall}`;
}

async function main() {
  const rabattFuerFreund = parseFloat(config.REFERRAL_RABATT_PROZENT || '10');
  const belohnungProzent = parseFloat(config.REFERRAL_BELOHNUNG_PROZENT || '15');
  const maxEinloesungen = parseInt(config.REFERRAL_CODE_MAX_EINLOESUNGEN, 10) || 20;

  const state = loadState(STATE_KEY);
  state.codeProKunde = state.codeProKunde || {};
  state.belohnteBestellungen = state.belohnteBestellungen || [];
  state.belohnungsHistorie = state.belohnungsHistorie || [];
  const bereitsBelohnt = new Set(state.belohnteBestellungen);

  // TEIL 1 - persönliche Empfehlungscodes an Kunden vergeben, die noch
  // keinen haben (gedeckelt pro Lauf, damit nicht bei riesigem Kundenstamm
  // auf einen Schlag hunderte Mails + Price-Rules erzeugt werden).
  const kunden = (await getCustomers({ limit: '250' })).filter((k) => (k.orders_count || 0) >= 1 && k.email);
  const ohneCode = kunden.filter((k) => !state.codeProKunde[k.id]).slice(0, MAX_NEUE_CODES_PRO_LAUF);

  let neueCodesVergeben = 0;
  for (const k of ohneCode) {
    try {
      const code = generiereReferralCode(k.id);
      await createDiscountCode({
        title: `Freunde-werben-Freunde ${k.id}`,
        code,
        valueType: 'percentage',
        value: rabattFuerFreund,
        usageLimit: maxEinloesungen,
      });
      state.codeProKunde[k.id] = code;
      saveState(STATE_KEY, state);
      neueCodesVergeben++;

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : k.email;
      const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2>👯 Teile ${config.SHOP_NAME} mit deinen Freunden!</h2>
        <p>Dein persönlicher Code für Freunde:</p>
        <p style="font-size:20px;font-weight:bold;background:#f0fdf4;border:2px dashed #10b981;padding:12px;text-align:center;border-radius:8px;">${code}</p>
        <p>Deine Freunde bekommen ${rabattFuerFreund}% auf ihre erste Bestellung. Sobald ein Freund damit bestellt, schicken wir DIR automatisch einen ${belohnungProzent}%-Dank-Rabatt.</p>
      </div>`;
      await sendEmail({ to: empfaenger, subject: `👯 Dein Freunde-Rabattcode für ${config.SHOP_NAME}`, html });
    } catch (err) {
      console.error(`[84-freunde-werben-freunde] Fehler beim Erstellen des Codes für Kunde ${k.id}:`, err.message || err);
    }
  }

  // TEIL 2 - Bestellungen der letzten Tage nach eingelösten Freund-Codes
  // durchsuchen. orders_count === 1 (von Shopify am Kunden mitgeliefert)
  // ist das verlässlichste "das ist ein neuer Kunde"-Signal ohne eigene
  // Bestellhistorien-Abfrage pro Kunde.
  const seit = new Date();
  seit.setDate(seit.getDate() - LOOKBACK_TAGE);
  const orders = (await getOrdersSince(seit)).filter((o) => !o.cancelled_at && o.customer?.id && o.email);

  const codeZuWerber = {};
  for (const [kundenId, code] of Object.entries(state.codeProKunde)) codeZuWerber[code] = kundenId;

  let belohnungenAusgestellt = 0;
  const belohnungsZeilen = [];

  for (const o of orders) {
    if (bereitsBelohnt.has(o.id)) continue;
    const eingeloesteCodes = (o.discount_codes || []).map((d) => d.code);
    const freundCode = eingeloesteCodes.find((c) => codeZuWerber[c]);
    if (!freundCode) continue;

    const werberId = codeZuWerber[freundCode];
    const istNeukunde = (o.customer.orders_count || 0) === 1;
    const istSelbstEinloesung = String(o.customer.id) === String(werberId);

    // Bestellung IMMER als geprüft markieren, egal ob belohnt wird - sonst
    // würde sie bei jedem Lauf erneut die Bedingungen (Neukunde/Selbst-
    // Einlösung) durchlaufen, obwohl das Ergebnis sich nicht mehr ändert.
    state.belohnteBestellungen.push(o.id);
    if (state.belohnteBestellungen.length > MAX_HISTORIE) {
      state.belohnteBestellungen = state.belohnteBestellungen.slice(-MAX_HISTORIE);
    }
    saveState(STATE_KEY, state);

    if (istSelbstEinloesung || !istNeukunde) continue;

    try {
      const werber = kunden.find((k) => String(k.id) === String(werberId));
      const werberEmail = werber?.email;
      if (!werberEmail) continue;

      const code = generiereBelohnungsCode(werberId);
      await createDiscountCode({
        title: `Freunde-werben-Freunde Dank ${werberId}`,
        code,
        valueType: 'percentage',
        value: belohnungProzent,
        usageLimit: 1,
      });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : werberEmail;
      const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2>🎉 Dein Freund hat bestellt!</h2>
        <p>Danke, dass du ${config.SHOP_NAME} weiterempfiehlst - hier ist dein Dank-Rabatt:</p>
        <p style="font-size:20px;font-weight:bold;background:#f0fdf4;border:2px dashed #10b981;padding:12px;text-align:center;border-radius:8px;">${code}</p>
        <p>${belohnungProzent}% Rabatt auf deine nächste Bestellung, einmalig einlösbar.</p>
      </div>`;
      await sendEmail({ to: empfaenger, subject: `🎉 ${belohnungProzent}% Dank-Rabatt für deine Empfehlung`, html });

      belohnungenAusgestellt++;
      belohnungsZeilen.push(`- Werber ${werberId} (${werberEmail}) → Code ${code} (${belohnungProzent}%), geworben: ${o.email}`);
      state.belohnungsHistorie.unshift({ datum: new Date().toISOString(), werberId, code, belohnungProzent, geworbenerKunde: o.email });
      if (state.belohnungsHistorie.length > MAX_BELOHNUNGS_HISTORIE) {
        state.belohnungsHistorie = state.belohnungsHistorie.slice(0, MAX_BELOHNUNGS_HISTORIE);
      }
      saveState(STATE_KEY, state);
    } catch (err) {
      console.error(`[84-freunde-werben-freunde] Fehler bei Belohnung für Werber ${werberId}:`, err.message || err);
    }
  }

  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  writeFileSync(join(COMMAND_DIR, 'referral.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    gesamtCodesVergeben: Object.keys(state.codeProKunde).length,
    gesamtBelohnungen: state.belohnungsHistorie.length,
    rabattFuerFreund,
    belohnungProzent,
    letzteBelohnungen: state.belohnungsHistorie,
  }, null, 2));

  const text = [
    `👯 Freunde-werben-Freunde - ${config.SHOP_NAME}`,
    `${neueCodesVergeben} neue Empfehlungscode(s) vergeben.`,
    belohnungenAusgestellt ? `${belohnungenAusgestellt} Dank-Rabatt(e) ausgestellt:${NL}${belohnungsZeilen.join(NL)}` : 'Keine neuen Empfehlungs-Bestellungen erkannt.',
  ].join(NL);
  await notifyTelegram(text);

  console.log(`[84-freunde-werben-freunde] ${neueCodesVergeben} neue Codes, ${belohnungenAusgestellt} Belohnung(en).`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[84-freunde-werben-freunde] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[84-freunde-werben-freunde] Fehler:', err);
  process.exit(1);
});
