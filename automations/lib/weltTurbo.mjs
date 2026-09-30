// Welt-Turbo (#96): das Bild eines Skripts wird EINMAL gerendert (Freisteller, Effekte, Kamera),
// danach bekommt jede Sprache nur noch ihre Stimme und Untertitel darueber. Vorher wurde das
// komplette Bild fuer jede der 50 Sprachen neu gerechnet - so sind es ein Bruchteil der Rechenzeit.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sprechen, dauerSekunden, bildHolen, unscharfHintergrund, ladeBild, zusammenfuegen, vorschaubildBauen } from './videoFabrik.mjs';
import { freistellen, hintergrundHolen, ebenenVorbereiten, premiumStandbild, premiumSzene, assAusSrt, themaFuer, preisText, glanzBauen, bokehBauen, STUDIO_STIMME } from './premium.mjs';
import { effekteAn, lichtLeckBauen, qrBauen, uebergangFuer, endkarteAss, funkelnAss, strahlenBauen } from './effekte.mjs';
import { musikUnterlegen, BEAT_STILE } from './videoExtras.mjs';

const ausfuehren = promisify(execFile);
const pfadFuerFilter = (p) => resolve(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

// Fuehrt Aufgaben mit begrenzter Gleichzeitigkeit aus.
async function parallel(aufgaben, n) {
  const ergebnis = new Array(aufgaben.length);
  let naechste = 0;
  await Promise.all(Array.from({ length: Math.min(n, aufgaben.length) }, async () => {
    while (naechste < aufgaben.length) {
      const i = naechste++;
      ergebnis[i] = await aufgaben[i]().catch((err) => ({ fehler: err }));
    }
  }));
  return ergebnis;
}

// fassungen: [{sprache, stimme, skript}] - dasselbe Skript in mehreren Sprachen (gleiche Szenen/Fotos).
// Rueckgabe: [{sprache, v: {pfad, vorschau, kapitel, dauer, szenen}} | {sprache, fehler}]
export async function turboBauen(fassungen, ordner, { stil = '' } = {}) {
  const [breite, hoehe] = [1080, 1920];
  const basis = fassungen[0].skript;
  const n = basis.szenen.length;
  mkdirSync(ordner, { recursive: true });

  // 1) Alle Stimmen (Sprachen x Szenen) - parallel, das ist Netzwerk-Wartezeit.
  const dauern = fassungen.map(() => new Array(n).fill(0));
  const tts = [];
  fassungen.forEach((f, k) => {
    mkdirSync(join(ordner, f.sprache), { recursive: true });
    f.skript.szenen.forEach((sz, i) => tts.push(async () => {
      const mp3 = join(ordner, f.sprache, `s${i}.mp3`);
      await sprechen(sz.text, mp3, join(ordner, f.sprache, `s${i}.srt`), f.stimme, { tempo: '+6%' });
      dauern[k][i] = dauerSekunden(mp3) + 0.3;
    }));
  });
  await parallel(tts, 8);
  // Laengste Fassung je Szene bestimmt die Laenge der Bildspur.
  const laenge = Array.from({ length: n }, (_, i) => Math.max(0, ...dauern.map((d) => d[i])));

  // 2) Bildspur einmal rendern (ohne Ton, ohne Untertitel).
  const hgKi = join(ordner, 'hintergrund.jpg');
  const mitKiHg = await hintergrundHolen(basis.hintergrund, hgKi, { breite, hoehe, laden: ladeBild }).catch(() => false);
  const fx = effekteAn();
  const glanz = glanzBauen(join(ordner, 'glanz.png'), hoehe);
  const bokeh = bokehBauen(join(ordner, 'bokeh.png'), breite, hoehe);
  const leck = fx ? lichtLeckBauen(join(ordner, 'leck.png'), breite, hoehe) : '';
  const qr = fx ? qrBauen(basis.link, join(ordner, 'qr.png')) : '';
  const strahlen = fx ? strahlenBauen(join(ordner, 'strahlen.png'), Math.round(breite * 1.3)) : '';
  const seedZahl = Math.abs(Number(basis.hintergrund?.seed) || 0);
  const untertitelStil = /^(karaoke|box)$/.test(process.env.VIDEO_UNTERTITEL || '') ? process.env.VIDEO_UNTERTITEL : seedZahl % 2 ? 'box' : 'karaoke';
  const sauber = [];
  const hatProdukt = [];
  let ebenen = null;
  for (let i = 0; i < n; i++) {
    if (!laenge[i]) continue;
    try {
      const roh = join(ordner, `r${i}.img`);
      const modus = await bildHolen(basis.szenen[i], roh, { breite, hoehe, stil }).catch(() => '');
      if (modus === 'produkt') {
        const vg = join(ordner, `s${i}.png`);
        const hg = mitKiHg ? hgKi : join(ordner, `s${i}.hg.jpg`);
        if (!mitKiHg) unscharfHintergrund(roh, hg, { breite, hoehe });
        ebenen = ebenenVorbereiten({ hg, vg: (await freistellen(roh, vg).catch(() => false)) ? vg : roh, breite, hoehe, basis: join(ordner, `e${i}`) });
      } else if (modus) ebenen = ebenenVorbereiten({ hg: roh, vg: '', breite, hoehe, basis: join(ordner, `e${i}`) });
      else if (!ebenen) continue;
      if (!sauber.length) premiumStandbild({ ...ebenen, ziel: join(ordner, 'standbild.jpg'), breite, hoehe });
      const letzte = i === n - 1;
      const mitPreis = !!(basis.szenen[i].preis || (letzte && basis.preis));
      const erste = sauber.length === 0;
      // Beat-Pump bleibt hier aus: die Szenenlaenge ist je Sprache anders, der Takt wuerde verrutschen.
      const effekt = fx ? { art: uebergangFuer(sauber.length), leck, qr: letzte ? qr : '', wackeln: erste, drop: erste, strahlen: erste ? strahlen : '', stoss: mitPreis ? 0.38 : null } : null;
      const ziel = join(ordner, `sauber${i}.mp4`);
      await premiumSzene({ ...ebenen, mp3: '', ass: '', ziel, breite, hoehe, dauer: laenge[i], index: i, glanz, bokeh, nah: i % 3 === 2 && !letzte, effekt });
      sauber[i] = ziel;
      hatProdukt[i] = !!ebenen.fgP;
    } catch (err) {
      console.log(`[welt-turbo] Szene ${i + 1} uebersprungen: ${String(err.message).slice(0, 160)}`);
    }
  }
  if (!sauber.some(Boolean)) throw new Error('Keine Bildspur gerendert');

  // 3) Je Sprache: Untertitel + Stimme auf die Bildspur, Musik, fertig.
  const beatStil = BEAT_STILE[seedZahl % BEAT_STILE.length];
  const jeSprache = fassungen.map((f, k) => async () => {
    const dir = join(ordner, f.sprache);
    const szenen = [];
    for (let i = 0; i < n; i++) if (sauber[i] && dauern[k][i]) szenen.push(i);
    if (!szenen.length) throw new Error('keine Szene vertont');
    const gesamt = szenen.reduce((a, i) => a + dauern[k][i], 0);
    const clips = [];
    let zeit = 0;
    let dingZeit = 0;
    const starts = [];
    for (const [j, i] of szenen.entries()) {
      const d = dauern[k][i];
      const letzte = i === n - 1;
      const ass = join(dir, `s${i}.ass`);
      assAusSrt(join(dir, `s${i}.srt`), ass, {
        breite, hoehe, sprache: f.sprache, thema: themaFuer(basis.hintergrund?.seed),
        hook: j === 0 ? f.skript.hook || '' : '',
        preis: f.skript.szenen[i].preis ? preisText(f.skript.szenen[i].preis, f.sprache, f.skript.waehrung) : letzte ? preisText(f.skript.preis, f.sprache, f.skript.waehrung) : '',
        rang: f.skript.szenen[i].rang || 0,
        shop: letzte && !fx ? f.skript.shop || '' : '',
        marke: String(f.skript.shop || '').split('.')[0].toUpperCase(), untertitelStil,
        fortschritt: { von: zeit / gesamt, bis: (zeit + d) / gesamt, dauerMs: d * 1000 },
      });
      const mitPreis = !!(f.skript.szenen[i].preis || (letzte && f.skript.preis));
      if (fx && letzte) endkarteAss(ass, { breite, hoehe, qr: !!qr, shop: f.skript.shop || '', cta: f.skript.cta || 'LINK IN BIO' });
      if (fx && hatProdukt[i]) funkelnAss(ass, { breite, hoehe, dauerMs: d * 1000, seed: seedZahl + i, burst: mitPreis ? { x: Math.round(breite * 0.7), y: Math.round(hoehe * 0.1), ms: 380 } : null });
      if (letzte) dingZeit = zeit + 0.4;
      const clip = join(dir, `c${i}.mp4`);
      await ausfuehren('ffmpeg', [
        '-loglevel', 'error', '-y', '-i', sauber[i], '-i', join(dir, `s${i}.mp3`),
        '-filter_complex', `[0:v]trim=duration=${d.toFixed(2)},setpts=PTS-STARTPTS,ass='${pfadFuerFilter(ass)}'[v]`,
        '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', '-af', STUDIO_STIMME, clip,
      ], { timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
      clips.push(clip);
      starts.push(zeit);
      zeit += dauerSekunden(clip);
    }
    const ziel = join(dir, 'video.mp4');
    zusammenfuegen(clips, ziel, dir);
    try {
      await musikUnterlegen(ziel, zeit, { stimmung: 'beat', stil: beatStil, whoosh: starts.slice(1), ding: dingZeit ? [dingZeit] : [], boom: fx ? [0.05] : [], riser: fx && dingZeit ? [dingZeit - 0.4] : [] });
    } catch (err) {
      console.log(`[welt-turbo] Musik ${f.sprache} fehlgeschlagen: ${String(err.message).slice(0, 120)}`);
    }
    let vorschau = '';
    try {
      vorschau = join(dir, 'vorschau.jpg');
      vorschaubildBauen(join(ordner, 'standbild.jpg'), vorschau, f.skript.hook || f.skript.titel || '', { breite, hoehe });
    } catch { vorschau = ''; }
    return { pfad: ziel, vorschau, kapitel: [], dauer: dauerSekunden(ziel), szenen: clips.length };
  });
  // Zwei Sprachen gleichzeitig - ffmpeg nutzt die 4 Kerne dann gut aus.
  const fertig = await parallel(jeSprache, 2);
  return fassungen.map((f, k) => (fertig[k]?.fehler ? { sprache: f.sprache, fehler: fertig[k].fehler } : { sprache: f.sprache, v: fertig[k] }));
}

// Arbeitsordner einer Sprache nach dem Ablegen sofort loeschen (Plattenplatz auf dem Runner).
export const aufraeumen = (ordner) => { if (existsSync(ordner)) rmSync(ordner, { recursive: true, force: true }); };
