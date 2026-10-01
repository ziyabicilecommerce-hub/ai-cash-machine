// Shop-Doktor + Produkt-Feeds (taeglich, nur oeffentliche Daten, kein Shopify-Schluessel noetig):
// 1) prueft beide Live-Shops: Produkte, Produktseiten, Ladezeit, SEO, Rechtstexte, Preisangaben,
//    riskante Werbeaussagen -> zentrale/daten/shop-doktor.json (Zentrale, Bereich "Shop-Doktor")
// 2) baut Produkt-Feeds fuer Google Shopping, Facebook/Instagram und Pinterest -> zentrale/feeds/
//    (ueber GitHub Pages abrufbar; einmal im Merchant Center / Commerce Manager eintragen, fertig).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { SHOPS, shopName } from './lib/shopProdukte.mjs';
import { produktPruefen, seitePruefen, shopPruefen, punktzahl, doppelteTitel, PFLICHT, schnappschuss, aenderungen } from './lib/shopDoktor.mjs';
import { feedEintraege, googleXml, katalogCsv } from './lib/produktFeeds.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { kiJson } from './lib/kiJson.mjs';
import { braucht, vorschlaegeHolen, cacheLaden, cacheSpeichern, fingerabdruck } from './lib/textVorschlaege.mjs';

const ZIEL = 'zentrale/daten/shop-doktor.json';
const FEEDS = 'zentrale/feeds';
const STAND = 'automations/state/shop-schnappschuss.json';
const PAUSE = Number(process.env.SHOP_DOKTOR_PAUSE_MS ?? 800);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; shop-doktor/1.0)' };

async function holen(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const html = await res.text();
    return { status: res.status, ms: Date.now() - t0, html, url: res.url };
  } catch (err) {
    return { status: 0, ms: Date.now() - t0, html: '', url, fehler: err.message };
  }
}

async function alleProdukte(shop) {
  const alle = [];
  for (let seite = 1; seite <= 10; seite++) {
    const r = await holen(`${shop}/products.json?limit=250&page=${seite}`);
    if (r.status !== 200) break;
    const liste = JSON.parse(r.html).products || [];
    alle.push(...liste.map((p) => ({ ...p, shopUrl: shop, shopName: shopName(shop) })));
    if (liste.length < 250) break;
  }
  return alle;
}

async function shopUntersuchen(shop) {
  const produkte = await alleProdukte(shop);
  const start = await holen(shop);
  const [robots, sitemap] = await Promise.all([holen(`${shop}/robots.txt`), holen(`${shop}/sitemap.xml`)]);
  const pflicht = [];
  for (const [name, pfade] of PFLICHT) {
    let ok = false;
    for (const pfad of pfade) { const r = await holen(`${shop}${pfad}`); if (r.status === 200 && r.html.length > 1500) { ok = true; break; } }
    pflicht.push([name, ok]);
  }
  const doppelt = doppelteTitel(produkte);
  const ergebnisse = [];
  for (const p of produkte) {
    const url = `${shop}/products/${p.handle}`;
    await warte(PAUSE);
    const befunde = [...produktPruefen(p, { titelDoppelt: doppelt.has(p.id) }), ...seitePruefen(await holen(url))];
    ergebnisse.push({ id: p.id, titel: p.title, url, bild: p.images?.[0]?.src || '', punkte: punktzahl(befunde), befunde });
  }
  const shopBefunde = shopPruefen({ start, robots: robots.status === 200, sitemap: sitemap.status === 200, pflicht });
  const schnitt = ergebnisse.length ? ergebnisse.reduce((s, x) => s + x.punkte, 0) / ergebnisse.length : 0;
  return {
    name: shopName(shop), url: shop, ladezeitMs: start.ms, produkte: ergebnisse.sort((a, b) => a.punkte - b.punkte),
    befunde: shopBefunde, pflicht: Object.fromEntries(pflicht),
    punkte: Math.round(Math.max(0, punktzahl(shopBefunde) - (100 - schnitt))), rohProdukte: produkte,
  };
}

