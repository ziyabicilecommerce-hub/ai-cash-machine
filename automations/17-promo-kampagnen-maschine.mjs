// Promo-Kampagnen-Maschine - rotierende Kampagnen-E-Mail an die Kundenliste, alle 14 Tage
// Original: n8n Workflow "17_Promo_Kampagnen_Maschine" · Zeitplan: alle 14 Tage 10:00
import { config, isTestMode } from './lib/config.mjs';
import { getProducts, getCustomers } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '17-promo-kampagnen-maschine';
const PLATZHALTER = '{{VORNAME}}';

const TYPEN = [
  { name: 'Flash-Sale', idee: '48h-Blitzangebot mit dem Rabattcode, harte Deadline, Countdown-Gefühl' },
  { name: 'Bestseller-Spotlight', idee: 'Das beliebteste Produkt feiern: warum es alle lieben, Social-Proof-Gefühl, Code als Bonus' },
  { name: 'Insider-Tipp', idee: 'Wertvoller Nischen-Tipp im Zentrum (echter Mehrwert!), Produkt nur elegant nebenbei, Code als Belohnung fürs Lesen' },
  { name: 'Geheimer Sale', idee: 'Nur-für-Abonnenten-Deal: exklusiv, verknappt, nicht auf der Website beworben' },
  { name: 'Neuheiten-Drop', idee: 'Neuste Produkte wie einen Launch inszenieren, Erste-sein-Gefühl, Code für Early Birds' },
];

async function main() {
  const produkte = await getProducts({ limit: '50', fields: 'id,title,handle,variants' });
  const kunden = await getCustomers({ limit: '250', fields: 'id,email,first_name,email_marketing_consent,accepts_marketing' });

  const state = loadState(STATE_KEY);
  state.kampagnenZaehler = (state.kampagnenZaehler || 0) + 1;
  saveState(STATE_KEY, state);

  const typ = TYPEN[(state.kampagnenZaehler - 1) % TYPEN.length];
  const produktListe = produkte
    .slice(0, 15)
    .map((p) => `- ${p.title} (${config.SHOP_URL}/products/${p.handle}, ${p.variants?.[0]?.price || '?'})`);

  const prompt = `Du bist E-Mail-Marketing-Profi für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE}).${NL}${NL}KAMPAGNEN-TYP heute: ${typ.name} -> ${typ.idee}${NL}Rabattcode: ${config.KAMPAGNEN_RABATT_CODE} (${config.RABATT_PROZENT}%)${NL}${NL}Produktkatalog (Auszug):${NL}${produktListe.join(NL)}${NL}${NL}Schreibe die komplette Kampagnen-E-Mail auf Deutsch (Du-Form):${NL}- Betreff: maximal 45 Zeichen, neugierig machend, zum Kampagnen-Typ passend${NL}- Der Platzhalter ${PLATZHALTER} soll im HTML genau einmal für die persönliche Anrede stehen${NL}- 1-2 konkrete Produkte aus dem Katalog mit Links einbauen${NL}- EIN klarer CTA-Button (als <a> mit Inline-Button-Styling)${NL}- Rabattcode prominent, Deadline erzeugen${NL}- Unten kleiner Footer-Hinweis: Du bekommst diese Mail als Kunde von ${config.SHOP_NAME}. Antworte mit STOP zum Abmelden.${NL}- Mobiltaugliches HTML mit Inline-CSS, kein Spam-Vokabular (keine Großbuchstaben-Wände)${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

  const antwort = await askClaude(prompt, { maxTokens: 3500 });
  const daten = parseJsonFromText(antwort, { betreff: 'Nur für dich', html: antwort });

  const maxEmpfaenger = parseInt(config.MAX_EMPFAENGER || '200');
  const abonnenten = kunden
    .filter((k) => {
      if (!k.email) return false;
      if (k.email_marketing_consent) return k.email_marketing_consent.state === 'subscribed';
      return k.accepts_marketing === true;
    })
    .slice(0, maxEmpfaenger);

  if (isTestMode()) {
    await sendEmail({
      to: config.OWNER_EMAIL,
      subject: `[TEST - Kampagne hätte ${abonnenten.length} Empfänger] ${daten.betreff}`,
      html: daten.html.split(PLATZHALTER).join('Testkunde'),
    });
  } else {
    for (const k of abonnenten) {
      await sendEmail({
        to: k.email,
        subject: daten.betreff,
        html: daten.html.split(PLATZHALTER).join(k.first_name || 'du'),
      });
    }
  }

  console.log(`[17-promo-kampagnen-maschine] Kampagne "${typ.name}" an ${abonnenten.length} Empfänger`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[17-promo-kampagnen-maschine] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[17-promo-kampagnen-maschine] Fehler:', err);
  process.exit(1);
});
