// Podcast-Fabrik (#98) - taeglich eine Podcast-Folge mit zwei KI-Stimmen, komplett
// kostenlos: Pollinations-KI schreibt den Dialog, edge-tts spricht (Frau + Mann), ffmpeg
// mischt Intro/Outro-Klang und normalisiert auf Podcast-Lautheit (-16 LUFS). Die MP3 liegt
// im GitHub-Release, der RSS-Feed (podcast/feed.xml) auf GitHub Pages - einmal bei
// Spotify, Apple Podcasts, Amazon Music & Co. eintragen, danach kommt jede Folge von selbst.
//   node automations/98-podcast.mjs         -> Folge nach out/podcast bauen (PODCAST_BASIS = Release-URL)
//   node automations/98-podcast.mjs --rss   -> podcast/feed.xml aus podcast/episoden.json erzeugen
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sprechen, ladeBild, vorschaubildBauen, dauerSekunden } from './lib/videoFabrik.mjs';
import { kiText, kiJson, szenenRetten } from './lib/kiJson.mjs';

const ausfuehren = promisify(execFile);
const env = (k, d = '') => (process.env[k] || d).trim();
const OUT = join('out', 'podcast');
const ORDNER = 'podcast';
const EPISODEN = join(ORDNER, 'episoden.json');
const MINUTEN = Math.min(Math.max(parseFloat(env('PODCAST_MINUTEN', '12')) || 12, 3), 60);
const SPRACHE = env('PODCAST_SPRACHE', 'de') === 'en' ? 'en' : 'de';
const NAME = env('PODCAST_NAME', SPRACHE === 'en' ? 'Curious Minds Daily' : 'Neugier am Morgen');
const REPO = env('GITHUB_REPOSITORY', 'ziyabicilecommerce-hub/ai-cash-machine');
const SEITE = `https://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}/${ORDNER}/`;

const HOSTS = SPRACHE === 'en'
  ? { A: { name: 'Ava', stimme: 'en-US-AvaMultilingualNeural' }, B: { name: 'Andrew', stimme: 'en-US-AndrewMultilingualNeural' } }
  : { A: { name: 'Lena', stimme: 'de-DE-SeraphinaMultilingualNeural' }, B: { name: 'Jonas', stimme: 'de-DE-FlorianMultilingualNeural' } };

const THEMEN_STANDARD = [
  'Warum wir prokrastinieren und was wirklich hilft', 'Wie Schlaf unser Gehirn aufraeumt', 'Die Psychologie hinter guten Gewohnheiten',
  'Wie das Internet eigentlich funktioniert', 'Die erstaunlichsten Tiere der Tiefsee', 'Warum Geld eigentlich Wert hat',
  'Wie Kuenstliche Intelligenz lernt', 'Die groessten Irrtuemer der Geschichte', 'Was im Koerper beim Sport passiert',
  'Wie man sich Dinge besser merkt', 'Warum Musik uns Gaensehaut macht', 'Die Geschichte der Schokolade',
  'Wie Vulkane die Welt veraendert haben', 'Was Glueck aus Sicht der Forschung ist', 'Wie Handys unsere Aufmerksamkeit veraendern',
  'Das Raetsel der Dunklen Materie', 'Warum Kaffee wach macht', 'Wie Staedte in Zukunft aussehen', 'Die Macht der ersten Eindruecke', 'Wie Bienen die Welt ernaehren',
];

const ladeEpisoden = () => (existsSync(EPISODEN) ? JSON.parse(readFileSync(EPISODEN, 'utf8')) : []);
const sekunden = (zeilen) => zeilen.reduce((n, z) => n + z.text.split(/\s+/).length / 2.4 + 0.45, 0);

function zeilenPruefen(roh) {
  return (Array.isArray(roh) ? roh : [])
    .map((z) => ({ sprecher: String(z.sprecher || z.speaker || '').trim().toUpperCase().startsWith('B') ? 'B' : 'A', text: String(z.text || '').replace(/\s+/g, ' ').trim().slice(0, 500) }))
    .filter((z) => z.text.length > 3);
}

