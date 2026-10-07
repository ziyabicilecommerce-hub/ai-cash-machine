// Welches Video gehört auf welches Konto? Jedes Fakten-Video zeigt den Namen "seines" Kontos (oben links und auf der
// Endkarte). Die ersten Videos gehören den TikTok-Konten, die weiteren den übrigen Kanälen; die Zuordnung dreht
// sich täglich weiter, damit nicht immer dasselbe Konto dasselbe Format bekommt.
export const kontoFuer = (i, tag, tiktok, weitere, standard = '@futureflowxx') =>
  (i < tiktok.length ? tiktok[(i + tag) % tiktok.length] : weitere[(i - tiktok.length + tag) % weitere.length]) || standard;

const norm = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();

// Buffer-Kanäle ({id, name}) den Videos zuordnen: Video mit konto "@name" -> Kanal "name". Pro Kanal ein Video;
// Videos ohne passendes Konto bekommen einen noch freien Kanal.
export function zuordnen(videos, kanaele) {
  const frei = [...kanaele];
  const plan = [];
  const rest = [];
  for (const v of videos) {
    const i = frei.findIndex((k) => norm(k.name) === norm(v.konto));
    if (i >= 0) plan.push({ video: v, kanal: frei.splice(i, 1)[0] });
    else rest.push(v);
  }
  for (const v of rest) if (frei.length) plan.push({ video: v, kanal: frei.shift() });
  return plan;
}

// TikTok-Taktik "eine Nische pro Konto": der Algorithmus zeigt ein Konto eher weiter, wenn es immer dasselbe Thema hat.
// Format: '@konto=Kat1|Kat2;@konto2=Kat3'. Konten ohne Eintrag bekommen alle Themen.
export const STANDARD_NISCHEN = '@zyx_7851=Weltall|Geld;@futureflowxx=Körper|Essen;@futureflowx3=Natur|Tiere';
export function nischenAus(text = STANDARD_NISCHEN) {
  const m = {};
  for (const teil of String(text).split(';')) {
    const [konto, kats] = teil.split('=');
    if (konto && kats) m[norm(konto)] = kats.split('|').map((k) => k.trim()).filter(Boolean);
  }
  return m;
}
export const nischeFuer = (konto, nischen) => nischen[norm(konto)] || [];
