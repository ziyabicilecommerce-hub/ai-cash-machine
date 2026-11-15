// YouTube-Hits nutzen (15.11., Wunsch: "schau was bei YT viral gegangen ist und benutz das").
// Gemessen auf giyuuu sama (verlauf.json): 5.-8.11. liefen Alltags-Geschichten rund ums Handy mit ~1000 Aufrufen
// ("Never check your doorbell camera", "Wenn dich deine eigene Nummer anruft", "Wenn es nachts an deiner Wand klopft",
// "two warm coffee cups"), und Wiederholungen eines Hits liefen wieder gut (Kaffeetassen 828 + 968 Aufrufe).
// Darum: 1) Remake - ein YouTube-Hit kommt nach ein paar Tagen einmal neu (anderer Anfangssatz, neues Video).
//        2) Hit-Wörter - Geschichten mit Wörtern aus den Hits bekommen Bonus-Punkte beim Sortieren.
import { slug } from './videobot.mjs';

const TAG = 864e5;
const STOP = new Set(['watch', 'headphones', 'hidden', 'times', 'video', 'would', 'their', 'there', 'schauen', 'kopfhörern',
  'augen', 'seine', 'versteckt', 'hättest', 'nicht', 'heute', 'nacht', 'night', 'today', 'about', 'which', 'immer', 'diesem', 'every']);
const istYT = (p) => /giyuuu/i.test(p.konto || '');
const anfang = (p) => String(p.text || '').split(/[🎧👀]/u)[0];

// Wörter (ab 5 Buchstaben) aus den Anfangssätzen der YouTube-Posts mit mindestens `min` Aufrufen
export function hitWoerter(posts = [], min = 500) {
  const w = new Set();
  for (const p of posts) if (istYT(p) && p.aufrufe >= min)
    for (const x of anfang(p).toLowerCase().match(/[a-zäöüß]{5,}/g) || []) if (!STOP.has(x)) w.add(x);
  return w;
}

export function hitBonus(s = {}, woerter = new Set()) {
  if (!woerter.size) return 0;
  const t = `${s.hook || ''} ${s.hook2 || ''}`.toLowerCase().match(/[a-zäöüß]{5,}/g) || [];
  return Math.min(3, new Set(t.filter((x) => woerter.has(x))).size);
}

// Remake eines YouTube-Hits: Post mit mind. `min` Aufrufen, mind. `alterTage` alt, Geschichte in einem der Töpfe gefunden,
// noch nie als Remake gelaufen. Der Anfangssatz wird getauscht (Ich-Hook <-> Du-Hook), wenn es beide gibt.
export function remakeKandidat(posts = [], toepfe = [], gepostet = {}, jetzt = Date.now(), { min = 500, alterTage = 5 } = {}) {
  const passt = (p, s) => [s.hook, s.hook2].filter(Boolean).some((h) => String(p.text || '').includes(String(h).slice(0, 40)));
  const hits = posts.filter((p) => istYT(p) && p.aufrufe >= min && jetzt - new Date(p.zeit) >= alterTage * TAG).sort((a, b) => b.aufrufe - a.aufrufe);
  for (const p of hits) for (const { skripte, sprache } of toepfe) {
    const s = skripte.find((x) => passt(p, x));
    if (!s) continue;
    const schluessel = `remake:${slug(s.titel)}`;
    if (gepostet[`horror:${schluessel}`]) break;
    const lief2 = s.hook2 && String(p.text || '').includes(String(s.hook2).slice(0, 40));
    const hook = lief2 ? s.hook : (s.hook2 || s.hook);
    return { skript: { ...s, hook, hook2: undefined }, herkunft: `YouTube-Hit-Remake (${p.aufrufe} Aufrufe)`, schluessel, sprache };
  }
  return null;
}

// nach einem Remake kommt erst wieder eine neue Geschichte (abwechselnd)
export const zuletztRemake = (stand = {}) => Object.entries(stand).filter(([k]) => k.startsWith('horror:'))
  .sort((a, b) => String(b[1]).localeCompare(String(a[1])))[0]?.[0]?.startsWith('horror:remake:') || false;