async function portion(prompt) {
  try {
    return zeilenPruefen((await kiJson(prompt, { maxTokens: 2500 })).zeilen);
  } catch {
    try { return zeilenPruefen(szenenRetten(await kiText(prompt, { maxTokens: 2500 }))); } catch { return []; }
  }
}

async function skriptSchreiben(thema, nr) {
  const sprache = SPRACHE === 'en' ? 'Englisch' : 'Deutsch';
  const plan = await kiJson(
    `Plane Folge ${nr} des Wissens-Podcasts "${NAME}" (ca. ${MINUTEN} Minuten, ${sprache}) zum Thema "${thema}". Zwei Hosts: ${HOSTS.A.name} (erklaert) und ${HOSTS.B.name} (fragt neugierig nach, bringt Beispiele und Humor). ` +
      `Nur gesichertes Wissen, keine erfundenen Studien oder Zahlen. Antworte NUR mit JSON: {"titel":"packender Folgentitel","beschreibung":"2-3 Saetze fuer die Shownotes","abschnitte":["..."]} mit ${MINUTEN > 20 ? '6 bis 10' : '4 bis 6'} Abschnitten.`,
    { maxTokens: 1000 }
  );
  const abschnitte = (Array.isArray(plan.abschnitte) ? plan.abschnitte : []).map((a) => String(typeof a === 'string' ? a : a?.titel || JSON.stringify(a)).slice(0, 200)).filter(Boolean).slice(0, 10);
  if (!abschnitte.length) throw new Error('Keine Abschnitte');
  const proAbschnitt = (MINUTEN * 60 - 40) / abschnitte.length;
  const zeilen = [];
  const kapitel = [];
  for (const [ai, abschnitt] of abschnitte.entries()) {
    const teil = [];
    for (let v = 0; sekunden(teil) < proAbschnitt * 0.97 && v < Math.ceil(proAbschnitt / 50) + 4; v++) {
      const bisher = [...zeilen, ...teil].slice(-8).map((z) => `${HOSTS[z.sprecher].name}: ${z.text}`).join(' | ');
      teil.push(...(await portion(
        `Podcast "${NAME}", Folge "${plan.titel || thema}". Ablauf: ${abschnitte.map((a, j) => `${j + 1}) ${a}${j === ai ? ' <- JETZT' : ''}`).join(' ')}\n` +
          `${bisher ? `Zuletzt gesagt (nahtlos weiter, nichts wiederholen): ${bisher}\n` : ''}` +
          `Schreibe die naechsten 10 bis 12 Dialogzeilen fuer Abschnitt ${ai + 1} ("${abschnitt}") auf ${sprache}: natuerlich gesprochen, locker, du-Form, abwechselnd A (${HOSTS.A.name}) und B (${HOSTS.B.name}), je 1-3 Saetze. ${ai === abschnitte.length - 1 ? 'Letzter Abschnitt: kurzes Fazit.' : 'Noch KEIN Fazit, keine Verabschiedung.'} ` +
          'Antworte NUR mit JSON: {"zeilen":[{"sprecher":"A","text":"..."},{"sprecher":"B","text":"..."}]}'
      )));
    }
    if (teil.length) kapitel.push({ zeile: zeilen.length, titel: abschnitt });
    zeilen.push(...teil);
    console.log(`[98-podcast] Abschnitt ${ai + 1}/${abschnitte.length}: ${teil.length} Zeilen, ca. ${Math.round(sekunden(teil))} s`);
  }
  if (zeilen.length < 10) throw new Error(`Zu wenige Zeilen (${zeilen.length})`);
  const titel = String(plan.titel || thema).slice(0, 120);
  const hallo = SPRACHE === 'en'
    ? [{ sprecher: 'A', text: `Welcome to ${NAME}! I'm ${HOSTS.A.name}.` }, { sprecher: 'B', text: `And I'm ${HOSTS.B.name}. Today: ${titel}.` }]
    : [{ sprecher: 'A', text: `Hallo und herzlich willkommen bei ${NAME}! Ich bin ${HOSTS.A.name}.` }, { sprecher: 'B', text: `Und ich bin ${HOSTS.B.name}. Heute geht es um: ${titel}.` }];
  const tschuess = SPRACHE === 'en'
    ? [{ sprecher: 'A', text: `That's it for today. If you enjoyed it, follow ${NAME}!` }, { sprecher: 'B', text: 'See you tomorrow, bye!' }]
    : [{ sprecher: 'A', text: `Das war's fuer heute. Wenn es dir gefallen hat, folge ${NAME}!` }, { sprecher: 'B', text: 'Bis morgen, tschuess!' }];
  for (const k of kapitel) k.zeile += hallo.length;
  return { titel, beschreibung: String(plan.beschreibung || '').slice(0, 1500), zeilen: [...hallo, ...zeilen, ...tschuess], kapitel };
}

