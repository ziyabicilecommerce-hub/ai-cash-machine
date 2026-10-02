// Anwendungs-Szene: eine Person benutzt das Produkt - erzeugt aus dem ECHTEN Produktfoto als Vorlage
// (Bild-Bearbeitungsmodell), damit im Video wirklich das Produkt aus dem Shop zu sehen ist.
// Klappt keins der Modelle, bleibt die Szene beim normalen Produktfoto. Im Video steht klein
// "KI-Beispiel", damit niemand die Szene fuer ein echtes Kundenfoto haelt.
import { writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { freistellen } from './premium.mjs';
import { bildURL } from './pollinationsMedia.mjs';

// Kostenloser Pollinations-Schluessel (enter.pollinations.ai) - wird mitgeschickt, wenn eingetragen.
const auth = () => (process.env.POLLINATIONS_TOKEN ? { Authorization: `Bearer ${process.env.POLLINATIONS_TOKEN.trim()}` } : {});

const BASIS = 'https://image.pollinations.ai/prompt';
// Reihenfolge = Vorliebe. Ueber VIDEO_ANWENDUNG_MODELLE aenderbar; VIDEO_ANWENDUNG=0 schaltet ab.
const MODELLE = (process.env.VIDEO_ANWENDUNG_MODELLE || 'kontext,gptimage,nanobanana,seedream').split(',').map((m) => m.trim()).filter(Boolean);
export const anwendungAn = () => !/^(0|nein|aus|false)$/i.test(String(process.env.VIDEO_ANWENDUNG || '').trim());

export const ANWENDUNG_REGEL =
  'Zeige in GENAU einer Szene (Index 2 oder 3, nicht die erste, nicht die letzte) ein Anwendungs-Beispiel: eine Person benutzt das Produkt ' +
  'so, wie es gedacht ist. Dafuer "anwendung": {"szene": Index, "foto": Index des Produktfotos, das am besten zeigt, wie das Produkt aussieht, ' +
  '"prompt": englischer Prompt: realistic smartphone photo, one adult person using this exact product in a typical everyday situation, fully clothed, natural light, product clearly visible}. ' +
  'Dazu "schritte": 3 englische Prompts fuer dieselbe Person im selben Setting - Start, Mitte und Ende der Bewegung mit dem Produkt (z. B. Band einhaengen, hochziehen, oben halten). ' +
  'Der gesprochene Satz dieser Szene beschreibt, was die Person gerade macht. ';

// Haengt die Anwendung an die passende Szene. d = KI-Antwort {szene, foto, prompt}, fotos = Produktfoto-URLs.
export function anwendungEinbauen(skript, d, fotos) {
  const n = skript.szenen.length;
  const prompt = String(d?.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!anwendungAn() || n < 4 || prompt.length < 15 || !fotos.length) return skript;
  const k = Math.min(Math.max(Number.isInteger(d.szene) ? d.szene : 2, 1), n - 2);
  const ref = fotos[Number.isInteger(d.foto) && d.foto >= 0 && d.foto < fotos.length ? d.foto : 0];
  const schritte = (Array.isArray(d.schritte) ? d.schritte : []).map((x) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 300)).filter((x) => x.length > 10).slice(0, 3);
  skript.szenen[k] = { ...skript.szenen[k], anwendung: { prompt, ref, ...(schritte.length >= 2 ? { schritte } : {}) } };
  return skript;
}

export function anwendungURL(prompt, ref, { breite, hoehe, model, seed }) {
  const params = new URLSearchParams({ model, image: ref, width: String(breite), height: String(hoehe), nologo: 'true', seed: String(seed) });
  return `${BASIS}/${encodeURIComponent(`${prompt}. Keep the product exactly as in the reference image (shape, color, details). Vertical 9:16 photo.`)}?${params}`;
}

// Modelle, die in diesem Lauf schon versagt haben, werden nicht erneut versucht (spart bis zu Minuten je Szene).
export const KAPUTT = new Set();

