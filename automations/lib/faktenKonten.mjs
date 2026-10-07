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
