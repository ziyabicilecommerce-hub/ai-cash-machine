// Community-Agent: baut eine Community "Fit & entspannt im Alltag" auf (Telegram-Kanal + Discord) - jeden
// Tag ein Beitrag nach Wochenplan: Challenge, Tipp, Umfrage, Frage, Fortschritt, Mini-Routine, Rueckblick.
// 80/20-Regel: nur 1 von 7 Beitraegen nennt ein Produkt. Feste, ehrliche Inhalte (keine KI noetig, keine
// Heilversprechen); Sonntags kommen die echten Umfrage-Ergebnisse der Woche zurueck in die Community.
import { mitUtm } from './utm.mjs';

export const CHALLENGES = [
  { titel: 'Haltungs-Woche', text: 'Jede volle Stunde 30 Sekunden: aufrecht hinsetzen, Schultern nach hinten-unten, 3 tiefe Atemzüge.' },
  { titel: '20-Kniebeugen-Woche', text: 'Jeden Tag 20 Kniebeugen - am Stück oder verteilt, egal wo.' },
  { titel: 'Treppen-Woche', text: 'Jeden Tag Treppe statt Aufzug oder Rolltreppe, wo immer es geht.' },
  { titel: 'Abend-Dehn-Woche', text: 'Jeden Abend 5 Minuten locker dehnen, bevor du schlafen gehst.' },
  { titel: 'Nacken-Pausen-Woche', text: '3-mal am Tag 1 Minute: Schultern hochziehen, fallen lassen, Kopf langsam von Seite zu Seite neigen.' },
  { titel: 'Liegestütz-Leiter', text: 'Tag 1: 5 Liegestütze, jeden Tag einer mehr - an der Wand oder auf den Knien zählt genauso.' },
  { titel: 'Schritte-Woche', text: 'Jeden Tag 8.000 Schritte. Kurzer Spaziergang nach dem Essen hilft enorm.' },
  { titel: 'Wasser-Woche', text: 'Vor jedem Kaffee zuerst ein Glas Wasser.' },
];

export const TIPPS = [
  'Bildschirm auf Augenhöhe stellen - dann kippt der Kopf nicht ständig nach vorne. Ein Stapel Bücher reicht.',
  '20-20-20-Regel: Alle 20 Minuten 20 Sekunden auf etwas schauen, das etwa 6 Meter entfernt ist. Gönn deinen Augen die Pause.',
  'Kein Platz, keine Zeit? 2 Minuten zählen auch. Wer jeden Tag kurz trainiert, bleibt eher dran als mit einer langen Einheit pro Woche.',
  'Langsam schlägt schnell: Übungen kontrolliert ausführen bringt mehr als viele hektische Wiederholungen.',
  'Beim Telefonieren aufstehen und gehen - so kommen nebenbei ein paar hundert Schritte zusammen.',
  'Feste Zeit, fester Ort: Gewohnheiten halten besser, wenn sie an etwas hängen, das du sowieso tust (z. B. nach dem Zähneputzen).',
  'Atmung als Pausenknopf: 4 Sekunden ein, 6 Sekunden aus, eine Minute lang. Länger ausatmen fühlt sich für viele beruhigend an.',
  'Aufwärmen nicht vergessen: 2-3 Minuten lockere Bewegung, bevor es intensiver wird.',
  'Fortschritt aufschreiben: Ein kurzer Eintrag pro Tag zeigt nach 4 Wochen, wie weit du gekommen bist.',
  'Sitzen ist okay - lange ohne Bewegung sitzen ist das Problem. Stell dir einen Wecker für kurze Bewegungspausen.',
];

