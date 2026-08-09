// Broken-Link-Guardian - ruft die ECHTEN Produktseiten-URLs im eigenen Shop
// auf (aus dem Shopify-Katalog abgeleitet, kein blindes HTML-Scraping
// fremder Links) und meldet, welche nicht mehr erreichbar sind (404, 500,
// Timeout) - z.B. nach einer Handle-Änderung oder einem Theme-Umzug.
// Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Ergänzt #53 Store Builder & Optimizer (prüft nur die STARTSEITE auf
// Vertrauens-/Conversion-Basics) - hier geht es um die technische
// Erreichbarkeit einzelner Produktseiten. Rein meldend, ändert nichts.
import { config } from './lib/config.mjs';
import { getProducts } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '72-broken-link-guardian';
const TELEGRAM_MAX_CHARS = 3500;
const FETCH_TIMEOUT_MS = 8000;
const COOLDOWN_STUNDEN = 24; // kein Spam bei jedem Lauf, solange derselbe Link kaputt bleibt

async function pruefeUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', method: 'GET' });
    clearTimeout(timeout);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: null, fehler: err.message };
  }
}

async function main() {
  if (!config.SHOP_URL) {
    console.log('[72-broken-link-guardian] SHOP_URL nicht konfiguriert - übersprungen.');
    return;
  }

  const maxProdukte = parseInt(config.BROKEN_LINK_MAX_PRODUKTE || '30', 10);
  const produkte = (await getProducts({ limit: '250', status: 'active', fields: 'id,title,handle' })).slice(0, maxProdukte);

  const state = loadState(STATE_KEY);
  state.letzteMeldung = state.letzteMeldung || {};
  const jetzt = Date.now();

  const kaputt = [];
  for (const p of produkte) {
    const url = `${config.SHOP_URL.replace(/\/$/, '')}/products/${p.handle}`;
    const ergebnis = await pruefeUrl(url);
    if (ergebnis.ok) continue;

    const letzteMeldungTs = state.letzteMeldung[p.id];
    if (letzteMeldungTs && jetzt - letzteMeldungTs < COOLDOWN_STUNDEN * 3600000) continue;

    kaputt.push({ produkt: p, url, status: ergebnis.status, fehler: ergebnis.fehler });
  }

  if (!kaputt.length) {
    console.log('[72-broken-link-guardian] Keine neu erkannten kaputten Links.');
    return;
  }

  const zeilen = kaputt.map((k) => `- ${k.produkt.title}: ${k.url} → ${k.status ? `HTTP ${k.status}` : k.fehler}`);
  const chunks = chunkZeilen(zeilen, TELEGRAM_MAX_CHARS);
  let gemeldet = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const kopf = chunks.length > 1
        ? `🔗 Broken-Link-Guardian (Teil ${i + 1}/${chunks.length}):`
        : `🔗 Broken-Link-Guardian:`;
      await notifyTelegram(`${kopf}${NL}${NL}${chunks[i].join(NL)}`);

      const chunkStart = chunks.slice(0, i).reduce((sum, c) => sum + c.length, 0);
      const dieserChunk = kaputt.slice(chunkStart, chunkStart + chunks[i].length);
      for (const k of dieserChunk) state.letzteMeldung[k.produkt.id] = jetzt;
      saveState(STATE_KEY, state);
      gemeldet += dieserChunk.length;
    } catch (err) {
      console.error(`[72-broken-link-guardian] Meldung Teil ${i + 1} fehlgeschlagen:`, err.message || err);
    }
  }

  console.log(`[72-broken-link-guardian] ${gemeldet}/${kaputt.length} kaputte(r) Link(s) gemeldet.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[72-broken-link-guardian] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[72-broken-link-guardian] Fehler:', err);
  process.exit(1);
});
