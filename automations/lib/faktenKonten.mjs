// Welches Video gehört auf welches Konto? Jedes Fakten-Video zeigt den Namen "seines" Kontos (oben links und auf der
// Endkarte). Die ersten Videos gehören den TikTok-Konten, die weiteren den übrigen Kanälen; die Zuordnung dreht
// sich täglich weiter, damit nicht immer dasselbe Konto dasselbe Format bekommt.
export const kontoFuer = (i, tag, tiktok, weitere, standard = '@futureflowxx') =>
  (i < tiktok.length ? tiktok[(i + tag) % tiktok.length] : weitere[(i - tiktok.length + tag) % weitere.length]) || standard;

const norm = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();

// Buffer-Kanäle ({id, name}) den Videos zuordnen: Video mit konto "@name" -> Kanal "name". Pro Kanal ein Video.
// Videos ohne passendes Konto bleiben liegen (streng) - sonst landeten Fakten-Videos auf dem Anime-Konto.
export function zuordnen(videos, kanaele, { streng = true } = {}) {
  const frei = [...kanaele];
  const plan = [];
  const rest = [];
  for (const v of videos) {
    const i = frei.findIndex((k) => norm(k.name) === norm(v.konto));
    if (i >= 0) plan.push({ video: v, kanal: frei.splice(i, 1)[0] });
    else rest.push(v);
  }
  if (!streng) for (const v of rest) if (frei.length) plan.push({ video: v, kanal: frei.shift() });
  return plan;
}

// @zyx_7851 ist der Weltall-Kanal mit echten NASA-Aufnahmen.
// TikTok-Taktik "eine Nische pro Konto": der Algorithmus zeigt ein Konto eher weiter, wenn es immer dasselbe Thema hat.
// Format: '@konto=Kat1|Kat2;@konto2=Kat3'. Konten ohne Eintrag bekommen alle Themen.
export const STANDARD_NISCHEN = '@zyx_7851=Weltall;@futureflowxx=Körper|Essen;@futureflowx3=Natur|Tiere';
export function nischenAus(text = STANDARD_NISCHEN) {
  const m = {};
  for (const teil of String(text).split(';')) {
    const [konto, kats] = teil.split('=');
    if (konto && kats) m[norm(konto)] = kats.split('|').map((k) => k.trim()).filter(Boolean);
  }
  return m;
}
export const nischeFuer = (konto, nischen) => nischen[norm(konto)] || [];

// TikTok-Taktik "Serie": jedes Konto zählt seine eigene Reihe hoch ("WELTALL-QUIZ #7") - Serien holen Follower,
// weil Zuschauer den nächsten Teil nicht verpassen wollen.
const SERIE = { weltall: 'WELTALL', geld: 'GELD', 'körper': 'KÖRPER', essen: 'ESSEN', natur: 'NATUR', tiere: 'TIER' };
export function serienHook(kat, typ, teil) {
  const name = SERIE[String(kat || '').toLowerCase()] || 'FAKTEN';
  return typ === 'mythos' ? `${name} #${teil}: Mythos oder Wahrheit?` : `${name}-QUIZ #${teil}: Schaffst du's?`;
}

// TikTok-Taktik "Tages-Streak": "Tag 12 von 100" - Zuschauer verfolgen, ob die Serie hält.
export const streakTag = (jetzt = Date.now(), start = '2026-10-07') => Math.max(1, Math.floor((jetzt - Date.parse(start)) / 86400000) + 1);

// TikTok-Taktik "Konten verweisen aufeinander": jedes Video nennt ein anderes eigenes Konto mit dessen Thema.
export function querverweis(konto, tiktok, nischen, tag) {
  const andere = tiktok.filter((k) => norm(k) !== norm(konto));
  if (!andere.length) return '';
  const ziel = andere[tag % andere.length];
  const thema = (nischen[norm(ziel)] || [])[0];
  return thema ? `Mehr ${thema}-Fakten: ${ziel}` : `Mehr Fakten: ${ziel}`;
}
