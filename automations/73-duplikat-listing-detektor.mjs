// Duplikat-Listing-Detektor - vergleicht ALLE aktiven Produkttitel
// paarweise per Textähnlichkeit (Bigramm-Dice-Koeffizient, komplett lokal
// berechnet - kein Claude-Aufruf nötig, kostet keine Tokens) und meldet
// fast-identische Produkte, die versehentlich doppelt angelegt wurden oder
// sich bei SEO/Kunden gegenseitig verwirren. Neu, kein n8n-Workflow ·
// Zeitplan: wöchentlich.
//
// Rein meldend - löscht/verändert nichts, die Entscheidung (zusammenlegen,
// umbenennen, absichtliche Variante) bleibt bewusst beim Gründer.
import { config } from './lib/config.mjs';
import { getProducts } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '73-duplikat-listing-detektor';
const TELEGRAM_MAX_CHARS = 3500;

function bigramme(text) {
  const normalisiert = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const set = new Set();
  for (let i = 0; i < normalisiert.length - 1; i++) set.add(normalisiert.slice(i, i + 2));
  return set;
}

function diceKoeffizient(a, b) {
  const bigA = bigramme(a);
  const bigB = bigramme(b);
  if (!bigA.size || !bigB.size) return 0;
  let schnittmenge = 0;
  for (const bg of bigA) if (bigB.has(bg)) schnittmenge++;
  return (2 * schnittmenge) / (bigA.size + bigB.size);
}

function paarSchluessel(idA, idB) {
  return [idA, idB].sort((a, b) => a - b).join('-');
}

async function main() {
  const schwelle = parseFloat(config.DUPLIKAT_AEHNLICHKEIT_SCHWELLE || '0.85');
  const produkte = await getProducts({ limit: '250', status: 'active', fields: 'id,title,handle' });

  const state = loadState(STATE_KEY);
  state.gemeldetePaare = state.gemeldetePaare || [];
  const bereitsGemeldet = new Set(state.gemeldetePaare);

  const neueTreffer = [];
  for (let i = 0; i < produkte.length; i++) {
    for (let j = i + 1; j < produkte.length; j++) {
      const a = produkte[i];
      const b = produkte[j];
      const aehnlichkeit = diceKoeffizient(a.title, b.title);
      if (aehnlichkeit < schwelle) continue;

      const schluessel = paarSchluessel(a.id, b.id);
      if (bereitsGemeldet.has(schluessel)) continue;

      neueTreffer.push({ a, b, aehnlichkeit, schluessel });
    }
  }

  if (!neueTreffer.length) {
    console.log('[73-duplikat-listing-detektor] Keine neuen Duplikat-Verdachtsfälle.');
    return;
  }

  const zeilen = neueTreffer.map(
    (t) => `- "${t.a.title}" ↔ "${t.b.title}" (${(t.aehnlichkeit * 100).toFixed(0)}% ähnlich)${NL}  /products/${t.a.handle} · /products/${t.b.handle}`,
  );
  const chunks = chunkZeilen(zeilen, TELEGRAM_MAX_CHARS);
  let gemeldet = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const kopf = chunks.length > 1
        ? `🪞 Duplikat-Listing-Detektor (Teil ${i + 1}/${chunks.length}):`
        : `🪞 Duplikat-Listing-Detektor:`;
      await notifyTelegram(`${kopf}${NL}${NL}${chunks[i].join(NL)}`);

      const chunkStart = chunks.slice(0, i).reduce((sum, c) => sum + c.length, 0);
      const dieserChunk = neueTreffer.slice(chunkStart, chunkStart + chunks[i].length);
      for (const t of dieserChunk) state.gemeldetePaare.push(t.schluessel);
      if (state.gemeldetePaare.length > 5000) state.gemeldetePaare = state.gemeldetePaare.slice(-5000);
      saveState(STATE_KEY, state);
      gemeldet += dieserChunk.length;
    } catch (err) {
      console.error(`[73-duplikat-listing-detektor] Meldung Teil ${i + 1} fehlgeschlagen:`, err.message || err);
    }
  }

  console.log(`[73-duplikat-listing-detektor] ${gemeldet}/${neueTreffer.length} Duplikat-Paar(e) gemeldet.`);
}

main().catch((err) => {
  console.error('[73-duplikat-listing-detektor] Fehler:', err);
  process.exit(1);
});