export const UMFRAGEN = [
  { frage: 'Wann bewegst du dich am liebsten?', optionen: ['Morgens', 'Mittagspause', 'Nach der Arbeit', 'Abends spät'] },
  { frage: 'Wo zwickt es nach einem langen Arbeitstag am meisten?', optionen: ['Nacken', 'Schultern', 'Unterer Rücken', 'Handgelenke', 'Nirgends 💪'] },
  { frage: 'Wie lange sitzt du an einem normalen Tag?', optionen: ['Unter 4 Stunden', '4-6 Stunden', '6-8 Stunden', 'Mehr als 8 Stunden'] },
  { frage: 'Was hält dich am häufigsten vom Training ab?', optionen: ['Keine Zeit', 'Keine Lust', 'Weiß nicht, was ich machen soll', 'Nichts - ich ziehe durch'] },
  { frage: 'Welche Challenge wollt ihr als Nächstes?', optionen: ['Kniebeugen', 'Dehnen', 'Schritte', 'Liegestütze'] },
  { frage: 'Wie entspannst du am liebsten?', optionen: ['Massage', 'Spaziergang', 'Sport', 'Couch & Serie'] },
  { frage: 'Trainierst du lieber allein oder mit anderen?', optionen: ['Allein', 'Mit Freunden', 'Online mit einer Community', 'Kommt drauf an'] },
];

export const FRAGEN = [
  'Ehrlich: Was ist deine Lieblings-Ausrede, um nicht zu trainieren? 😄 Schreib sie in die Kommentare - wir finden gemeinsam einen Trick dagegen.',
  'Welche eine kleine Gewohnheit hat bei dir am meisten verändert?',
  'Wie sieht dein Arbeitsplatz aus? Eher Schreibtisch, eher Couch, eher unterwegs?',
  'Was war dein bester Moment diese Woche - egal wie klein?',
  'Welche Übung hasst du - und machst sie trotzdem? 😅',
  'Was würdest du gern können, das du heute noch nicht schaffst? (Z. B. einen Klimmzug.)',
  'Welche Frage zu Training, Haltung oder Entspannung sollen wir nächste Woche beantworten?',
];

export const ROUTINEN = [
  { titel: '5-Minuten-Schreibtisch-Routine', schritte: ['Schulterkreisen, 30 Sekunden vorwärts, 30 rückwärts', 'Nacken sanft zur Seite neigen, je Seite 20 Sekunden', 'Aufstehen, 10 Kniebeugen', 'Arme über Kopf strecken, 3 tiefe Atemzüge', 'Brust öffnen: Hände hinter dem Rücken verschränken, 20 Sekunden'], shop: 'Purivelle' },
  { titel: '5-Minuten-Kraft-Snack', schritte: ['10 Kniebeugen', '8 Liegestütze (Knie oder Wand ist okay)', '20 Sekunden Unterarmstütz', '10 Ausfallschritte je Bein', 'Alles ein zweites Mal'], shop: 'DeskRebel' },
  { titel: '5-Minuten-Feierabend-Entspannung', schritte: ['1 Minute ruhig atmen: 4 ein, 6 aus', 'Schultern hochziehen und fallen lassen, 10-mal', 'Seitlich dehnen, je Seite 30 Sekunden', 'Waden und Oberschenkel lockern', 'Zum Schluss: kurz bewusst die Augen schließen'], shop: 'Purivelle' },
];

// Wochenplan nach UTC-Wochentag (0 = Sonntag).
export const WOCHENPLAN = ['rueckblick', 'challenge', 'tipp', 'umfrage', 'frage', 'fortschritt', 'routine'];
export const woche = (d) => Math.floor((d.getTime() / 864e5 + 3) / 7); // Wochen seit 1970, Wechsel am Montag

