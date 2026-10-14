// Buchhaltungs-Bot (#105) - Autopilot: stündlich neue Bestellungen holen und dir je Bestellung eine Mail mit
// Brutto/Netto/MwSt./geschätztem Gewinn schicken; am Monatsersten die Monatsabrechnung mit CSV für den Steuerberater.
// Braucht: SHOP + SHOPIFY_TOKEN (Shopify-Admin, nur Lesen), RESEND_API_KEY + OWNER_EMAIL (Mails an dich).
// Im öffentlichen Repo landen nur gehashte Bestell-IDs und der zuletzt abgerechnete Monat - keine Kundendaten.
import { config, ueberspringenWerfen } from './lib/config.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { bestellungBuchen, zaehlt, summieren, csvBauen, bestellMail, monatsMail, vormonat, monatVon, kennung } from './lib/buchhaltung.mjs';

const KEY = '105-buchhaltung';
const LOG = '[105-buchhaltung]';
const ANNAHMEN = {
  produktkostenProzent: config.PRODUKTKOSTEN_PROZENT,
  gebuehrProzent: config.ZAHLUNGSGEBUEHR_PROZENT,
  gebuehrFixCent: config.ZAHLUNGSGEBUEHR_FIX_CENT,
};

// Alle Bestellungen im Zeitraum (Shopify blättert über den Link-Header, je Seite 250).
async function bestellungen(von, bis) {
  const basis = `https://${config.SHOP}.myshopify.com/admin/api/2024-10`;
  let url = `${basis}/orders.json?${new URLSearchParams({ status: 'any', limit: '250', created_at_min: von, ...(bis ? { created_at_max: bis } : {}) })}`;
  const alle = [];
  for (let seite = 0; url && seite < 40; seite++) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': config.SHOPIFY_TOKEN } });
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${(await res.text()).slice(0, 200)}`);
    alle.push(...((await res.json()).orders || []));
    url = (res.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
  }
  return alle;
}

async function main() {
  if (!config.SHOP || !config.SHOPIFY_TOKEN) ueberspringenWerfen('Shop nicht verbunden (Secrets SHOP und SHOPIFY_TOKEN fehlen).');
  if (!config.OWNER_EMAIL) ueberspringenWerfen('OWNER_EMAIL fehlt - an wen soll die Buchhaltung gehen?');
  const shop = config.SHOP_NAME || config.SHOP;
  const state = loadState(KEY);
  state.gemeldet = state.gemeldet || [];
  const erstLauf = !state.gestartet;

  // 1) Neue Bestellungen der letzten 3 Tage (GitHub startet Läufe manchmal stundenlang zu spät).
  const jetzt = new Date();
  const frisch = (await bestellungen(new Date(jetzt - 3 * 864e5).toISOString())).filter(zaehlt)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const offen = frisch.filter((o) => !state.gemeldet.includes(kennung(o.id)));
  let monat = null;
  if (offen.length && !erstLauf) {
    const name = monatVon(jetzt);
    const dieserMonat = (await bestellungen(new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), 1) - 864e5).toISOString()))
      .filter((o) => zaehlt(o) && String(o.created_at).slice(0, 7) === name);
    monat = summieren(dieserMonat.map((o) => bestellungBuchen(o, ANNAHMEN)));
  }
  let gesendet = 0;
  for (const o of offen) {
    try {
      // Beim allerersten Lauf nur merken, nicht nachträglich alte Bestellungen mailen.
      if (!erstLauf) {
        const b = bestellungBuchen(o, ANNAHMEN);
        const { betreff, html } = bestellMail(b, { shop, monat, adminUrl: `https://admin.shopify.com/store/${config.SHOP}/orders/${o.id}` });
        await sendEmail({ to: config.OWNER_EMAIL, subject: betreff, html });
        gesendet++;
      }
      state.gemeldet.push(kennung(o.id));
      state.gemeldet = state.gemeldet.slice(-3000);
      saveState(KEY, state);
    } catch (err) {
      console.error(`${LOG} Bestellung konnte nicht gemeldet werden (nächster Lauf versucht es wieder): ${err.message}`);
    }
  }
  console.log(`${LOG} ${frisch.length} Bestellungen (3 Tage), ${offen.length} neu, ${gesendet} Mail(s)${erstLauf ? ' - erster Lauf: nur gemerkt' : ''}`);

  // 2) Monatsabrechnung für den Vormonat (einmal pro Monat, sobald ein neuer Monat begonnen hat).
  const vm = vormonat(jetzt);
  if (!erstLauf && state.abgerechnet !== vm.name) {
    const liste = (await bestellungen(vm.von, vm.bis)).filter((o) => zaehlt(o) && String(o.created_at).slice(0, 7) === vm.name)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const buchungen = liste.map((o) => bestellungBuchen(o, ANNAHMEN));
    const summe = summieren(buchungen);
    const { betreff, html } = monatsMail(summe, { shop, monat: vm.name, waehrung: buchungen[0]?.waehrung });
    await sendEmail({
      to: config.OWNER_EMAIL, subject: betreff, html,
      attachments: [{ filename: `buchhaltung-${config.SHOP}-${vm.name}.csv`, content: Buffer.from(csvBauen(buchungen), 'utf8').toString('base64') }],
    });
    console.log(`${LOG} Monatsabrechnung ${vm.name}: ${summe.anzahl} Bestellungen verschickt`);
  }
  // Ab jetzt läuft alles: der Vormonat gilt als erledigt (beim ersten Lauf ohne Mail).
  state.abgerechnet = vm.name;
  state.gestartet = state.gestartet || jetzt.toISOString();
  saveState(KEY, state);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log(`${LOG} Übersprungen:`, err.message);
    process.exit(0);
  }
  console.error(`${LOG} Fehler:`, err);
  process.exit(1);
});
