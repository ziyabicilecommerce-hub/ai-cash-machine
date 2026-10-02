// Anime-Produktvideos: aus dem Video-Bot werden auch Anime-Clips - dasselbe ehrliche Skript, aber Kulisse,
// KI-Beispiel-Szene (Figur benutzt das ECHTE Produkt, Foto als Vorlage) und Ohne/Mit im Anime-Stil.
// Anteil per VIDEO_ANIME_ANTEIL (0-1, Standard 0.25 = etwa jedes 4. Produktvideo, taeglich wechselnd).
// Nur eigene, originale Figuren - keine bekannten Anime-Figuren oder Namen.
const ANIME = 'anime style illustration, Japanese anime, clean line art, vibrant colors, original character (no existing anime character)';
const umstellen = (prompt) => `${ANIME}, ${String(prompt || '').replace(/realistic smartphone photo,?\s*/i, '').replace(/\bphoto\b/gi, 'illustration')}`;

export function animeAnteil() {
  const n = Number(process.env.VIDEO_ANIME_ANTEIL);
  return Number.isFinite(n) && process.env.VIDEO_ANIME_ANTEIL !== '' && process.env.VIDEO_ANIME_ANTEIL !== undefined ? Math.min(Math.max(n, 0), 1) : 0.25;
}

// Deterministisch je Produkt und Tag (gleiches Produkt an verschiedenen Tagen mal real, mal Anime).
export function animeHeute(p, { tag = Math.floor(Date.now() / 864e5), anteil = animeAnteil() } = {}) {
  if (anteil <= 0) return false;
  const h = [...String(p?.handle || p?.title || '')].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 9973, 0);
  return ((h + tag) % 100) < anteil * 100;
}

export function animeStil(s) {
  const k = structuredClone(s);
  if (k.hintergrund?.prompt) k.hintergrund.prompt = `${ANIME}, empty background scene, ${k.hintergrund.prompt}`;
  for (const sz of k.szenen || []) {
    if (sz.bild) sz.bild = umstellen(sz.bild);
    if (sz.anwendung) {
      sz.anwendung.prompt = umstellen(sz.anwendung.prompt);
      if (sz.anwendung.schritte) sz.anwendung.schritte = sz.anwendung.schritte.map(umstellen);
    }
    if (sz.vergleich) { sz.vergleich.ohne = umstellen(sz.vergleich.ohne); sz.vergleich.mit = umstellen(sz.vergleich.mit); }
  }
  if (k.caption && !/#anime\b/i.test(k.caption)) k.caption = k.caption.replace(/(\n\n👉|$)/, ' #anime$1');
  return { ...k, stilName: 'anime' };
}
