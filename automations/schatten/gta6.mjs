// GTA-6-Kanal (17.11., Nutzer: "einer muss sich auf GTA 6 fokussieren - der, der am besten performt"): @futureflowx3.
// GTA VI erscheint am 19.11.2026 (PS5, Xbox Series X|S, zum Start kein PC; Leonida/Vice City; Lucia und Jason).
// Von Hand geschrieben: nur bestätigte Fakten, bekannte Spieler-Mythen aus alten Teilen (passt zum Grusel-Publikum des
// Kontos) und Meinungsfragen für Kommentare. KEIN Material von Rockstar (keine Trailer, Logos, Musik, Figuren-Bilder):
// eigene KI-Bilder im Stil "sonnige Küstenstadt/Neon", klar als Fan-Video und KI-generiert gekennzeichnet.
//   node gta6.mjs --liste                       -> Slugs in Reihenfolge
//   node gta6.mjs --bauen <slug> <ordner>        -> Video + <ordner>/gta6.json (Caption)
//   node gta6.mjs --posten <gta6.json> <url> <kanal>
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE = Date.parse('2026-11-19T00:00:00+01:00');
const STADT = 'sunny neon coastal city at night, palm trees, art deco hotels, pink and teal lights, cinematic, photorealistic, no logos, no text';
const BERG = 'misty forest mountain at night, full moon, eerie fog, cinematic, photorealistic, no text';
const tageBis = (jetzt = Date.now()) => Math.ceil((RELEASE - jetzt) / 864e5);

// Countdown-Hook passt sich dem Datum an (vor dem 19.11. "noch N Tage", danach "ist da")
export function countdown(jetzt = Date.now()) {
  const n = tageBis(jetzt);
  return n > 1 ? `Noch ${n} Tage bis GTA 6.` : n === 1 ? 'Morgen kommt GTA 6.' : 'GTA 6 ist endlich da.';
}

