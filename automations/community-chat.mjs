// Community-Chat-Bot (stuendlich mit dem Kommentar-Agenten): Telegram-Gruppe/Privatnachrichten lesen,
// begruessen, antworten, Heikles melden. Datenschutz: nur Offset + Tageszaehler werden gespeichert.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { updatesHolen, verarbeiten, senden } from './lib/communityChat.mjs';
import { kiJson } from './lib/kiJson.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const STATE = 'automations/state/community-chat.json';
const SEITE = 'zentrale/daten/community-chat.json';
const lies = (p, f) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : f; } catch { return f; } };

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) { console.log('[community-chat] kein TELEGRAM_BOT_TOKEN - übersprungen'); return; }
  const state = lies(STATE, { offset: 0 });
  const me = await (await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`)).json().catch(() => ({}));
  const updates = await updatesHolen(state.offset);
  const { produkte = [] } = lies('zentrale/daten/produkte.json', {});
  const aktionen = await verarbeiten(updates, { produkte, bot: me.result?.username || '', ki: (p) => kiJson(p, { maxTokens: 400 }) });
  const z = { willkommen: 0, antworten: 0, melden: 0, fehler: 0 };
  for (const a of aktionen) {
    if (a.typ === 'melden') { z.melden++; continue; }
    if (a.typ === 'fehler') { z.fehler++; console.log(`[community-chat] KI: ${a.text}`); continue; }
    try { await senden(a); z[a.typ]++; await new Promise((r) => setTimeout(r, 1200)); } catch (err) { z.fehler++; console.log(`[community-chat] ${err.message}`); }
  }
  const meldungen = aktionen.filter((a) => a.typ === 'melden').map((a) => a.text);
  if (meldungen.length) await notifyTelegram(`💬 Community - bitte persönlich antworten:\n\n${meldungen.join('\n')}`);
  // Offset erst nach dem Verarbeiten weitersetzen - bricht die KI ab, kommen die Nachrichten beim naechsten Lauf wieder.
  if (updates.length && !z.fehler) state.offset = updates.at(-1).update_id + 1;
  mkdirSync('automations/state', { recursive: true });
  writeFileSync(STATE, JSON.stringify(state) + '\n');
  const heute = new Date().toISOString().slice(0, 10);
  const seite = lies(SEITE, { tage: {} });
  const t = seite.tage[heute] || { willkommen: 0, antworten: 0, melden: 0 };
  for (const k of ['willkommen', 'antworten', 'melden']) t[k] += z[k];
  seite.tage = Object.fromEntries(Object.entries({ ...seite.tage, [heute]: t }).sort().slice(-30));
  mkdirSync('zentrale/daten', { recursive: true });
  writeFileSync(SEITE, JSON.stringify({ stand: new Date().toISOString(), bot: me.result?.username || '', tage: seite.tage }, null, 1) + '\n');
  console.log(`[community-chat] ${updates.length} Updates · ${z.willkommen} begrüßt · ${z.antworten} beantwortet · ${z.melden} gemeldet${z.fehler ? ` · ${z.fehler} Fehler` : ''}`);
}

main().catch((err) => { console.error(`[community-chat] ${err.message}`); process.exit(1); });
