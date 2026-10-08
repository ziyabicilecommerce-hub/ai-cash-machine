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

// Archive suchen auch in Beschreibungen - "honey" fand ein Kochvideo, "lightning bolt" ein Flugzeug "Thunderbolt".
// Deshalb muss ein Hauptwort des Motivs als ganzes Wort im Titel stehen.
const EIGENSCHAFT = new Set(['golden', 'bright', 'dark', 'colorful', 'fresh', 'ancient', 'old', 'modern', 'tall', 'deep', 'vast', 'giant', 'tiny', 'huge', 'red', 'blue', 'green', 'orange', 'white', 'black', 'purple', 'shiny', 'clear', 'still', 'rough', 'striking', 'swimming', 'walking', 'flying', 'dripping', 'rising', 'floating', 'growing', 'sparkling', 'snowy', 'cloudy', 'stormy', 'rocky', 'sunny']);
export const hauptwoerter = (prompt) => kernwoerter(prompt, 5).split(' ').filter((w) => w.length >= 4 && !EIGENSCHAFT.has(w.toLowerCase()));
export function titelPasst(titel, prompt) {
  const t = String(titel || '').toLowerCase().replace(/[_\-.]/g, ' ');
  return hauptwoerter(prompt).some((w) => new RegExp(`\\b${w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')}(s|es)?\\b`, 'u').test(t));
}

// Shop-Videos: keine Clips mit Menschen - ein fremder Mensch neben dem Produkt wirkte wie ein (falscher) Kunde.
const MENSCHEN = /\b(man|men|woman|women|person|persons|people|girl|girls|boy|boys|child|children|kid|kids|family|families|patient|doctor|nurse|portrait|selfie|interview|crowd|actor|actress|dancer|wedding|couple|baby|babies|mother|father|student|students|worker|workers|athlete|player|lady|guy|teen|teenager|face|faces|hands?|frau|mann|menschen|kind|kinder)\b/i;
export const mitMenschen = (text) => MENSCHEN.test(String(text || '').replace(/[_\-.]/g, ' '));

// Wikimedia Commons: nur gemeinfreie/CC0-Videos, bevorzugt eine 480-1080p-Fassung, Titel muss zum Motiv passen.
export function commonsAuswaehlen(antwort, benutzt = new Set(), prompt = '', ohneMenschen = false) {
  const seiten = Object.values(antwort?.query?.pages || {});
  for (const s of seiten) {
    const v = s.videoinfo?.[0];
    if (!v || benutzt.has(s.title) || (prompt && !titelPasst(s.title, prompt)) || (ohneMenschen && mitMenschen(s.title))) continue;
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

async function commonsSuchen(q, benutzt, prompt, ohneMenschen) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch=${encodeURIComponent(`filetype:video ${q}`)}&prop=videoinfo&viprop=url|size|mime|derivatives|extmetadata&viextmetadatafilter=LicenseShortName`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  return commonsAuswaehlen(await res.json(), benutzt, prompt, ohneMenschen);
}

async function nasaSuchen(q, benutzt, prompt, ohneMenschen) {
  const res = await fetch(`https://images-api.nasa.gov/search?media_type=video&q=${encodeURIComponent(q)}`, { headers: UA });
  if (!res.ok) throw new Error(`NASA ${res.status}`);
  for (const item of ((await res.json())?.collection?.items || []).slice(0, 6)) {
    const id = item.data?.[0]?.nasa_id;
    if (!id || benutzt.has(id) || !/^https:\/\//.test(item.href || '') || !titelPasst(item.data?.[0]?.title, prompt) || (ohneMenschen && mitMenschen(`${item.data?.[0]?.title} ${item.data?.[0]?.description || ''}`))) continue;
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
export function clipAuswaehlen(antwort, benutzt = new Set(), ohneMenschen = false) {
  for (const v of antwort?.videos || []) {
    if (benutzt.has(v.id) || (v.duration || 0) < 4 || (ohneMenschen && mitMenschen(v.url))) continue;
    const dateien = (v.video_files || [])
      .filter((f) => /^https:\/\//.test(f.link || '') && f.file_type === 'video/mp4' && f.height > f.width && f.height >= 1280)
      .sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
    if (dateien[0]) return { id: v.id, link: dateien[0].link, dauer: v.duration };
  }
  return null;
}

async function pexelsSuchen(q, schluessel, benutzt, ohneMenschen) {
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=8`, { headers: { authorization: schluessel } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  return clipAuswaehlen(await res.json(), benutzt, ohneMenschen);
}

// Sucht der Reihe nach: Pexels (nur mit Schlüssel), NASA (nur Weltall), Wikimedia Commons (3, dann 2 Kernwörter).
export async function stockHolen(prompt, ziel, { schluessel = process.env.PEXELS_API_KEY, benutzt = new Set(), weltall = false, ohneMenschen = false, quellen = ['pexels', 'nasa', 'commons'] } = {}) {
  const lang = suchbegriff(prompt);
  if (!lang) return '';
  const versuche = [];
  if (quellen.includes('pexels') && schluessel) versuche.push(['Pexels', () => pexelsSuchen(lang, schluessel, benutzt, ohneMenschen)]);
  if (quellen.includes('nasa') && weltall) versuche.push(['NASA', () => nasaSuchen(kernwoerter(prompt, 2), benutzt, prompt, ohneMenschen)]);
  if (quellen.includes('commons')) {
    // Erst genau (3 Wörter), dann breiter (2 Wörter), zuletzt nur das Hauptwort - der Titel-Filter hält es passend.
    const anfragen = [...new Set([kernwoerter(prompt, 3), kernwoerter(prompt, 2), hauptwoerter(prompt)[0] || ''])].filter(Boolean);
    for (const q of anfragen) versuche.push(['Commons', () => commonsSuchen(q, benutzt, prompt, ohneMenschen)]);
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

// Für alle Szenen eines Videos Clips holen (videoBauen-Option clips). Szenen mit echtem Produktfoto, KI-Beispiel
// oder Ohne/Mit-Vergleich bleiben unangetastet. Gleiches Bild -> gleicher Clip (Endlos-Schleife bleibt).
export async function clipsHolen(szenen, ordner, { weltall = false, ohneMenschen = false } = {}) {
  const benutzt = new Set();
  const gleich = new Map();
  let treffer = 0;
  let moeglich = 0;
  for (const [n, szene] of szenen.entries()) {
    if (szene.video && existsSync(szene.video)) { treffer++; moeglich++; continue; }
    if (!szene.bild || szene.foto || szene.anwendung || szene.vergleich || szene.demo) continue;
    moeglich++;
    if (!gleich.has(szene.bild)) gleich.set(szene.bild, await stockHolen(szene.bild, `${ordner}/clip${n}.mp4`, { benutzt, weltall, ohneMenschen }));
    szene.video = gleich.get(szene.bild);
    if (szene.video) treffer++;
  }
  console.log(`[stock-video] Clips: ${treffer}/${moeglich} Szenen`);
  return treffer;
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
