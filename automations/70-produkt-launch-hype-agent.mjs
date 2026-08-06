// Produkt-Launch-Hype-Agent - merkt automatisch, wenn ein Produkt im Shop
// neu auf "aktiv" (veröffentlicht) gesetzt wird, egal ob das manuell oder
// über #53 Store Builder (der IMMER nur als Entwurf anlegt) passiert ist,
// und verschickt eine ECHTE Launch-Ankündigung an die Newsletter-Liste.
// Neu, kein n8n-Workflow · Zeitplan: alle 3 Stunden.
//
// Erkennt den Übergang draft/archived -> active über einen Vergleich mit
// der zuletzt bekannten Menge aktiver Produkt-IDs - kein Produkt wird
// zweimal gefeiert. Beim ALLERERSTEN Lauf wird nur der aktuelle Bestand
// eingelesen (kein rückwirkendes Hype für den kompletten Altbestand).
import { config, isTestMode } from './lib/config.mjs';
import { getProducts, getCustomers } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '70-produkt-launch-hype-agent';
const MAX_HISTORIE = 2000;

async function main() {
  const alleAktiven = await getProducts({ limit: '250', status: 'active' });
  const state = loadState(STATE_KEY);

  if (!state.bekannteAktive) {
    // Erstlauf: nur Bestand einlesen, kein Hype für Alt-Produkte.
    state.bekannteAktive = alleAktiven.map((p) => p.id);
    saveState(STATE_KEY, state);
    console.log(`[70-produkt-launch-hype-agent] Erstlauf - ${alleAktiven.length} bestehende aktive Produkte eingelesen, kein Hype ausgelöst.`);
    return;
  }

  const bekannt = new Set(state.bekannteAktive);
  const neuGelauncht = alleAktiven.filter((p) => !bekannt.has(p.id));

  if (!neuGelauncht.length) {
    console.log('[70-produkt-launch-hype-agent] Keine neuen Launches.');
    return;
  }

  const maxEmpfaenger = parseInt(config.LAUNCH_HYPE_MAX_EMPFAENGER || '200', 10);
  const kunden = await getCustomers({ limit: '250', fields: 'id,email,first_name,email_marketing_consent,accepts_marketing' });
  const abonnenten = kunden
    .filter((k) => {
      if (!k.email) return false;
      if (k.email_marketing_consent) return k.email_marketing_consent.state === 'subscribed';
      return k.accepts_marketing === true;
    })
    .slice(0, maxEmpfaenger);

  let erfolgreich = 0;
  for (const produkt of neuGelauncht) {
    try {
      const prompt = `Du bist E-Mail-Marketing-Profi für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}${NL}NEUES PRODUKT gerade live gegangen: "${produkt.title}"${NL}Beschreibung (Auszug): ${(produkt.body_html || '').replace(/<[^>]+>/g, ' ').slice(0, 400)}${NL}Link: ${config.SHOP_URL}/products/${produkt.handle}${NL}${NL}Schreibe eine kurze Launch-Ankündigung auf Deutsch (Du-Form), max 100 Wörter: Erste-sein-Gefühl, echte Vorfreude, EIN klarer CTA-Button zum Produkt. Mobiltaugliches HTML mit Inline-CSS.${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

      const antwort = await askClaude(prompt, { maxTokens: 2000 });
      const daten = parseJsonFromText(antwort, { betreff: `🚀 Neu: ${produkt.title}`, html: antwort });

      if (isTestMode()) {
        await sendEmail({ to: config.OWNER_EMAIL, subject: `[TEST - ${abonnenten.length} Empfänger] ${daten.betreff}`, html: daten.html });
      } else {
        for (const k of abonnenten) {
          await sendEmail({ to: k.email, subject: daten.betreff, html: daten.html });
        }
      }
      await notifyTelegram(`🚀 Launch-Hype: "${produkt.title}" ist live - Ankündigung an ${abonnenten.length} Abonnent(en) verschickt.`);

      // Erst NACH erfolgreichem Versand als bekannt/gefeiert markieren und
      // sofort speichern - schlägt ein späteres Produkt im selben Lauf fehl,
      // geht dieser Erfolg nicht verloren (sonst würde derselbe Launch beim
      // nächsten Lauf nochmal gefeiert).
      state.bekannteAktive.push(produkt.id);
      if (state.bekannteAktive.length > MAX_HISTORIE) state.bekannteAktive = state.bekannteAktive.slice(-MAX_HISTORIE);
      saveState(STATE_KEY, state);
      erfolgreich++;
    } catch (err) {
      console.error(`[70-produkt-launch-hype-agent] Produkt "${produkt.title}" fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[70-produkt-launch-hype-agent] ${erfolgreich}/${neuGelauncht.length} Launch(es) gefeiert.`);
}

main().catch((err) => {
  console.error('[70-produkt-launch-hype-agent] Fehler:', err);
  process.exit(1);
});