export const GTA6 = [
  { slug: 'gta6-alles-was-sicher-ist', titel: 'GTA 6: Alles, was sicher ist', hook: () => countdown(),
    szenen: (h) => [
      { text: h, bild: `${STADT}, sports car on an empty boulevard` },
      { text: 'Erscheinungstag: der 19. November 2026.', bild: `${STADT}, sunrise over the ocean` },
      { text: 'Nur für PlayStation 5 und Xbox Series. Eine PC-Version ist zum Start nicht angekündigt.', bild: 'dark gaming room, glowing game console, neon light, cinematic, no logos, no text' },
      { text: 'Es spielt im Bundesstaat Leonida. Mit der Stadt Vice City.', bild: `${STADT}, aerial view` },
      { text: 'Du spielst zwei Hauptfiguren: Lucia und Jason. Ein Gangster-Paar.', bild: 'two silhouettes walking at sunset next to a car, neon coastal city, cinematic, no faces, no text' },
    ], frage: 'Holst du es dir am ersten Tag?', wahl: ['Day One', 'Ich warte'] },
  { slug: 'gta6-geist-mount-gordo', titel: 'GTA-Mythos: Der Geist vom Mount Gordo', hook: () => 'In GTA 5 erscheint nachts ein Geist. Und er ist echt.',
    szenen: (h) => [
      { text: h, bild: `${BERG}, ghostly pale woman figure far away` },
      { text: 'Auf dem Mount Gordo, zwischen 23 Uhr und Mitternacht im Spiel.', bild: `${BERG}, rocky cliff above the sea` },
      { text: 'Eine bleiche Gestalt steht am Abhang. Kommst du näher, verschwindet sie.', bild: `${BERG}, translucent ghost at the edge of a cliff` },
      { text: 'Im Boden davor steht ein Name. In Blut geschrieben.', bild: 'dark ground at night with faint red letters, horror, cinematic, unreadable text' },
      { text: 'Rockstar hat das nie erklärt.', bild: `${BERG}, empty cliff, fog` },
    ], frage: 'Welchen Geist versteckt Rockstar in GTA 6?', wahl: ['Einen Geist', 'Ein Monster'] },
  { slug: 'gta6-wie-alt-warst-du', titel: 'GTA 5 kam 2013. Wie alt warst du?', hook: () => 'GTA 5 kam 2013 raus. Wie alt warst du?',
    szenen: (h) => [
      { text: h, bild: 'old crt tv in a 2013 teenager bedroom at night, game controller, nostalgic, cinematic, no logos, no text' },
      { text: 'Seitdem sind 13 Jahre vergangen.', bild: 'calendar pages flying in a dark room, cinematic, no text' },
      { text: 'Ganze Schuljahrgänge sind seitdem fertig geworden.', bild: 'empty school hallway at night, nostalgic, cinematic, no text' },
      { text: 'Und jetzt, am 19. November, kommt endlich der nächste Teil.', bild: `${STADT}, fireworks over the beach` },
    ], frage: 'Wie alt warst du bei GTA 5?', wahl: ['Unter 12', 'Über 12'] },
  { slug: 'gta6-bigfoot-san-andreas', titel: 'GTA-Mythos: Bigfoot in San Andreas', hook: () => 'Jahrelang jagten Spieler Bigfoot in GTA San Andreas.',
    szenen: (h) => [
      { text: h, bild: 'dark pine forest at night, huge hairy silhouette between the trees, found footage, cinematic, no text' },
      { text: 'Es gab Fotos. Videos. Angebliche Spuren im Wald.', bild: 'blurry old photo of a forest with a shadowy creature, grainy, no text' },
      { text: 'Gefunden hat ihn dort nie jemand.', bild: 'empty foggy forest road at night, cinematic, no text' },
      { text: 'Aber der Mythos war so groß, dass alle in GTA 6 wieder suchen werden.', bild: 'swamp at night with glowing eyes in the dark, cinematic, no text' },
    ], frage: 'Gibt es in GTA 6 ein Monster?', wahl: ['Ja', 'Nein'] },
  { slug: 'gta6-erste-stunde', titel: 'Was machst du als Erstes in GTA 6?', hook: () => 'Was machst du in der ersten Stunde GTA 6?',
    szenen: (h) => [
      { text: h, bild: `${STADT}, empty street, sports car with open door` },
      { text: 'Option eins: Story spielen, wie es sich gehört.', bild: 'two silhouettes on a motel balcony at sunset, neon, cinematic, no faces, no text' },
      { text: 'Option zwei: Sofort ein Auto klauen und die Stadt erkunden.', bild: `${STADT}, car speeding with motion blur` },
      { text: 'Ehrlich. Wir wissen alle, was du wirklich machst.', bild: `${STADT}, police lights reflecting on wet street` },
    ], frage: 'Story oder Chaos?', wahl: ['Story', 'Chaos'] },
  { slug: 'gta6-mount-chiliad', titel: 'GTA-Mythos: Das Rätsel vom Mount Chiliad', hook: () => 'Ein Rätsel aus GTA 5 ist bis heute nicht gelöst.',
    szenen: (h) => [
      { text: h, bild: 'mountain peak at night with a strange glowing light in the sky, cinematic, no text' },
      { text: 'Auf dem Mount Chiliad ist ein Wandbild: ein Ufo, ein Ei, ein Jetpack.', bild: 'old wall mural in a mountain cabin with ufo and strange symbols, flashlight, cinematic, no text' },
      { text: 'Spieler suchen seit über zehn Jahren nach der Bedeutung.', bild: 'dark room full of maps and red strings, conspiracy board, cinematic, no text' },
      { text: 'Viele glauben: Die Antwort steckt in GTA 6.', bild: `${STADT}, strange light in the sky above the city` },
    ], frage: 'Wird das Rätsel in GTA 6 gelöst?', wahl: ['Ja', 'Nie'] },
  { slug: 'gta6-spieler-typ', titel: 'Welcher GTA-Spieler bist du?', hook: () => 'Es gibt nur zwei Arten von GTA-Spielern.',
    szenen: (h) => [
      { text: h, bild: `${STADT}, split screen feeling, two cars side by side at a red light` },
      { text: 'Die einen halten an jeder roten Ampel.', bild: `${STADT}, car waiting at a red traffic light, calm` },
      { text: 'Die anderen nehmen den Gehweg.', bild: `${STADT}, car driving on a sidewalk, chaos, motion blur` },
      { text: 'Am 19. November sehen wir, wer du wirklich bist.', bild: `${STADT}, sunrise, empty highway` },
    ], frage: 'Welcher Typ bist du?', wahl: ['Ampel', 'Gehweg'] },
  { slug: 'gta6-zurueck-nach-vice-city', titel: 'Zurück nach Vice City', hook: () => 'Nach über 20 Jahren geht es zurück nach Vice City.',
    szenen: (h) => [
      { text: h, bild: `${STADT}, retro 80s look` },
      { text: 'GTA Vice City kam 2002 raus.', bild: 'retro 2002 living room, old tv glowing, nostalgic, cinematic, no logos, no text' },
      { text: 'Jetzt kehrt die Reihe in die Stadt zurück. Größer als je zuvor.', bild: `${STADT}, aerial view, huge skyline` },
      { text: 'Diesmal mit Sümpfen, Inseln und dem ganzen Bundesstaat Leonida.', bild: 'swamp with airboat at sunset, florida everglades style, cinematic, no text' },
    ], frage: 'Hast du Vice City damals gespielt?', wahl: ['Ja', 'Zu jung'] },
  { slug: 'gta6-geister-in-leonida', titel: 'Welcher Mythos kommt in GTA 6?', hook: () => 'Jedes GTA hatte seinen Mythos. Welcher kommt in GTA 6?',
    szenen: (h) => [
      { text: h, bild: 'swamp at night, fog, faint figure standing in the water, horror, cinematic, no text' },
      { text: 'San Andreas hatte Bigfoot. GTA 5 hatte den Geist vom Mount Gordo.', bild: `${BERG}, ghost silhouette` },
      { text: 'Leonida hat Sümpfe, Inseln und verlassene Motels.', bild: 'abandoned motel at night, flickering neon sign, horror, cinematic, unreadable text' },
      { text: 'Perfekte Orte für etwas, das dort nicht sein sollte.', bild: 'dark swamp with glowing eyes, cinematic, no text' },
    ], frage: 'Was versteckt sich in den Sümpfen?', wahl: ['Ein Geist', 'Ein Alligator'] },
  { slug: 'gta6-ersten-tag', titel: 'Der erste Tag mit GTA 6', hook: () => 'Am 19. November ist keiner mehr erreichbar.',
    szenen: (h) => [
      { text: h, bild: 'phone with many unread messages on a desk, dark gaming room, neon, cinematic, no text' },
      { text: 'Der Freundeskreis: offline.', bild: 'empty city park at night, cinematic, no text' },
      { text: 'Die Gruppenchats: still.', bild: 'dark room lit only by a tv screen, silhouette on a couch, cinematic, no text' },
      { text: 'Alle sind in Vice City.', bild: `${STADT}, crowded beach boulevard` },
    ], frage: 'Wer ist am 19. offline?', wahl: ['Ich', 'Nicht ich'] },
];