async function main() {
  const alt = existsSync(ZIEL) ? JSON.parse(readFileSync(ZIEL, 'utf8')) : { verlauf: [] };
  const shops = [];
  for (const shop of SHOPS) {
    const s = await shopUntersuchen(shop);
    console.log(`[shop-doktor] ${s.name}: ${s.punkte}/100 · ${s.produkte.length} Produkte · Startseite ${s.ladezeitMs} ms · ${s.befunde.length + s.produkte.reduce((n, p) => n + p.befunde.length, 0)} Befunde`);
    shops.push(s);
  }
  // Text-Vorschlaege (KI) fuer Produkte mit fehlender Meta-Beschreibung, kurzem Text oder Heilversprechen.
  const faelle = shops.flatMap((s) => s.rohProdukte.map((p) => ({ p, e: s.produkte.find((x) => x.id === p.id) }))).filter((f) => f.e && braucht(f.e.befunde));
  const { cache, neu: neueTexte } = await vorschlaegeHolen(faelle, (prompt) => kiJson(prompt, { maxTokens: 1200 }), { cache: cacheLaden(), pauseMs: Number(process.env.SHOP_DOKTOR_KI_PAUSE_MS ?? 15000) });
  for (const { p, e } of faelle) { const v = cache[`${p.id}:${fingerabdruck(p)}`]; if (v) e.vorschlag = { meta: v.meta, beschreibung: v.beschreibung }; }
  cacheSpeichern(cache);
  if (faelle.length) console.log(`[shop-doktor] Text-Vorschläge: ${faelle.filter((f) => f.e.vorschlag).length}/${faelle.length} Produkte (${neueTexte} neu)`);
  // Feeds aus allen Shops (je Shop eigene Dateien + eine gemeinsame).
  mkdirSync(FEEDS, { recursive: true });
  const feeds = {};
  for (const s of shops) {
    const e = feedEintraege(s.rohProdukte);
    const key = s.name.toLowerCase();
    writeFileSync(`${FEEDS}/${key}-google.xml`, googleXml(e, { titel: s.name, link: s.url }));
    writeFileSync(`${FEEDS}/${key}-meta.csv`, katalogCsv(e));
    feeds[s.name] = { eintraege: e.length, google: `feeds/${key}-google.xml`, meta: `feeds/${key}-meta.csv`, pinterest: `feeds/${key}-meta.csv` };
    console.log(`[shop-doktor] Feeds ${s.name}: ${e.length} Einträge (Google XML, Meta/Pinterest CSV)`);
  }
  // Aenderungs-Waechter: Vergleich mit dem letzten Lauf (Preis, ausverkauft, neu, entfernt).
  const letzterStand = existsSync(STAND) ? JSON.parse(readFileSync(STAND, 'utf8')) : {};
  const jetzt = Object.fromEntries(shops.filter((s) => s.rohProdukte.length).map((s) => [s.name, schnappschuss(s.rohProdukte)]));
  const neueAenderungen = shops.flatMap((s) => (jetzt[s.name] ? aenderungen(letzterStand[s.name], jetzt[s.name], s.name) : []));
  mkdirSync('automations/state', { recursive: true });
  writeFileSync(STAND, JSON.stringify({ ...letzterStand, ...jetzt }, null, 1) + '\n');
  if (neueAenderungen.length) {
    console.log(`[shop-doktor] ${neueAenderungen.length} Änderungen seit dem letzten Lauf`);
    await notifyTelegram(`🔔 Shop-Änderungen\n\n${neueAenderungen.slice(0, 20).map((x) => `• ${x.shop} · ${x.titel}: ${x.text}`).join('\n')}`);
  }
  const heute = new Date().toISOString().slice(0, 10);
  const verlauf = [...(alt.verlauf || []).filter((v) => v.datum !== heute), { datum: heute, ...Object.fromEntries(shops.map((s) => [s.name, s.punkte])) }].slice(-60);
  const protokoll = [...neueAenderungen.map((x) => ({ ...x, datum: heute })), ...(alt.aenderungen || [])].slice(0, 200);
  const daten = { stand: new Date().toISOString(), shops: shops.map(({ rohProdukte, ...s }) => s), feeds, verlauf, aenderungen: protokoll };
  mkdirSync('zentrale/daten', { recursive: true });
  writeFileSync(ZIEL, JSON.stringify(daten, null, 1) + '\n');
  // Nur NEUE kritische Befunde melden (kein taeglicher Spam).
  const schluessel = (d) => new Set(d.shops?.flatMap((s) => [...s.befunde, ...s.produkte.flatMap((p) => p.befunde.map((b) => ({ ...b, was: `${p.titel}: ${b.was}` })))].filter((b) => b.stufe === 'kritisch').map((b) => `${s.name}|${b.was}`)) || []);
  const vorher = schluessel(alt);
  const neu = [...schluessel(daten)].filter((k) => !vorher.has(k));
  if (neu.length) await notifyTelegram(`🩺 Shop-Doktor: ${neu.length} neue kritische Punkte\n\n${neu.slice(0, 15).map((k) => `• ${k.replace('|', ': ')}`).join('\n')}`);
}

main().catch((err) => { console.error('[shop-doktor]', err.message); process.exit(1); });
