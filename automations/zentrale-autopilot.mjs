// Zentrale-Autopilot (täglich per GitHub Actions): holt Shopify-Bestellungen, lässt die 8 Agenten
// rechnen, schickt den Tagesbericht per Telegram und legt die Daten VERSCHLÜSSELT für die Seite ab.
// Das Repo ist öffentlich: Es wird nichts im Klartext gespeichert oder geloggt.
import { writeFileSync, mkdirSync } from 'node:fs';
import '../zentrale/js/analytics.js';
import '../zentrale/js/store.js';
import '../zentrale/js/agenten.js';
import '../zentrale/js/tresor.js';
import { bestellungenAus, produkteAus, naechsteSeite } from './lib/zentraleShopify.mjs';

const { ZS, ZAgenten, ZTresor } = globalThis;
const env = process.env;
const TAGE = Number(env.ZENTRALE_TAGE) || 180;
const ZIEL = env.ZENTRALE_AUSGABE ? new URL('file://' + env.ZENTRALE_AUSGABE) : new URL('../zentrale/daten/live.enc.json', import.meta.url);

async function shopify(pfad) {
  const res = await fetch(`https://${env.SHOP}.myshopify.com/admin/api/2024-10${pfad}`, { headers: { 'X-Shopify-Access-Token': env.SHOPIFY_TOKEN } });
  if (!res.ok) throw new Error(`Shopify antwortet mit HTTP ${res.status} auf ${pfad.split('?')[0]}`);
  return { daten: await res.json(), weiter: naechsteSeite(res.headers.get('link')) };
}

async function alleSeiten(pfad, feld, start) {
  const out = [];
  let r = await shopify(`${pfad}?${start}`);
  out.push(...r.daten[feld]);
  while (r.weiter && out.length < 20000) { r = await shopify(`${pfad}?limit=250&page_info=${r.weiter}`); out.push(...r.daten[feld]); }
  return out;
}

async function telegram(text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  return res.ok;
}

function bericht(z, lauf, seite) {
  const { eur } = ZAgenten;
  const k = globalThis.ZA.kennzahlen(globalThis.ZA.imZeitraum(z.bestellungen, lauf.ctx.heute, 28), z.produkte);
  const top = lauf.aufgaben.filter((a) => a.prio !== 'info').slice(0, 5);
  return [
    'ZENTRALE · Tagesbericht',
    `Umsatz 28 Tage: ${eur(k.umsatz)} · ${k.bestellungen} Bestellungen${z.produkte.some((p) => p.kosten > 0) ? ` · Marge ${k.margeProzent} %` : ''}`,
    '',
    'Heute wichtig:',
    ...top.map((a, i) => `${i + 1}. ${a.titel}`),
    '',
    seite ? `Details: ${seite}` : '',
  ].join('\n').trim();
}

async function main() {
  if (!env.SHOP || !env.SHOPIFY_TOKEN) {
    console.log('[zentrale] Shop nicht verbunden (Secrets SHOP und SHOPIFY_TOKEN fehlen). Nichts zu tun. Die Seite rechnet weiter mit importierten Daten.');
    return;
  }
  const seit = new Date(Date.now() - TAGE * 86400000).toISOString();
  const orders = await alleSeiten('/orders.json', 'orders', `status=any&limit=250&created_at_min=${encodeURIComponent(seit)}`);
  const products = await alleSeiten('/products.json', 'products', 'limit=250');
  const itemIds = products.map((p) => (p.variants || [])[0]).filter(Boolean).map((v) => v.inventory_item_id).filter(Boolean);
  const kosten = {};
  for (let i = 0; i < itemIds.length; i += 100) {
    try {
      const r = await shopify(`/inventory_items.json?ids=${itemIds.slice(i, i + 100).join(',')}`);
      for (const it of r.daten.inventory_items || []) kosten[it.id] = it.cost;
    } catch (e) { console.log('[zentrale] Einkaufspreise nicht lesbar (Berechtigung read_inventory fehlt?). Marge wird ohne Einkauf gerechnet.'); break; }
  }

  const z = ZS.leer();
  z.bestellungen = bestellungenAus(orders);
  z.produkte = produkteAus(products, kosten, z.bestellungen);
  if (env.SHOP_NAME) z.einstellungen.shopName = env.SHOP_NAME;
  const lauf = ZAgenten.alleLaufen(z);
  const seite = env.ZENTRALE_URL || (env.GITHUB_REPOSITORY ? `https://${env.GITHUB_REPOSITORY.split('/')[0]}.github.io/${env.GITHUB_REPOSITORY.split('/')[1]}/zentrale/` : '');

  const gesendet = await telegram(bericht(z, lauf, seite));
  console.log(gesendet ? '[zentrale] Tagesbericht per Telegram gesendet.' : '[zentrale] Telegram nicht eingerichtet: Bericht nicht gesendet.');

  if (env.ZENTRALE_SCHLUESSEL && env.ZENTRALE_SCHLUESSEL.length >= 10) {
    const paket = await ZTresor.verschluesseln({ stand: lauf.ctx.heute, geholt: new Date().toISOString(), produkte: z.produkte, bestellungen: z.bestellungen }, env.ZENTRALE_SCHLUESSEL);
    mkdirSync(new URL('.', ZIEL), { recursive: true });
    writeFileSync(ZIEL, JSON.stringify(paket));
    console.log('[zentrale] Verschlüsselte Live-Daten geschrieben.');
  } else {
    console.log('[zentrale] ZENTRALE_SCHLUESSEL fehlt oder ist kürzer als 10 Zeichen: keine Live-Daten für die Seite (ohne Schlüssel wären sie öffentlich).');
  }
}

main().catch((e) => { console.error('[zentrale] Fehler:', e.message); process.exit(1); });
