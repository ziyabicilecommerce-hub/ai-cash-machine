// Echte Video-Clips statt Standbild (Fakten-Kanal): sucht zu jeder Szene einen passenden, frei nutzbaren Clip.
// Ohne jeden Schlüssel: Wikimedia Commons (nur gemeinfrei/CC0 - keine Namensnennung nötig) und für Weltall-Themen
// das NASA-Videoarchiv (gemeinfrei). Optional zuerst Pexels (PEXELS_API_KEY). Ohne Treffer bleibt es beim KI-Bild.
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const UA = { 'user-agent': 'ai-cash-machine/1.0 (https://github.com/ziyabicilecommerce-hub/ai-cash-machine)' };
const FUELL = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'with', 'from', 'and', 'at', 'over', 'into', 'through', 'its', 'their', 'very', 'large', 'big', 'small']);
// Kurzer Suchbegriff (Kernwörter) für Archive, die alle Wörter verlangen.
export const kernwoerter = (prompt, n = 3) => suchbegriff(prompt).split(' ').filter((w) => w && !FUELL.has(w.toLowerCase())).slice(0, n).join(' ');

// Wikimedia Commons: nur gemeinfreie/CC0-Videos, bevorzugt eine 480-1080p-Fassung.
export function commonsAuswaehlen(antwort, benutzt = new Set()) {
  const seiten = Object.values(antwort?.query?.pages || {});
  for (const s of seiten) {
    const v = s.videoinfo?.[0];
    if (!v || benutzt.has(s.title)) continue;
    const lizenz = String(v.extmetadata?.LicenseShortName?.value || '');
    if (!/^(cc0|public domain|pd\b|pd-)/i.test(lizenz)) continue;
    if ((v.duration || 0) < 3 || (v.width || 0) < 480) continue;
    const fassungen = (v.derivatives || []).filter((d) => /^https:\/\//.test(d.src || '') && /video\/(webm|mp4)/.test(d.type || '') && d.height >= 480 && d.height <= 1080)
      .sort((a, b) => b.height - a.height);
    const link = fassungen[0]?.src || ((v.size || 0) < 80e6 && /^https:\/\//.test(v.url || '') ? v.url : '');
    if (link) return { id: s.title, link, dauer: v.duration };
  }
  return null;
}

// NASA-Videoarchiv: Liste der Dateien eines Eintrags -> mittlere MP4-Fassung.
export function nasaDateiAuswaehlen(dateien = []) {
  const mp4 = dateien.filter((u) => /^https?:\/\/.+\.mp4$/i.test(u) && !/~preview/i.test(u));
  return (mp4.find((u) => /~medium\.mp4$/i.test(u)) || mp4.find((u) => /~mobile\.mp4$/i.test(u)) || mp4.find((u) => /~small\.mp4$/i.test(u)) || '').replace(/^http:/, 'https:');
}

async function laden(url, ziel) {
  const dl = await fetch(url, { headers: UA });
  if (!dl.ok || !dl.body) throw new Error(`Download ${dl.status}`);
  await pipeline(Readable.fromWeb(dl.body), createWriteStream(ziel));
  return existsSync(ziel) && statSync(ziel).size > 50000;
}

async function commonsSuchen(q, benutzt) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch=${encodeURIComponent(`filetype:video ${q}`)}&prop=videoinfo&viprop=url|size|mime|derivatives|extmetadata&viextmetadatafilter=LicenseShortName`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  return commonsAuswaehlen(await res.json(), benutzt);
}

async function nasaSuchen(q, benutzt) {
  const res = await fetch(`https://images-api.nasa.gov/search?media_type=video&q=${encodeURIComponent(q)}`, { headers: UA });
  if (!res.ok) throw new Error(`NASA ${res.status}`);
  for (const item of ((await res.json())?.collection?.items || []).slice(0, 6)) {
    const id = item.data?.[0]?.nasa_id;
    if (!id || benutzt.has(id) || !/^https:\/\//.test(item.href || '')) continue;
    const r = await fetch(item.href, { headers: UA });
    if (!r.ok) continue;
    const link = nasaDateiAuswaehlen(await r.json());
    if (link) return { id, link };
  }
  return null;
}

// Stil-Wörter der Bild-Prompts helfen der Stock-Suche nicht - nur das Motiv bleibt.
const STIL = /\b(cinematic|photorealistic|dramatic|light(ing)?|no text|no people|no logos|no real people|close-up|detail|wide|epic|shot|macro|studio|abstract|illustration|concept|visualization|style|4k|8k|hd|soft|warm|glowing|on dark background|dark background|background)\b/gi;
export function suchbegriff(prompt) {
  return String(prompt || '').replace(STIL, ' ').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ');
}

// Bester Clip aus einer Pexels-Antwort: Hochformat, mind. 1280 hoch, mind. 4 s lang, nicht schon benutzt.
export function clipAuswaehlen(antwort, benutzt = new Set()) {
  for (const v of antwort?.videos || []) {
    if (benutzt.has(v.id) || (v.duration || 0) < 4) continue;
    const dateien = (v.video_files || [])
      .filter((f) => /^https:\/\//.test(f.link || '') && f.file_type === 'video/mp4' && f.height > f.width && f.height >= 1280)
      .sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
    if (dateien[0]) return { id: v.id, link: dateien[0].link, dauer: v.duration };
  }
  return null;
}

async function pexelsSuchen(q, schluessel, benutzt) {
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=8`, { headers: { authorization: schluessel } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  return clipAuswaehlen(await res.json(), benutzt);
}

// Sucht der Reihe nach: Pexels (nur mit Schlüssel), NASA (nur Weltall), Wikimedia Commons (3, dann 2 Kernwörter).
export async function stockHolen(prompt, ziel, { schluessel = process.env.PEXELS_API_KEY, benutzt = new Set(), weltall = false, quellen = ['pexels', 'nasa', 'commons'] } = {}) {
  const lang = suchbegriff(prompt);
  if (!lang) return '';
  const versuche = [];
  if (quellen.includes('pexels') && schluessel) versuche.push(['Pexels', () => pexelsSuchen(lang, schluessel, benutzt)]);
  if (quellen.includes('nasa') && weltall) versuche.push(['NASA', () => nasaSuchen(kernwoerter(prompt, 2), benutzt)]);
  if (quellen.includes('commons')) {
    versuche.push(['Commons', () => commonsSuchen(kernwoerter(prompt, 3), benutzt)]);
    if (kernwoerter(prompt, 2) !== kernwoerter(prompt, 3)) versuche.push(['Commons', () => commonsSuchen(kernwoerter(prompt, 2), benutzt)]);
  }
  for (const [quelle, suchen] of versuche) {
    try {
      const clip = await suchen();
      if (clip && (await laden(clip.link, ziel))) {
        benutzt.add(clip.id);
        console.log(`[stock-video] ${quelle}: "${lang}" -> ${String(clip.id).slice(0, 80)}`);
        return ziel;
      }
    } catch (err) {
      console.log(`[stock-video] ${quelle} "${lang}": ${String(err.message).slice(0, 120)}`);
    }
  }
  return '';
}

// Clip auf Hochformat zuschneiden, auf die Szenenlänge bringen (zu kurz -> Schleife), ohne Ton.
export function clipAnpassen(quelle, ziel, dauer, { breite, hoehe }) {
  try {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', quelle, '-t', dauer.toFixed(2), '-an',
      '-vf', `scale=${breite}:${hoehe}:force_original_aspect_ratio=increase,crop=${breite}:${hoehe},fps=30,setsar=1`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', ziel], { stdio: 'pipe', timeout: 300000 });
    return existsSync(ziel) ? ziel : '';
  } catch (err) {
    console.log(`[stock-video] Zuschnitt fehlgeschlagen: ${String(err.stderr || err.message).slice(-160)}`);
    return '';
  }
}
