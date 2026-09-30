// Fakten-Kanal (#100) - Community-Aufbau mit viralen "Wusstest du...?"-Videos, ohne Shop-Bezug.
// Jeden Tag mehrere Kurzvideos (25-35 s, Hochformat) zu krassen, WAHREN Fakten aus wechselnden
// Kategorien. Gleicher Premium-Look wie #94 (Effekte, Untertitel, Musik) plus immer dieselbe
// KI-Moderatorin als Gesicht des Kanals. Fortlaufende Nummer ("Fakt #N") und eine Frage an die
// Zuschauer am Ende holen Kommentare und Follower. Alles kostenlos, ohne API-Key.
//   node automations/100-fakten-kanal.mjs   -> Videos nach out/videos, Manifest nach out/manifest.json
// Verlauf (Nummer + schon benutzte Fakten) liegt in fakten-kanal/verlauf.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { videoBauen } from './lib/videoFabrik.mjs';
import { kiJson } from './lib/kiJson.mjs';
import { moderatorinAn, moderatorinEinfuegen } from './lib/moderatorin.mjs';

const OUT = 'out';
const VERLAUF = 'fakten-kanal/verlauf.json';
const env = (k, d = '') => (process.env[k] || d).trim();
const ANZAHL = Math.min(Math.max(parseInt(env('FAKTEN_ANZAHL', '4'), 10) || 4, 1), 12);
// Kanalname erscheint oben als Wasserzeichen und auf der Endkarte (z. B. @faktenblitz).
const KANAL = env('FAKTEN_KANAL', '@faktenblitz').slice(0, 30);
// Immer dieselbe Moderatorin (1-6) - ein festes Gesicht macht den Kanal wiedererkennbar.
const MODERATORIN_NR = Math.min(Math.max(parseInt(env('FAKTEN_MODERATORIN', '2'), 10) || 2, 1), 6);
const KATEGORIEN = env('FAKTEN_KATEGORIEN', 'Psychologie,Menschlicher Koerper,Weltall,Tiere,Geschichte,Geld und Wirtschaft,Technik,Natur und Erde,Essen,Rekorde')
  .split(',').map((s) => s.trim()).filter(Boolean);

const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'fakt';
const kurz = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

function verlaufLaden() {
  try { return JSON.parse(readFileSync(VERLAUF, 'utf8')); } catch { return { nr: 0, fakten: [] }; }
}

async function skriptSchreiben(kategorie, nr, bekannt) {
  const d = await kiJson(
    `Schreibe ein virales Kurzvideo (25-35 Sekunden, TikTok/Reels/Shorts) auf Deutsch ueber einen krassen, WAHREN Fakt aus der Kategorie "${kategorie}". ` +
      'Regeln: nur gut belegtes Lexikon-Wissen, keine erfundenen Zahlen oder Studien, keine Gesundheits- oder Finanzratschlaege, nichts Politisches, keine realen Privatpersonen, keine Marken. ' +
      `Diese Fakten gab es schon (nicht wiederholen): ${bekannt.slice(-40).join(' | ') || 'keine'}. ` +
      'Aufbau in 5-6 Szenen mit je 1 kurzem, gesprochenem Satz (Du-Form, locker): 1) Hook, der sofort neugierig macht (max. 12 Woerter), ' +
      '2-4) Erklaerung, die sich steigert, 5) Frage an die Zuschauer fuer die Kommentare, 6) "Folge fuer mehr krasse Fakten!". ' +
      'Je Szene "bild": englischer Bild-Prompt (max. 15 Woerter, cinematic, photorealistic, dramatic light, no text, no logos, no real people). ' +
      'Antworte NUR mit JSON: {"titel":"max. 60 Zeichen","fakt":"der Fakt in einem Satz","hook":"max. 5 Woerter","caption":"2 Saetze + Frage + 4-6 Hashtags","szenen":[{"text":"...","bild":"..."}]}',
    { maxTokens: 1400 }
  );
  const szenen = (Array.isArray(d.szenen) ? d.szenen : [])
    .map((s) => ({ text: kurz(s.text, 220), bild: kurz(s.bild, 200) }))
    .filter((s) => s.text.length > 3 && s.bild)
    .slice(0, 7);
  if (szenen.length < 4) throw new Error('Skript zu kurz');
  szenen[0].rang = nr; // Serien-Nummer "#N" oben links
  const seed = [...String(d.fakt || d.titel || nr)].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 1_000_000_007, 13);
  return {
    titel: `Fakt #${nr}: ${kurz(d.titel || d.fakt, 60)}`,
    fakt: kurz(d.fakt || d.titel, 200),
    hook: kurz(d.hook || d.titel, 40),
    caption: kurz(d.caption, 1500),
    hintergrund: { prompt: '', seed },
    shop: KANAL,
    cta: 'FOLGEN FÜR MEHR',
    szenen,
  };
}

async function main() {
  mkdirSync(join(OUT, 'videos'), { recursive: true });
  const verlauf = verlaufLaden();
  const manifest = [];
  const tag = Math.floor(Date.now() / 86400000);
  for (let i = 0; i < ANZAHL; i++) {
    const kategorie = KATEGORIEN[(tag * ANZAHL + i) % KATEGORIEN.length];
    const nr = verlauf.nr + 1;
    const start = Date.now();
    try {
      const skript = await skriptSchreiben(kategorie, nr, verlauf.fakten);
      const v = await videoBauen(skript, join(OUT, `fakt-${i}`), { format: 'hoch', hook: skript.hook, premium: true, sprache: 'de', stil: 'cinematic, photorealistic, dramatic lighting' });
      if (moderatorinAn() && v.stimme) {
        try { await moderatorinEinfuegen(v.pfad, v.stimme, MODERATORIN_NR); } catch (err) { console.log(`[100-fakten-kanal] Moderatorin fehlgeschlagen: ${String(err.message).slice(0, 150)}`); }
      }
      const basis = `${new Date().toISOString().slice(0, 10)}-fakt-${nr}-${slug(skript.titel.replace(/^Fakt #\d+:\s*/, ''))}`;
      copyFileSync(v.pfad, join(OUT, 'videos', `${basis}.mp4`));
      const vorschau = v.vorschau ? `${basis}.jpg` : '';
      if (vorschau) copyFileSync(v.vorschau, join(OUT, 'videos', vorschau));
      manifest.push({ datei: `${basis}.mp4`, vorschau, sprache: 'de', kanal: 'fakten', titel: skript.titel, caption: `${skript.caption}\n\nFolge ${KANAL} für täglich neue Fakten!`, thema: kategorie, format: 'hoch', dauer: Math.round(v.dauer), szenen: v.szenen });
      verlauf.nr = nr;
      verlauf.fakten = [...verlauf.fakten, skript.fakt].slice(-500);
      console.log(`[100-fakten-kanal] ✓ ${basis}.mp4 (${kategorie}, ${Math.round(v.dauer)} s, ${Math.round((Date.now() - start) / 1000)} s Bauzeit)`);
    } catch (err) {
      console.log(`[100-fakten-kanal] ✗ ${kategorie}: ${String(err.message).slice(0, 200)}`);
    }
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (!existsSync('fakten-kanal')) mkdirSync('fakten-kanal', { recursive: true });
  writeFileSync(VERLAUF, JSON.stringify(verlauf, null, 1) + '\n');
  console.log(`[100-fakten-kanal] ${manifest.length}/${ANZAHL} Videos fertig, naechste Nummer: #${verlauf.nr + 1}`);
  if (!manifest.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
