// Kommentar-Agent (stuendlich 8-22 Uhr): beantwortet neue Kommentare unter den eigenen Posts der letzten
// 14 Tage ehrlich (Fragen, Kaufinteresse mit Produkt-Link, Lob) und meldet dir alles Heikle per Telegram.
// Datenschutz (oeffentliches Repo): gespeichert werden nur IDs, Kategorien und Zaehler - keine Namen, keine Texte.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { ADAPTER, entscheiden } from './lib/kommentare.mjs';
import { kiJson } from './lib/kiJson.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { verbinderLaden } from './lib/verbinder.mjs';

const STATE = 'automations/state/kommentare.json';
const SEITE = 'zentrale/daten/kommentare.json';
const TAG = 864e5;
const MAX = Number(process.env.KOMMENTARE_MAX_PRO_LAUF || 15);
const lesen = (p, leer) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : leer; } catch { return leer; } };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

export async function lauf({ posts, feed, state, ki, laden = fetch, jetzt = Date.now(), pause = 3000, adapter = ADAPTER }) {
  const erledigt = new Set(Object.keys(state.erledigt || {}));
  const zaehler = { antworten: 0, melden: 0, ignorieren: 0, fehler: 0 };
  const meldungen = [];
  const nachDatei = new Map(feed.map((v) => [v.datei, v]));
  for (const post of posts.filter((p) => adapter[p.plattform]?.bereit() && jetzt - Date.parse(p.gepostet) < 14 * TAG)) {
    const a = adapter[post.plattform];
    const v = nachDatei.get(post.datei) || nachDatei.get(String(post.datei).replace(/-(frage|warnung|widerspruch)\.mp4$/, '.mp4')) || {};
    const kontext = { titel: v.titel || post.datei, caption: v.caption || '', shopLink: String(v.caption || '').match(/https:\/\/\S+\/products\/\S+/)?.[0] || '' };
    let liste = [];
    try { liste = await a.lesen(post, laden); } catch (err) { zaehler.fehler++; console.log(`[kommentare] ${post.plattform}: ${String(err.message).slice(0, 120)}`); continue; }
    for (const k of liste) {
      const schluessel = `${post.plattform}:${k.id}`;
      if (erledigt.has(schluessel) || a.eigen(k) || !(jetzt - Date.parse(k.zeit) < 3 * TAG)) continue;
      if (zaehler.antworten >= MAX) break;
      let e;
      try { e = await entscheiden(k, kontext, ki); } catch (err) { console.log(`[kommentare] KI: ${String(err.message).slice(0, 100)}`); return { zaehler, meldungen, state }; }
      if (e.aktion === 'antworten') {
        try { await a.antworten(k, e.antwort, laden); zaehler.antworten++; if (pause) await warte(pause); } catch (err) { zaehler.fehler++; console.log(`[kommentare] Antwort ${post.plattform}: ${String(err.message).slice(0, 120)}`); continue; }
      } else if (e.aktion === 'melden') { zaehler.melden++; meldungen.push(`• ${post.plattform} · ${kontext.titel.slice(0, 40)}: „${String(k.text).slice(0, 140)}“ (${e.grund})`); } else zaehler.ignorieren++;
      state.erledigt = { ...(state.erledigt || {}), [schluessel]: { a: e.aktion, k: e.kategorie || e.grund, t: new Date(jetzt).toISOString().slice(0, 10) } };
      erledigt.add(schluessel);
    }
  }
  // Nur die letzten 30 Tage merken.
  state.erledigt = Object.fromEntries(Object.entries(state.erledigt || {}).filter(([, x]) => jetzt - Date.parse(x.t) < 30 * TAG));
  return { zaehler, meldungen, state };
}

async function main() {
  await verbinderLaden();
  const posts = lesen('video-feed/posts.json', []);
  if (!posts.length) return console.log('[kommentare] Noch keine Posts - sobald ein Kanal postet, beantwortet der Agent die Kommentare.');
  const feed = lesen('video-feed/videos.json', { videos: [] }).videos || [];
  const state = lesen(STATE, { erledigt: {} });
  const { zaehler, meldungen } = await lauf({ posts, feed, state, ki: (p) => kiJson(p, { maxTokens: 400 }) });
  mkdirSync('automations/state', { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
  const seite = lesen(SEITE, { tage: {} });
  const heute = new Date().toISOString().slice(0, 10);
  const t = seite.tage[heute] || { antworten: 0, melden: 0, ignorieren: 0 };
  for (const k of ['antworten', 'melden', 'ignorieren']) t[k] += zaehler[k];
  seite.tage = Object.fromEntries(Object.entries({ ...seite.tage, [heute]: t }).slice(-30));
  seite.stand = new Date().toISOString();
  mkdirSync('zentrale/daten', { recursive: true });
  writeFileSync(SEITE, JSON.stringify(seite, null, 1) + '\n');
  console.log(`[kommentare] beantwortet ${zaehler.antworten} · an dich gemeldet ${zaehler.melden} · Spam ignoriert ${zaehler.ignorieren} · Fehler ${zaehler.fehler}`);
  if (meldungen.length) await notifyTelegram(`💬 ${meldungen.length} Kommentar(e) für dich (bitte selbst antworten):\n\n${meldungen.slice(0, 15).join('\n')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((err) => { console.error('[kommentare]', err.message); process.exit(1); });