// Beitrag fuer einen Tag. produkte: [{name, shop, url}] fuer den einen Produkt-Beitrag (Samstag).
export function beitrag(datum = new Date(), { produkte = [], ergebnis = null, communityName = 'Fit & entspannt im Alltag' } = {}) {
  const art = WOCHENPLAN[datum.getUTCDay()];
  const w = woche(datum);
  const ch = CHALLENGES[w % CHALLENGES.length];
  if (art === 'challenge') return { art, text: `🏁 Neue Wochen-Challenge: ${ch.titel}\n\n${ch.text}\n\nWer ist dabei? Reagiere mit 💪 - am Freitag schauen wir gemeinsam, wie es lief.` };
  if (art === 'tipp') return { art, text: `💡 Tipp der Woche\n\n${TIPPS[w % TIPPS.length]}` };
  if (art === 'umfrage') { const u = UMFRAGEN[w % UMFRAGEN.length]; return { art, text: `📊 Umfrage: ${u.frage}`, umfrage: u }; }
  if (art === 'frage') return { art, text: `💬 Frage an euch\n\n${FRAGEN[w % FRAGEN.length]}` };
  if (art === 'fortschritt') return { art, text: `🔥 Fortschritts-Freitag\n\nWie lief die ${ch.titel}? Erzähl kurz, wie viele Tage du geschafft hast - jeder Tag zählt, auch wenn es nicht alle 7 waren.` };
  if (art === 'routine') {
    const r = ROUTINEN[w % ROUTINEN.length];
    const p = produkte.filter((x) => x.shop === r.shop)[w % Math.max(1, produkte.filter((x) => x.shop === r.shop).length)];
    const zusatz = p ? `\n\nWer noch ein Hilfsmittel dafür sucht: ${p.name} - ${mitUtm(p.url, 'community', r.titel)}` : '';
    return { art, text: `⏱️ ${r.titel} - zum Mitmachen\n\n${r.schritte.map((s, i) => `${i + 1}. ${s}`).join('\n')}${zusatz}`, produkt: Boolean(p) };
  }
  // Sonntag: Rueckblick mit echtem Umfrage-Ergebnis (falls vorhanden) + Ausblick.
  const naechste = CHALLENGES[(w + 1) % CHALLENGES.length];
  const erg = ergebnis && ergebnis.gesamt ? `\n\nEure Umfrage der Woche - „${ergebnis.frage}“:\n${ergebnis.optionen.map((o) => `${o.text}: ${Math.round((o.stimmen / ergebnis.gesamt) * 100)} %`).join('\n')}` : '';
  return { art, text: `📅 Wochenrückblick ${communityName}\n\nDanke, dass ihr dabei seid!${erg}\n\nMorgen startet die nächste Challenge: ${naechste.titel}. Erzählt es weiter - zusammen hält man länger durch.` };
}

// ---------- Senden ----------
const env = (k) => (process.env[k] || '').trim();
async function json(res, was) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.ok === false) throw new Error(`${was}: ${res.status} ${String(d.description || d.message || '').slice(0, 140)}`);
  return d;
}

export const KANAELE = {
  Telegram: {
    bereit: () => Boolean(env('TELEGRAM_BOT_TOKEN') && env('TELEGRAM_KANAL_ID')),
    async senden(b, laden = fetch) {
      const api = `https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}`;
      const post = (m, body) => laden(`${api}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env('TELEGRAM_KANAL_ID'), ...body }) });
      if (b.umfrage) {
        const d = await json(await post('sendPoll', { question: b.umfrage.frage.slice(0, 300), options: b.umfrage.optionen.map((text) => ({ text })), is_anonymous: true }), 'sendPoll');
        return { id: d.result?.message_id };
      }
      const d = await json(await post('sendMessage', { text: b.text.slice(0, 4000), disable_web_page_preview: false }), 'sendMessage');
      return { id: d.result?.message_id };
    },
    // Umfrage beenden und echtes Ergebnis holen (Kanal-Umfragen sind anonym).
    async ergebnis(id, laden = fetch) {
      const d = await json(await laden(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/stopPoll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env('TELEGRAM_KANAL_ID'), message_id: id }) }), 'stopPoll');
      const p = d.result || {};
      return { frage: p.question, gesamt: p.total_voter_count || 0, optionen: (p.options || []).map((o) => ({ text: o.text, stimmen: o.voter_count || 0 })) };
    },
  },
  Discord: {
    bereit: () => Boolean(env('DISCORD_WEBHOOK_URL')),
    async senden(b, laden = fetch) {
      const body = b.umfrage
        ? { poll: { question: { text: b.umfrage.frage.slice(0, 300) }, answers: b.umfrage.optionen.map((text) => ({ poll_media: { text: text.slice(0, 55) } })), duration: 96, allow_multiselect: false } }
        : { content: b.text.slice(0, 2000) };
      const d = await json(await laden(`${env('DISCORD_WEBHOOK_URL')}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), 'Webhook');
      return { id: d.id };
    },
  },
};
