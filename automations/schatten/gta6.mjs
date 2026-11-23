// GTA-6-Kanal (17.11.) auf @futureflowx3. Nutzer: "keine Mythen oder Wahrheiten, sondern Clips - so Trailer-Videos, wie es
// aussieht, mit Musik". Deshalb: Fan-Trailer ohne Stimme - schnelle Schnitte aus eigenen KI-Bildern (Neon-Küstenstadt,
// Highway, Sümpfe, Inseln), Kamerafahrten, Kino-Balken, Blitz-Schnitte, große Titelkarten und ein selbst erzeugter
// Trap-Beat (videoExtras.mjs, synthetisch - keine Lizenzfragen). KEIN Material von Rockstar (keine Trailer, Logos,
// Musik, Figuren). Caption sagt klar: Fan-Trailer, KI-generiert, kein echtes Spielmaterial.
//   node gta6.mjs --liste | --bauen <slug> <ordner> | --posten <gta6.json> <url> <kanal>
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const W = 720, H = 1280, FPS = 30;
const LOOK = 'cinematic film still, photorealistic, anamorphic, dramatic lighting, vibrant teal and magenta, no text, no logos, no watermark';
const SCHRIFT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

// Jeder Trailer: zwei Titelkarten (groß, zwischen den Schnitten) und sechs Bild-Motive. Am Ende immer Datum + Frage.
export const TRAILER = [
  { slug: 'gta6-trailer-vice-city-nacht', titel: 'Vice City bei Nacht', karten: ['VICE CITY', 'BEI NACHT'],
    motive: ['neon coastal city skyline at night from the ocean, palm trees', 'sports car drifting on a wet neon street at night', 'art deco hotel with pink neon at night',
      'crowded nightclub entrance with neon lights, silhouettes', 'aerial view of a glowing city at night, highways', 'motorbike speeding through a neon tunnel'],
    frage: 'Welche Szene war die beste?', wahl: ['Auto', 'Club'] },
  { slug: 'gta6-trailer-highway-jagd', titel: 'Die Jagd', karten: ['LEONIDA', 'KEIN ENTKOMMEN'],
    motive: ['police helicopter spotlight on a highway at night', 'muscle car chased by police cars on a bridge at sunset', 'police lights reflecting on wet asphalt',
      'car jumping over a drawbridge at sunset', 'roadblock with police cars at night, smoke', 'getaway car on an empty desert highway at dawn'],
    frage: 'Abhauen oder aufgeben?', wahl: ['Abhauen', 'Aufgeben'] },
  { slug: 'gta6-trailer-das-paar', titel: 'Das Paar', karten: ['ZU ZWEIT', 'GEGEN ALLE'],
    motive: ['silhouettes of a man and a woman walking away from an explosion at night', 'couple silhouettes in a convertible on a coastal road at sunset',
      'two masked silhouettes in front of a convenience store at night, neon', 'couple silhouettes on a motel balcony with neon sign glow',
      'two silhouettes counting money in a dark car', 'man and woman silhouettes on a rooftop overlooking a neon city'],
    frage: 'Wen spielst du lieber?', wahl: ['Ihn', 'Sie'] },
  { slug: 'gta6-trailer-suempfe', titel: 'Die Sümpfe', karten: ['DIE SÜMPFE', 'GEFÄHRLICH'],
    motive: ['airboat racing through a swamp at sunset', 'alligator in murky green water close up', 'abandoned shack in a foggy swamp',
      'pickup truck on a muddy swamp road', 'flamingos over a swamp at golden hour', 'storm clouds over everglades style wetlands'],
    frage: 'Würdest du da reinfahren?', wahl: ['Ja', 'Niemals'] },
  { slug: 'gta6-trailer-inseln', titel: 'Die Inseln', karten: ['DIE KEYS', 'PARADIES'],
    motive: ['turquoise ocean with small tropical islands from above', 'speedboat jumping waves near a long bridge over the sea', 'beach bar at sunset with palm trees',
      'yacht party at night with lights on the water', 'long overseas highway bridge at sunset', 'lighthouse on a tiny island at dusk'],
    frage: 'Boot oder Auto?', wahl: ['Boot', 'Auto'] },
  { slug: 'gta6-trailer-luxus', titel: 'Das große Geld', karten: ['GROSSES GELD', 'GROSSE GEFAHR'],
    motive: ['mansion with infinity pool overlooking the ocean at night', 'row of luxury sports cars in a neon garage', 'private jet on a runway at sunset',
      'penthouse party with city lights behind', 'bag full of money on a car seat, dramatic light', 'helicopter landing on a skyscraper roof at night'],
    frage: 'Was kaufst du zuerst?', wahl: ['Villa', 'Auto'] },
  { slug: 'gta6-trailer-strand', titel: 'Der Strand', karten: ['OCEAN DRIVE', 'SOMMER'],
    motive: ['busy beach boulevard with classic cars and palm trees, sunny', 'jet ski on a bright blue ocean near a beach', 'colorful lifeguard tower at sunrise',
      'skater on a beach promenade at golden hour', 'beach volleyball silhouettes at sunset', 'sunset over the ocean with a city skyline behind'],
    frage: 'Tag oder Nacht?', wahl: ['Tag', 'Nacht'] },
  { slug: 'gta6-trailer-sturm', titel: 'Der Sturm', karten: ['HURRIKAN', 'ÜBER DER STADT'],
    motive: ['hurricane storm clouds over a coastal city', 'palm trees bending in a violent storm at night', 'flooded neon street with a car driving through water',
      'lightning over a skyscraper skyline', 'boats tossed in a stormy harbor', 'empty storm-damaged boulevard at dawn'],
    frage: 'Wäre ein Sturm im Spiel geil?', wahl: ['Ja', 'Nein'] },
];