const TAGS = '#gta6 #gtavi #vicecity #gaming #gta';
export function caption(eintrag, hook) {
  return `${hook} ${eintrag.frage} 1️⃣ ${eintrag.wahl[0]} oder 2️⃣ ${eintrag.wahl[1]}? 👇\n\n${TAGS}\n(Fan-Video, nicht von Rockstar. KI-generiert: Bilder, Stimme und Text.)`.slice(0, 2200);
}

export function skript(eintrag, jetzt = Date.now()) {
  const hook = eintrag.slug === 'gta6-alles-was-sicher-ist' ? countdown(jetzt) : eintrag.hook();
  const szenen = [...eintrag.szenen(hook), { text: `${eintrag.frage} Eins: ${eintrag.wahl[0]}. Zwei: ${eintrag.wahl[1]}. Schreib es in die Kommentare.`, bild: `${STADT}, sunset` }];
  return { titel: eintrag.titel, hook, szenen, caption: caption(eintrag, hook) };
}

async function main() {
  const [modus, a, b, c] = process.argv.slice(2);
  if (modus === '--liste') { console.log(GTA6.map((x) => x.slug).join('\n')); return; }
  if (modus === '--bauen') {
    const e = GTA6.find((x) => x.slug === a);
    if (!e) throw new Error(`unbekannt: ${a}`);
    mkdirSync(b, { recursive: true });
    const s = skript(e);
    const { videoBauen } = await import('../lib/videoFabrik.mjs');
    const v = await videoBauen({ titel: s.titel, szenen: s.szenen }, join(b, 'bau'), { format: 'hoch', hook: s.hook, premium: true, sprache: 'de', stimme: 'de-DE-ConradNeural', stil: 'cinematic, photorealistic, vibrant' });
    copyFileSync(v.pfad, join(b, 'video.mp4'));
    writeFileSync(join(b, 'gta6.json'), JSON.stringify({ slug: e.slug, titel: s.titel, caption: s.caption }, null, 2));
    console.log(`[gta6] fertig: ${e.slug} (${Math.round(v.dauer)} s)`);
    return;
  }
  if (modus === '--posten') {
    const token = process.env.BUFFER_ACCESS_TOKEN;
    if (!token) { console.log('[gta6] BUFFER_ACCESS_TOKEN fehlt - nicht gepostet.'); process.exit(2); }
    if (!/^https:\/\//.test(b || '') || !/^[a-f\d]{24}$/.test(c || '')) throw new Error('Aufruf: --posten <gta6.json> <https-url> <kanal>');
    const f = JSON.parse(readFileSync(a, 'utf8'));
    const { API, POST_MUTATION, postInput } = await import('../lib/bufferPoster.mjs');
    const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: POST_MUTATION, variables: { input: postInput(c, f.caption, b, { titel: f.titel.slice(0, 90) }) } }) });
    const d = await res.json().catch(() => ({}));
    const r = d?.data?.createPost;
    if (!res.ok || !r || r.__typename === 'MutationError' || d.errors) { console.log('[gta6] Posten fehlgeschlagen:', res.status, r?.message || JSON.stringify(d.errors || d).slice(0, 300)); process.exit(1); }
    console.log('[gta6] gepostet:', f.titel, r.post?.id, r.post?.status);
    return;
  }
  throw new Error('Aufruf: --liste | --bauen <slug> <ordner> | --posten <gta6.json> <url> <kanal>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