// Kurzer Klang fuer Intro/Outro (gleiche Machart wie die Musik in videoExtras).
async function jingle(ziel, sek) {
  const formel = [261.63, 329.63, 392.0, 523.25].map((hz, i) => `${(0.06 - i * 0.01).toFixed(3)}*sin(2*PI*${hz}*t)*(0.6+0.4*sin(2*PI*${(0.4 + i * 0.15).toFixed(2)}*t))`).join('+');
  await ausfuehren('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${formel}':s=44100:d=${sek}`,
    '-af', `aecho=0.8:0.6:300|600:0.3|0.2,afade=t=in:d=0.5,afade=t=out:st=${sek - 2}:d=2,volume=3`, '-ac', '1', '-ar', '44100', ziel]);
}

async function audioBauen(skript, ordner) {
  mkdirSync(ordner, { recursive: true });
  const pause = join(ordner, 'pause.wav');
  await ausfuehren('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.4', pause]);
  const intro = join(ordner, 'intro.wav');
  const outro = join(ordner, 'outro.wav');
  await jingle(intro, 6);
  await jingle(outro, 7);
  const teile = [intro];
  const startZeit = [];
  let zeit = dauerSekunden(intro);
  for (const [i, z] of skript.zeilen.entries()) {
    const mp3 = join(ordner, `z${i}.mp3`);
    const wav = join(ordner, `z${i}.wav`);
    try {
      await sprechen(z.text, mp3, join(ordner, `z${i}.srt`), HOSTS[z.sprecher].stimme);
      await ausfuehren('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp3, '-ac', '1', '-ar', '44100', wav]);
      startZeit[i] = zeit;
      teile.push(wav, pause);
      zeit += dauerSekunden(wav) + 0.4;
    } catch (err) {
      console.log(`[98-podcast] Zeile ${i + 1} uebersprungen: ${String(err.message).slice(0, 120)}`);
    }
    if ((i + 1) % 50 === 0) console.log(`[98-podcast] ${i + 1}/${skript.zeilen.length} Zeilen gesprochen`);
  }
  teile.push(outro);
  const liste = join(ordner, 'liste.txt');
  writeFileSync(liste, teile.map((t) => `file '${resolve(t).replace(/'/g, "'\\''")}'`).join('\n'));
  const ziel = join(ordner, 'folge.mp3');
  await ausfuehren('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', liste,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', ziel], { timeout: 3600000, maxBuffer: 16 * 1024 * 1024 });
  const kapitel = skript.kapitel.filter((k) => startZeit[k.zeile] != null).map((k) => ({ zeit: startZeit[k.zeile], titel: k.titel }));
  return { pfad: ziel, dauer: dauerSekunden(ziel), kapitel };
}

const uhr = (s) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const x = String(Math.floor(s % 60)).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'folge';

async function coverSicherstellen() {
  const cover = join(ORDNER, 'cover.jpg');
  if (existsSync(cover)) return;
  const roh = join(OUT, 'cover.img');
  const ok = await ladeBild('podcast cover art, two friendly microphones, glowing lightbulb, colorful gradient background, modern flat illustration, no text', roh, { breite: 1400, hoehe: 1400 });
  if (!ok) return;
  try {
    vorschaubildBauen(roh, cover, NAME, { breite: 1400, hoehe: 1400 });
  } catch {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', roh, '-vf', 'scale=1400:1400', '-q:v', '3', cover]);
  }
}