export function tageBis(jetzt = Date.now()) {
  return Math.ceil((Date.parse('2026-11-19T00:00:00+01:00') - jetzt) / 864e5);
}
export const datumKarte = (jetzt = Date.now()) => (tageBis(jetzt) > 0 ? ['19.11.2026', tageBis(jetzt) === 1 ? 'MORGEN' : `NOCH ${tageBis(jetzt)} TAGE`] : ['GTA 6', 'IST DA']);

const TAGS = '#gta6 #gtavi #vicecity #gaming #trailer';
export function caption(t) {
  return `So könnte GTA 6 aussehen 🔥 ${t.frage} 1️⃣ ${t.wahl[0]} oder 2️⃣ ${t.wahl[1]}? 👇\n\n${TAGS}\n(Fan-Trailer: KI-generierte Bilder, kein echtes Spielmaterial, nicht von Rockstar.)`.slice(0, 2200);
}

// Ablauf: Karte 1 -> 3 Schnitte -> Karte 2 -> 3 Schnitte -> Datum -> Frage. Längen auf den Trap-Takt (0,857 s).
export function plan(t, jetzt = Date.now()) {
  const T = 0.857, d = datumKarte(jetzt);
  const shot = (i) => ({ art: 'bild', motiv: t.motive[i], dauer: T * 2 });
  return [
    { art: 'karte', text: t.karten[0], dauer: T * 2 }, shot(0), shot(1), shot(2),
    { art: 'karte', text: t.karten[1], dauer: T }, shot(3), shot(4), shot(5),
    { art: 'karte', text: d[0], unter: d[1], dauer: T * 3 },
    { art: 'karte', text: t.frage.toUpperCase(), unter: `1 = ${t.wahl[0].toUpperCase()}   2 = ${t.wahl[1].toUpperCase()}`, dauer: T * 3, klein: true },
  ];
}

const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'pipe', timeout: 300000 });
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019').replace(/%/g, '\\%');

function karteRendern(k, ziel, i) {
  // Lange Fragen auf zwei Zeilen; jede Zeile eigenes drawtext (ein "\n" im Text zeigt ffmpeg als Kästchen) und
  // Schriftgröße so, dass die längste Zeile in 640 px passt
  const woerter = k.text.split(' ');
  const mitte = Math.ceil(woerter.length / 2);
  const zeilen = k.klein && k.text.length > 14 ? [woerter.slice(0, mitte).join(' '), woerter.slice(mitte).join(' ')] : [k.text];
  const fs = Math.min(k.klein ? 64 : 104, Math.floor(640 / (Math.max(...zeilen.map((z) => z.length)) * 0.68)));
  const y0 = H / 2 - (zeilen.length * (fs + 14)) / 2;
  const texte = zeilen.map((z, n) => `drawtext=fontfile=${SCHRIFT}:text='${esc(z)}':fontsize=${fs}:fontcolor=white:x=(w-tw)/2:y=${Math.round(y0 + n * (fs + 14))}:` +
    `shadowcolor=0xFF2D95:shadowx=${i % 2 ? 5 : -5}:shadowy=0:alpha='min(1,t*4)'`).join(',');
  const yu = Math.round(y0 + zeilen.length * (fs + 14) + 40);
  const unter = k.unter ? `,drawtext=fontfile=${SCHRIFT}:text='${esc(k.unter)}':fontsize=40:fontcolor=0x00E5FF:x=(w-tw)/2:y=${yu}:alpha='min(1,t*3)'` : '';
  ff(['-f', 'lavfi', '-i', `color=c=0x07020c:s=${W}x${H}:r=${FPS}:d=${k.dauer.toFixed(3)}`,
    '-vf', `${texte}${unter},noise=alls=12:allf=t,vignette=PI/4`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ziel]);
}

function bildRendern(bild, k, ziel, i) {
  const n = Math.round(k.dauer * FPS);
  const bewegung = [
    `z='min(1.0+0.004*on,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    `z='1.2':x='(iw-iw/zoom)*on/${n}':y='ih/2-(ih/zoom/2)'`,
    `z='max(1.3-0.004*on,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    `z='1.2':x='(iw-iw/zoom)*(1-on/${n})':y='(ih-ih/zoom)*on/${n}'`,
  ][i % 4];
  ff(['-loop', '1', '-i', bild, '-vf',
    `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=${bewegung}:d=${n}:s=${W}x${H}:fps=${FPS},` +
    `eq=contrast=1.12:saturation=1.3,colorbalance=rs=0.08:bs=0.1:rh=0.06,noise=alls=8:allf=t,vignette=PI/5,` +
    `drawbox=x=0:y=0:w=iw:h=150:color=black:t=fill,drawbox=x=0:y=ih-150:w=iw:h=150:color=black:t=fill,` +
    `fade=t=in:st=0:d=0.08:color=white`, '-frames:v', String(n), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ziel]);
}

