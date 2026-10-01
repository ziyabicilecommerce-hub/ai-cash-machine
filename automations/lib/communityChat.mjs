// Community-Chat-Bot (Telegram-Gruppe): begruesst neue Mitglieder mit der aktuellen Challenge und beantwortet
// Fragen nach denselben Regeln wie der Kommentar-Agent - Kauf/Produktfragen mit eigenem Shop-Link, Lob mit Dank,
// Gesundheit/Beschwerden/Unklares meldet er dir. Gespeichert wird nur der Lese-Stand (Offset) und Zaehler.
import { entscheiden } from './kommentare.mjs';
import { CHALLENGES, woche } from './community.mjs';

const env = (k) => (process.env[k] || '').trim();
const API = () => `https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}`;
export const MAX_ANTWORTEN = 15;

export async function updatesHolen(offset, laden = fetch) {
  const res = await laden(`${API()}/getUpdates?timeout=0&offset=${offset || 0}&allowed_updates=${encodeURIComponent('["message"]')}`);
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.ok) throw new Error(`getUpdates ${res.status}: ${String(d.description || '').slice(0, 120)}`);
  return d.result || [];
}

// Passendstes Produkt zur Nachricht (Woerter aus dem Produktnamen, mind. 5 Buchstaben).
export function produktFuer(text, produkte) {
  const t = String(text || '').toLowerCase();
  let best = null, punkte = 0;
  for (const p of produkte) {
    const worte = String(p.name || '').split(/\s[–—-]\s/).slice(1).join(' ').toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 5);
    const n = worte.filter((w) => t.includes(w) || t.includes(w.slice(0, 7))).length;
    if (n > punkte) { best = p; punkte = n; }
  }
  return best;
}

const istFrage = (m, bot) => /\?/.test(m.text) || (bot && m.text.toLowerCase().includes(`@${bot.toLowerCase()}`)) || m.reply_to_message?.from?.username === bot;

// Aus Telegram-Updates werden Aktionen: willkommen | antworten | melden. ki = kiJson.
export async function verarbeiten(updates, { produkte = [], ki, bot = env('TELEGRAM_BOT_NAME'), eigenerChat = env('TELEGRAM_CHAT_ID'), jetzt = new Date() } = {}) {
  const aktionen = [];
  const ch = CHALLENGES[woche(jetzt) % CHALLENGES.length];
  for (const u of updates) {
    const m = u.message;
    if (!m || !m.chat) continue;
    const chat = m.chat.id;
    if (String(chat) === eigenerChat) continue; // dein privater Melde-Chat
    const neu = (m.new_chat_members || []).filter((x) => !x.is_bot);
    if (neu.length) {
      aktionen.push({ typ: 'willkommen', chat, text: `Willkommen in der Community, ${neu.map((x) => x.first_name || 'du').join(', ')}! 👋\nDiese Woche läuft die ${ch.titel}: ${ch.text}\nErzähl gern kurz: Was willst du erreichen?` });
      continue;
    }
    if (!m.text || m.from?.is_bot || (m.text.startsWith('/') && m.text !== '/start')) continue;
    const privat = m.chat.type === 'private';
    if (m.text === '/start') { if (privat) aktionen.push({ typ: 'antworten', chat, text: `Hey ${m.from?.first_name || ''}! 👋 Hier bekommst du Antworten zu Training, Haltung und Entspannung - und zu unseren Produkten. Frag einfach.`.replace('Hey !', 'Hey!') }); continue; }
    if (!privat && !istFrage(m, bot)) continue;
    if (aktionen.filter((a) => a.typ === 'antworten').length >= MAX_ANTWORTEN) break;
    const p = produktFuer(m.text, produkte);
    const kontext = p ? { titel: p.name, caption: p.info || '', shopLink: p.url } : { titel: 'Community "Fit & entspannt im Alltag" (Shops: DeskRebel = Fitness, Purivelle = Massage)', caption: '', shopLink: '' };
    let e;
    try { e = await entscheiden({ autor: m.from?.first_name || '', text: m.text }, kontext, ki); } catch (err) { aktionen.push({ typ: 'fehler', text: String(err.message).slice(0, 120) }); break; }
    if (e.aktion === 'antworten') aktionen.push({ typ: 'antworten', chat, antwortAuf: m.message_id, text: e.antwort, kategorie: e.kategorie });
    else if (e.aktion === 'melden') aktionen.push({ typ: 'melden', text: `• Telegram-Community${privat ? ' (Privatnachricht)' : ''}: „${m.text.slice(0, 160)}“ (${e.grund})` });
  }
  return aktionen;
}

export async function senden(a, laden = fetch) {
  const res = await laden(`${API()}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: a.chat, text: a.text.slice(0, 4000), ...(a.antwortAuf ? { reply_parameters: { message_id: a.antwortAuf, allow_sending_without_reply: true } } : {}) }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.ok) throw new Error(`sendMessage ${res.status}: ${String(d.description || '').slice(0, 120)}`);
}