async function bauen() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(ORDNER, { recursive: true });
  const basis = env('PODCAST_BASIS');
  if (!basis) throw new Error('PODCAST_BASIS (Release-URL) fehlt');
  const episoden = ladeEpisoden();
  const nr = episoden.length + 1;
  const themen = env('PODCAST_THEMEN').split(',').map((t) => t.trim()).filter(Boolean);
  const liste = themen.length ? themen : THEMEN_STANDARD;
  const thema = liste[(nr - 1) % liste.length];
  const start = Date.now();
  console.log(`[98-podcast] Folge ${nr}: "${thema}" (${MINUTEN} Min., ${SPRACHE})`);
  await coverSicherstellen();
  const skript = await skriptSchreiben(thema, nr);
  const audio = await audioBauen(skript, join(OUT, 'arbeit'));
  const datei = `${new Date().toISOString().slice(0, 10)}-podcast-${nr}-${slug(skript.titel)}.mp3`;
  execFileSync('cp', [audio.pfad, join(OUT, datei)]);
  const kapitel = audio.kapitel.length >= 2 ? `\n\nKapitel:\n${audio.kapitel.map((k) => `${uhr(k.zeit)} ${k.titel}`).join('\n')}` : '';
  episoden.unshift({
    nr, titel: skript.titel, beschreibung: `${skript.beschreibung}${kapitel}\n\nMit ${HOSTS.A.name} und ${HOSTS.B.name} – erzeugt mit KI-Stimmen.`,
    datei, url: `${basis.replace(/\/$/, '')}/${encodeURIComponent(datei)}`, bytes: statSync(audio.pfad).size, dauer: Math.round(audio.dauer), datum: new Date().toUTCString(), sprache: SPRACHE,
  });
  writeFileSync(EPISODEN, JSON.stringify(episoden.slice(0, 500), null, 1) + '\n');
  rssSchreiben();
  console.log(`[98-podcast] ✓ ${datei} (${Math.round(audio.dauer / 60)} Min., ${Math.round(statSync(audio.pfad).size / 1e6)} MB, ${Math.round((Date.now() - start) / 60000)} Min. Bauzeit)`);
}

const xml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function rssSchreiben() {
  const episoden = ladeEpisoden();
  const email = env('PODCAST_EMAIL');
  const items = episoden.map((e) => `    <item>
      <title>${xml(e.titel)}</title>
      <description>${xml(e.beschreibung)}</description>
      <enclosure url="${xml(e.url)}" length="${e.bytes}" type="audio/mpeg"/>
      <guid isPermaLink="false">${xml(e.datei)}</guid>
      <pubDate>${xml(e.datum)}</pubDate>
      <itunes:duration>${e.dauer}</itunes:duration>
      <itunes:episode>${e.nr}</itunes:episode>
      <itunes:explicit>false</itunes:explicit>
    </item>`).join('\n');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(NAME)}</title>
    <link>${SEITE}</link>
    <atom:link href="${SEITE}feed.xml" rel="self" type="application/rss+xml"/>
    <language>${SPRACHE}</language>
    <description>${xml(SPRACHE === 'en' ? 'A daily knowledge podcast: two hosts explain one fascinating topic every day.' : 'Der taegliche Wissens-Podcast: zwei Hosts erklaeren jeden Tag ein spannendes Thema - locker, verstaendlich, in wenigen Minuten.')}</description>
    <itunes:author>${xml(NAME)}</itunes:author>
    <itunes:image href="${SEITE}cover.jpg"/>
    <itunes:category text="Education"/>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>${email ? `\n    <itunes:owner><itunes:name>${xml(NAME)}</itunes:name><itunes:email>${xml(email)}</itunes:email></itunes:owner>` : ''}
${items}
  </channel>
</rss>
`;
  writeFileSync(join(ORDNER, 'feed.xml'), feed);
}

(process.argv[2] === '--rss' ? Promise.resolve(rssSchreiben()) : bauen()).catch((err) => {
  console.error('[98-podcast] Fehler:', err.message);
  process.exit(1);
});
