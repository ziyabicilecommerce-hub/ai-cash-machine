// Community-Agent (taeglich 16:05 UTC): ein Community-Beitrag nach Wochenplan in Telegram-Kanal + Discord,
// sonntags mit echtem Umfrage-Ergebnis. Schreibt Plan/Status fuer Zentrale und Bio-Seite (zentrale/daten/community.json).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { beitrag, KANAELE } from './lib/community.mjs';

const STATE = 'automations/state/community.json';
const ZIEL = 'zentrale/daten/community.json';
const env = (k) => (process.env[k] || '').trim();
const lies = (p, f) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : f; } catch { return f; } };

async function main() {
  const jetzt = new Date();
  const heute = jetzt.toISOString().slice(0, 10);
  const name = env('COMMUNITY_NAME') || 'Fit & entspannt im Alltag';
  const state = lies(STATE, { verlauf: [] });
  const { produkte = [] } = lies('zentrale/daten/produkte.json', {});
  const bereit = Object.entries(KANAELE).filter(([, k]) => k.bereit());

  let ergebnis = null;
  if (jetzt.getUTCDay() === 0 && state.umfrage?.telegram && KANAELE.Telegram.bereit()) {
    try { ergebnis = await KANAELE.Telegram.ergebnis(state.umfrage.telegram); } catch (err) { console.log(`[community] Umfrage-Ergebnis: ${err.message}`); }
  }
  const b = beitrag(jetzt, { produkte, ergebnis, communityName: name });

  if (state.letzterTag === heute && !env('COMMUNITY_ERZWINGEN')) console.log('[community] heute schon gepostet');
  else if (!bereit.length) console.log('[community] noch kein Community-Kanal verbunden (TELEGRAM_BOT_TOKEN + TELEGRAM_KANAL_ID oder DISCORD_WEBHOOK_URL) - Plan steht trotzdem in der Zentrale');
  else {
    const ok = [], fehler = [];
    for (const [kanal, k] of bereit) {
      try {
        const r = await k.senden(b);
        ok.push(kanal);
        if (b.umfrage && kanal === 'Telegram') state.umfrage = { telegram: r.id, datum: heute };
      } catch (err) { fehler.push(`${kanal}: ${err.message}`); }
    }
    if (ergebnis) delete state.umfrage;
    if (ok.length) state.letzterTag = heute;
    state.verlauf = [{ datum: heute, art: b.art, kanaele: ok, fehler, produkt: Boolean(b.produkt) }, ...(state.verlauf || [])].slice(0, 60);
    console.log(`[community] ${b.art}: ${ok.length ? `gepostet in ${ok.join(', ')}` : 'nicht gepostet'}${fehler.length ? ` · Fehler: ${fehler.join(' | ')}` : ''}`);
  }

  mkdirSync('automations/state', { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
  const plan = Array.from({ length: 7 }, (_, i) => { const d = new Date(jetzt.getTime() + i * 864e5); const x = beitrag(d, { produkte, communityName: name }); return { datum: d.toISOString().slice(0, 10), art: x.art, text: x.text }; });
  mkdirSync('zentrale/daten', { recursive: true });
  writeFileSync(ZIEL, JSON.stringify({ stand: jetzt.toISOString(), name, links: { telegram: env('COMMUNITY_TELEGRAM_LINK'), discord: env('COMMUNITY_DISCORD_LINK') }, verbunden: bereit.map(([k]) => k), plan, verlauf: (state.verlauf || []).slice(0, 14) }, null, 1) + '\n');
}

main().catch((err) => { console.error(`[community] ${err.message}`); process.exit(1); });