export async function bauen(t, ordnerRoh, jetzt = Date.now()) {
  const ordner = resolve(ordnerRoh);  // concat-Liste braucht absolute Pfade (relative gelten ab dem Listen-Ordner)
  mkdirSync(ordner, { recursive: true });
  const { ladeBild } = await import('../lib/videoFabrik.mjs');
  const { musikUnterlegen } = await import('../lib/videoExtras.mjs');
  const teile = [], schnitte = [], karten = [], gute = [];
  let zeit = 0;
  for (const [i, k] of plan(t, jetzt).entries()) {
    const ziel = join(ordner, `t${i}.mp4`);
    if (k.art === 'karte') { karteRendern(k, ziel, i); karten.push(zeit); } else {
      const bild = join(ordner, `b${i}.jpg`);
      let ok = process.env.GTA6_OFFLINE ? false : await ladeBild(`${k.motiv}, ${LOOK}`, bild, { breite: W, hoehe: H, seed: 1000 + i * 7 + t.slug.length });
      if (!ok && !process.env.GTA6_OFFLINE) {  // zweiter Anlauf mit anderem Seed, nach kurzer Pause (Bilddienst drosselt)
        await new Promise((r) => setTimeout(r, 15000));
        ok = await ladeBild(`${k.motiv}, ${LOOK}`, bild, { breite: W, hoehe: H, seed: 5000 + i * 13 });
      }
      if (ok) gute.push(bild);
      else if (gute.length) copyFileSync(gute[i % gute.length], bild);  // lieber ein schon geladenes Bild mit anderer Fahrt
      else ff(['-f', 'lavfi', '-i', `gradients=s=${W}x${H}:c0=0xff2d95:c1=0x00e5ff:d=1`, '-frames:v', '1', bild]);  // Notbild
      if (!process.env.GTA6_OFFLINE) await new Promise((r) => setTimeout(r, 3000));
      bildRendern(bild, k, ziel, i);
    }
    teile.push(ziel); schnitte.push(zeit); zeit += k.dauer;
  }
  const liste = join(ordner, 'liste.txt');
  writeFileSync(liste, teile.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const roh = join(ordner, 'roh.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', liste, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', roh]);
  await musikUnterlegen(roh, zeit, { stimmung: 'beat', stil: 'trap', lautstaerke: 0.9, whoosh: schnitte.slice(1), boom: karten.slice(0, 3), riser: [karten[2]].filter(Boolean) });
  return { pfad: roh, dauer: zeit };
}

async function main() {
  const [modus, a, b, c] = process.argv.slice(2);
  if (modus === '--liste') { console.log(TRAILER.map((x) => x.slug).join('\n')); return; }
  if (modus === '--bauen') {
    const t = TRAILER.find((x) => x.slug === a);
    if (!t) throw new Error(`unbekannt: ${a}`);
    const v = await bauen(t, join(b, 'bau'));
    execFileSync('cp', [v.pfad, join(b, 'video.mp4')]);
    writeFileSync(join(b, 'gta6.json'), JSON.stringify({ slug: t.slug, titel: `GTA 6 Fan-Trailer: ${t.titel}`, caption: caption(t) }, null, 2));
    console.log(`[gta6] fertig: ${t.slug} (${v.dauer.toFixed(1)} s)`);
    return;
  }
  if (modus === '--posten') {
    const token = process.env.BUFFER_ACCESS_TOKEN;
    if (!token) { console.log('[gta6] BUFFER_ACCESS_TOKEN fehlt - nicht gepostet.'); process.exit(2); }
    if (!existsSync(a) || !/^https:\/\//.test(b || '') || !/^[a-f\d]{24}$/.test(c || '')) throw new Error('Aufruf: --posten <gta6.json> <https-url> <kanal>');
    const f = JSON.parse(readFileSync(a, 'utf8'));
    const { API, POST_MUTATION, postInput } = await import('../lib/bufferPoster.mjs');
    const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: POST_MUTATION, variables: { input: postInput(c, f.caption, b, { titel: f.titel.slice(0, 90) }) } }) });
    const d = await res.json().catch(() => ({}));
    const r = d?.data?.createPost;
    if (!res.ok || !r?.post?.id || d.errors) { console.log('[gta6] Posten fehlgeschlagen:', res.status, r?.message || JSON.stringify(d.errors || d).slice(0, 300)); process.exit(1); }
    console.log('[gta6] gepostet:', f.titel, r.post?.id, r.post?.status);
    return;
  }
  throw new Error('Aufruf: --liste | --bauen <slug> <ordner> | --posten <gta6.json> <url> <kanal>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