// Probiert die Modelle der Reihe nach; true, sobald ein echtes Bild (> 20 KB) da ist.
export async function anwendungBild({ prompt, ref }, ziel, { breite, hoehe, seed = Math.floor(Math.random() * 1e9), laden = fetch } = {}) {
  for (const model of MODELLE.filter((m) => !KAPUTT.has(m))) {
    try {
      const res = await laden(anwendungURL(prompt, ref, { breite, hoehe, model, seed }), { headers: auth(), signal: AbortSignal.timeout(90000) });
      const typ = res.headers.get('content-type') || '';
      const daten = res.ok && typ.startsWith('image/') ? Buffer.from(await res.arrayBuffer()) : null;
      if (daten && daten.length > 20000) {
        writeFileSync(ziel, daten);
        console.log(`[video-fabrik] Anwendungs-Szene mit Modell ${model} erzeugt.`);
        return true;
      }
      console.log(`[video-fabrik] Anwendungs-Szene: ${model} lieferte kein Bild (${res.status} ${typ}).`);
      if (res.status >= 400) KAPUTT.add(model);
    } catch (err) {
      console.log(`[video-fabrik] Anwendungs-Szene: ${model} fehlgeschlagen (${String(err.message).slice(0, 80)}).`);
      KAPUTT.add(model);
    }
  }
  // Ersatzweg ohne Bearbeitungs-Modell: KI malt die Szene (freies Modell flux), das ECHTE Produkt wird
  // freigestellt und mit Schatten hineingesetzt - garantiert das richtige Produkt, kostenlos.
  return komponieren({ prompt, ref }, ziel, { breite, hoehe, seed, laden }).catch(() => false);
}

// Szene ohne Produkt-Details: "the exact product from the reference image" -> neutrale Formulierung, unten Platz.
export const szenenPrompt = (prompt) => `${String(prompt).replace(/the exact product from the reference image/gi, 'a small product').replace(/,?\s*product clearly visible/gi, '')}, the product itself is not in focus, plain uncluttered lower third of the image`;

export async function komponieren({ prompt, ref }, ziel, { breite, hoehe, seed = Math.floor(Math.random() * 1e9), laden = fetch, frei = freistellen } = {}) {
  if (!ref) return false;
  const roh = `${ziel}.produkt`, png = `${ziel}.produkt.png`, szene = `${ziel}.szene`;
  const holen = async (url, datei, ms) => {
    const res = await laden(url, { headers: auth(), signal: AbortSignal.timeout(ms) });
    const typ = res.headers.get('content-type') || '';
    if (!res.ok || !typ.startsWith('image/')) return false;
    writeFileSync(datei, Buffer.from(await res.arrayBuffer()));
    return true;
  };
  if (!(await holen(ref, roh, 60000)) || !(await frei(roh, png)) || !existsSync(png)) return false;
  if (!(await holen(bildURL(szenenPrompt(prompt), { width: breite, height: hoehe, seed, model: 'flux' }), szene, 120000))) return false;
  const pw = Math.round(breite * 0.62), ph = Math.round(hoehe * 0.36), unten = Math.round(hoehe * 0.1);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', szene, '-i', png, '-filter_complex',
    `[0:v]scale=${breite}:${hoehe}:force_original_aspect_ratio=increase,crop=${breite}:${hoehe}[bg];` +
    `[1:v]format=rgba,scale=${pw}:${ph}:force_original_aspect_ratio=decrease,split[p][s];` +
    `[s]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.5,boxblur=16:2[sh];` +
    `[bg][sh]overlay=(W-w)/2+16:H-h-${unten}+24[t];[t][p]overlay=(W-w)/2:H-h-${unten}`,
    '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', '-q:v', '2', ziel], { stdio: 'pipe', timeout: 120000 });
  console.log('[video-fabrik] Anwendungs-Szene komponiert: KI-Szene + echtes Produkt (freigestellt).');
  return true;
}

// Ohne/Mit im geteilten Bild: links dieselbe Situation ohne Produkt, rechts mit dem echten Produkt.
// Bewusst "OHNE" / "MIT" statt "Vorher/Nachher" - es wird kein Ergebnis versprochen, nur gezeigt,
// wie das Produkt benutzt wird. Ebenfalls als KI-Beispiel gekennzeichnet.
export const VERGLEICH_REGEL =
  'Die Problem-Szene (Index 1) wird ein Ohne/Mit-Vergleich im geteilten Bild: "vergleich": {"szene": 1, ' +
  '"ohne": englischer Prompt: realistic smartphone photo, one adult person in the typical problem situation WITHOUT the product, fully clothed, ' +
  '"mit": englischer Prompt: the same kind of person in the same setting now using this exact product, fully clothed, product clearly visible}. ' +
  'Keine uebertriebenen Ergebnisse, keine Heilversprechen. ';

export function vergleichEinbauen(skript, d, fotos) {
  const n = skript.szenen.length;
  const [ohne, mit] = [d?.ohne, d?.mit].map((x) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 400));
  if (!anwendungAn() || n < 4 || ohne.length < 15 || mit.length < 15 || !fotos.length) return skript;
  const k = Math.min(Math.max(Number.isInteger(d.szene) ? d.szene : 1, 1), n - 2);
  const { anwendung, ...rest } = skript.szenen[k];
  skript.szenen[k] = { ...rest, vergleich: { ohne, mit, ref: anwendung?.ref || fotos[0] } };
  // Liegt die Anwendungs-Szene auf derselben Szene, rueckt sie eine weiter (nie auf die letzte).
  if (anwendung && k + 1 < n - 1 && !skript.szenen[k + 1].anwendung) skript.szenen[k + 1] = { ...skript.szenen[k + 1], anwendung };
  return skript;
}

// Demo-Sequenz: die Schritte der Bewegung (alle aus dem echten Produktfoto als Vorlage, gleicher Seed
// fuer dieselbe Person). Mindestens 2 muessen klappen, sonst nimmt die Szene das einzelne Anwendungsbild.
export async function demoBilder({ schritte, ref }, roh, { breite, hoehe, laden = fetch } = {}) {
  const seed = Math.floor(Math.random() * 1e9);
  // Alle Schritte gleichzeitig laden (statt nacheinander) - Reihenfolge bleibt erhalten.
  const ok = await Promise.all(schritte.map((prompt, k) => anwendungBild({ prompt, ref }, `${roh}.d${k}`, { breite, hoehe, seed, laden }).catch(() => false)));
  const bilder = schritte.map((_, k) => `${roh}.d${k}`).filter((_, k) => ok[k]);
  if (bilder.length < 2) return [];
  copyFileSync(bilder[0], roh);
  return bilder;
}

// Baut aus den Schritten ein Hintergrund-Video: je Schritt ein harter Schnitt mit weissem Blitz,
// Zoom-Punch rein und einer grossen Nummer 1-2-3 - wie ein schnelles "So geht's"-Tutorial.
export function demoVideoBauen(bilder, ziel, dauer, { breite, hoehe, schrift }) {
  const seg = Math.max(0.6, dauer / bilder.length);
  const frames = Math.ceil(seg * 30);
  const [bw, bh] = [Math.round(breite * 1.2 / 2) * 2, Math.round(hoehe * 1.2 / 2) * 2];
  const teile = bilder.map((_, i) => `[${i}:v]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},setsar=1,` +
    `zoompan=z='1.22-0.2*min(1,on/7)+0.0012*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=${breite}x${hoehe}:fps=30,` +
    `fade=in:st=0:d=0.12:color=white,drawtext=fontfile=${schrift}:text='${i + 1}':fontsize=${Math.round(hoehe * 0.15)}:fontcolor=white:borderw=${Math.round(hoehe * 0.006)}:bordercolor=black:` +
    `x=${Math.round(breite * 0.07)}:y=${Math.round(hoehe * 0.07)}:alpha='min(1,t/0.08)'[v${i}]`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...bilder.flatMap((b) => ['-i', b]), '-filter_complex',
    `${teile.join(';')};${bilder.map((_, i) => `[v${i}]`).join('')}concat=n=${bilder.length}:v=1:a=0,format=yuv420p[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', '30', ziel], { stdio: 'pipe', timeout: 300000 });
  return ziel;
}
