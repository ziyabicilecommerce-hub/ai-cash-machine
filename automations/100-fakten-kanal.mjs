// Fakten-Kanal (#100) - Community-Aufbau mit viralen "Wusstest du...?"-Videos, ohne Shop-Bezug.
// Jeden Tag mehrere Kurzvideos (25-35 s, Hochformat) zu krassen, WAHREN Fakten aus wechselnden
// Kategorien. Gleicher Premium-Look wie #94 (Effekte, Untertitel, Musik) plus immer dieselbe
// KI-Moderatorin als Gesicht des Kanals. Fortlaufende Nummer ("Fakt #N") und eine Frage an die
// Zuschauer am Ende holen Kommentare und Follower. Alles kostenlos, ohne API-Key.
//   node automations/100-fakten-kanal.mjs   -> Videos nach out/videos, Manifest nach out/manifest.json
// Verlauf (Nummer + schon benutzte Fakten) liegt in fakten-kanal/verlauf.json.
import { kontoFuer, nischenAus, nischeFuer, STANDARD_NISCHEN, serienHook, streakTag, querverweis } from './lib/faktenKonten.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { videoBauen } from './lib/videoFabrik.mjs';
import { kiJson } from './lib/kiJson.mjs';
import { umstritten, echo, doppelt } from './lib/faktenPruefung.mjs';
import { BANK, bankNaechster, saisonHeute, laeuftGerade } from './lib/faktenBank.mjs';
import { fortsetzungFuer } from './lib/gewinner.mjs';
import { eigenenClipWaehlen, eigeneClipDateien, clipPfad } from './lib/eigeneClips.mjs';
import { moderatorinAn, moderatorinEinfuegen } from './lib/moderatorin.mjs';

const OUT = 'out';
const VERLAUF = 'fakten-kanal/verlauf.json';
const env = (k, d = '') => (process.env[k] || d).trim();
const ANZAHL = Math.min(Math.max(parseInt(env('FAKTEN_ANZAHL', '6'), 10) || 6, 1), 12);
// Kanalname erscheint oben als Wasserzeichen und auf der Endkarte (z. B. @faktenblitz).
const KANAL = env('FAKTEN_KANAL', '@futureflowxx').slice(0, 30);
const liste = (k, d) => env(k, d).split(',').map((x) => x.trim()).filter(Boolean);
const TIKTOK_KONTEN = liste('FAKTEN_KONTEN_TIKTOK', '@zyx_7851,@futureflowxx,@futureflowx3');
// Videos pro TikTok-Konto und Lauf (Standard 2: der 6er-Morgenlauf geht komplett auf TikTok statt halb ungenutzt).
const TT_PRO_KONTO = Math.min(Math.max(parseInt(env('FAKTEN_TIKTOK_PRO_KONTO', '2'), 10) || 2, 1), 4);
const TT_LISTE = Array.from({ length: TIKTOK_KONTEN.length * TT_PRO_KONTO }, (_, k) => TIKTOK_KONTEN[k % TIKTOK_KONTEN.length]);
// Festes Format je Konto: alle TikTok-Konten zeigen "Was wäre wenn?" - krasse Szenarien mit Spannungsbogen statt
// Mythen (Wunsch des Users). Format: '@konto=waswaere;@konto2=quiz'.
const KONTO_FORMAT = Object.fromEntries(env('FAKTEN_KONTO_FORMAT', '@zyx_7851=waswaere;@futureflowxx=waswaere;@futureflowx3=waswaere').split(';').map((t) => t.split('=').map((x) => x.trim().toLowerCase())).filter(([k, f]) => k && ['quiz', 'mythos', 'waswaere'].includes(f)));
// Formate, die gar nicht mehr kommen (Standard: keine Mythen mehr).
const OHNE = liste('FAKTEN_OHNE', 'mythos');
const WEITERE_KONTEN = liste('FAKTEN_KONTEN_WEITERE', '@futureflowxx,@desk.rebel,@purivelle.785');
let KONTO = KANAL;
const NISCHEN = nischenAus(env('FAKTEN_NISCHEN', STANDARD_NISCHEN));
// Gelerntes Lieblingsformat der TikTok-Zuschauer (#102), z. B. 'quiz' - bevorzugt, aber nicht ausschließlich.
// TikTok-Zahlen der letzten Posts (von #103) - daraus erkennt die Gewinner-Fortsetzung, welches Video abgeht.
const POSTS = (() => { try { return JSON.parse(readFileSync('automations-dashboard/tiktok/daten.json', 'utf8')).letzte || []; } catch { return []; } })();
const LIEBLING = (() => { try { return JSON.parse(readFileSync('fakten-kanal/lernen.json', 'utf8')).bevorzugt || null; } catch { return null; } })();
// Immer dieselbe Moderatorin (1-6) - ein festes Gesicht macht den Kanal wiedererkennbar.
const MODERATORIN_NR = Math.min(Math.max(parseInt(env('FAKTEN_MODERATORIN', '2'), 10) || 2, 1), 6);
const KATEGORIEN = env('FAKTEN_KATEGORIEN', 'Psychologie,Menschlicher Koerper,Weltall,Tiere,Geschichte,Geld und Wirtschaft,Technik,Natur und Erde,Essen,Rekorde')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Formate im Wechsel: fakt (Wusstest du?), quiz (Rate mal A/B/C mit Countdown), mythos (Mythos oder Wahrheit?).
// Quiz und Mythos holen Kommentare - jeder will seine Antwort posten.
const FORMATE = env('FAKTEN_FORMATE', 'waswaere,quiz,fakt').split(',').map((s) => s.trim()).filter((f) => ['fakt', 'quiz', 'mythos', 'waswaere'].includes(f) && !OHNE.includes(f));
const REGELN = 'Regeln: nur gut belegtes Lexikon-Wissen, keine erfundenen Zahlen oder Studien, keine Gesundheits- oder Finanzratschlaege, nichts Politisches, keine realen Privatpersonen, keine Marken. ' +
  'Nur UNSTRITTIGE Fakten: keine Rekord- oder Ranglisten-Fragen, bei denen Quellen sich uneinig sind (z. B. laengster Fluss, hoechster Berg, groesstes Tier). ' +
  'Alle Saetze und Bilder drehen sich um GENAU EIN Thema - nichts aus anderen Fakten einmischen. Hashtags nur zum Thema des Videos. ';
const BILD = '"bilder": 5 englische Bild-Prompts (je max. 15 Woerter, cinematic, photorealistic, dramatic light, no text, no logos, no real people) die NUR das Thema zeigen (Tier, Landschaft, Objekt, Weltall) - keine Personen, keine Gesichter, keine Silhouetten';

const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'fakt';
const ersatzBild = (kategorie) => `${kategorie} theme, mysterious cinematic scene, photorealistic, dramatic light, no text`;
const kurz = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

function verlaufLaden() {
  try { return JSON.parse(readFileSync(VERLAUF, 'utf8')); } catch { return { nr: 0, fakten: [] }; }
}

async function skriptSchreiben(kategorie, nr, bekannt) {
  const d = await kiJson(
    `Schreibe ein virales Kurzvideo (25-35 Sekunden, TikTok/Reels/Shorts) auf Deutsch ueber einen krassen, WAHREN Fakt aus der Kategorie "${kategorie}". ` +
      'Regeln: nur gut belegtes Lexikon-Wissen, keine erfundenen Zahlen oder Studien, keine Gesundheits- oder Finanzratschlaege, nichts Politisches, keine realen Privatpersonen, keine Marken. ' +
      'Nur UNSTRITTIGE Fakten (keine Rekord-Fragen mit uneinigen Quellen), alle Saetze und Bilder zu GENAU EINEM Thema, Hashtags nur zum Thema. ' +
      `Diese Fakten gab es schon (nicht wiederholen): ${bekannt.slice(-40).join(' | ') || 'keine'}. ` +
      'Aufbau in 5-6 Szenen mit je 1 kurzem, gesprochenem Satz (Du-Form, locker): 1) Hook als Pattern-Interrupt (max. 8 Woerter): ein Widerspruch zu dem, was fast alle glauben, oder eine Frage, die sofort eine Wissensluecke oeffnet - keine Begruessung, keine Einleitung, keine erfundenen Zahlen, ' +
      '2-4) Erklaerung, die sich steigert, 5) Frage an die Zuschauer fuer die Kommentare, 6) "Folge fuer mehr krasse Fakten!". ' +
      'Je Szene "bild": englischer Bild-Prompt (max. 15 Woerter, cinematic, photorealistic, dramatic light, no text, no logos, nur das Thema zeigen - keine Personen, keine Gesichter, keine Silhouetten). ' +
      'Felder: titel = kurzer Titel zum Fakt (unter 60 Zeichen), fakt = der Fakt in einem Satz, hook = 2-5 Woerter, caption = zwei Saetze zum Fakt, eine Frage an die Zuschauer und 4-6 passende Hashtags. Schreibe echte Inhalte, keine Platzhalter. ' +
      'Antworte NUR mit JSON: {"titel":"...","fakt":"...","hook":"...","caption":"...","szenen":[{"text":"...","bild":"..."}]}',
    { maxTokens: 1400 }
  );
  const szenen = (Array.isArray(d.szenen) ? d.szenen : [])
    .map((s) => ({ text: kurz(typeof s === 'string' ? s : s?.text, 220), bild: kurz(s?.bild, 200) || ersatzBild(kategorie) }))
    .filter((s) => s.text.length > 3)
    .slice(0, 7);
  if (szenen.length < 4) throw new Error('Skript zu kurz');
  const seed = [...String(d.fakt || d.titel || nr)].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 1_000_000_007, 13);
  return {
    titel: `Fakt #${nr}: ${kurz(d.titel || d.fakt, 60)}`,
    fakt: kurz(d.fakt || d.titel, 200),
    hook: kurz(d.hook || d.titel, 40),
    caption: kurz(d.caption, 1500),
    hintergrund: { prompt: '', seed },
    shop: KONTO,
    cta: 'FOLGEN FÜR MEHR',
    szenen,
  };
}

function fertig(d, nr, szenen, fakt) {
  const seed = [...String(fakt || nr)].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 1_000_000_007, 13);
  return { titel: `#${nr}: ${kurz(d.titel || fakt, 60)}`, fakt: kurz(fakt, 200), hook: kurz(d.hook || d.titel, 40), caption: kurz(d.caption, 1500), hintergrund: { prompt: '', seed }, shop: KONTO, cta: 'FOLGEN FÜR MEHR', szenen };
}
const bilderAus = (d, kategorie) => {
  const b = (Array.isArray(d.bilder) ? d.bilder : []).map((x) => kurz(x, 200)).filter(Boolean);
  return b.length >= 3 ? b : [...b, ersatzBild(kategorie), `${ersatzBild(kategorie)}, close-up detail`, `${ersatzBild(kategorie)}, wide epic shot`];
};

async function quizSchreiben(kategorie, nr, bekannt) {
  const d = await kiJson(
    `Erstelle ein virales Quiz-Kurzvideo auf Deutsch (Kategorie "${kategorie}"): eine ueberraschende Wissensfrage mit 3 Antworten, genau eine ist richtig. ${REGELN}` +
      `Schon benutzt (nicht wiederholen): ${bekannt.slice(-40).join(' | ') || 'keine'}. Antworten max. 4 Woerter. ` +
      `Felder: titel = kurzer Titel zur Frage (unter 60 Zeichen), hook = 2-5 Woerter Herausforderung an den Zuschauer ohne Zahlen, z. B. Schaffst du diese Frage?, frage = die Wissensfrage, optionen = genau 3 Antworten, richtig = Index 0, 1 oder 2 der richtigen Antwort, erklaerung = 1-2 kurze Saetze warum, caption = Frage plus Aufforderung zu kommentieren plus 4-6 passende Hashtags. Schreibe echte Inhalte, keine Platzhalter. ` +
      `Antworte NUR mit JSON: {"titel":"...","hook":"...","frage":"...","optionen":["...","...","..."],"richtig":0,"erklaerung":["..."],"caption":"...",${BILD}}`,
    { maxTokens: 1200 }
  );
  return quizAus(d, kategorie, nr);
}

// Szenen aus fertigen Quiz-Daten (von der KI oder aus der geprüften Faktenliste).
function quizAus(d, kategorie, nr) {
  const optionen = (d.optionen || []).map((o) => kurz(o, 40)).slice(0, 3);
  const richtig = Number(d.richtig);
  const bilder = bilderAus(d, kategorie);
  if (optionen.length !== 3 || !(richtig >= 0 && richtig <= 2) || !d.frage) throw new Error('Quiz unvollstaendig');
  const b = (i) => bilder[i % bilder.length];
  const erkl = (Array.isArray(d.erklaerung) ? d.erklaerung : [d.erklaerung]).map((t) => kurz(t, 220)).filter(Boolean).slice(0, 1);
  const szenen = [
    // Sofort-Start: die Frage kommt in der ersten Sekunde (der Hook steht nur als Text oben) - wer wischt, wischt sonst schon beim Intro weg.
    { text: `${kurz(d.frage, 200)} A: ${optionen[0]}. B: ${optionen[1]}. Oder C: ${optionen[2]}?`, bild: b(0), overlay: { typ: 'optionen', optionen } },
    { text: 'Schreib A, B oder C in die Kommentare! Drei, zwei, eins...', bild: b(1), overlay: { typ: 'countdown', optionen } },
    { text: `Richtig ist ${'ABC'[richtig]}: ${optionen[richtig]}!`, bild: b(2), overlay: { typ: 'aufloesung', optionen, richtig } },
    ...erkl.map((t, i) => ({ text: t, bild: b(3 + i) })),
    { text: 'Folge für das nächste Quiz!', bild: b(4) },
  ];
  return fertig(d, nr, szenen, `${d.frage} -> ${optionen[richtig]}`);
}

async function waswaereSchreiben(kategorie, nr, bekannt) {
  const d = await kiJson(
    `Erstelle ein virales "Was wäre wenn?"-Kurzvideo auf Deutsch (Kategorie "${kategorie}"): ein krasses Gedankenexperiment, das die Wissenschaft gut erklären kann. ${REGELN}` +
      `Schon benutzt (nicht wiederholen): ${bekannt.slice(-40).join(' | ') || 'keine'}. ` +
      `Felder: titel = kurzer Titel (unter 60 Zeichen), frage = die Frage "Was passiert, wenn ...?", schritte = genau 3 kurze Sätze (je max. 10 Wörter), die Schritt für Schritt erklären, was passiert - der krasseste zuletzt, caption = die Frage plus Aufforderung zu kommentieren plus 4-6 passende Hashtags. Schreibe echte Inhalte, keine Platzhalter. ` +
      `Antworte NUR mit JSON: {"titel":"...","frage":"...","schritte":["...","...","..."],"caption":"...",${BILD}}`,
    { maxTokens: 1200 }
  );
  return waswaereAus(d, kategorie, nr);
}

// "Was wäre wenn?": Frage in Sekunde 1, drei Schritte (der krasseste zuletzt), Endkarte mit Kommentar-Frage. ~12 s.
function waswaereAus(d, kategorie, nr) {
  const bilder = bilderAus(d, kategorie);
  const schritte = (Array.isArray(d.schritte) ? d.schritte : []).map((t) => kurz(t, 160)).filter(Boolean).slice(0, 3);
  if (!d.frage || schritte.length < 3) throw new Error('Szenario unvollstaendig');
  const b = (i) => bilder[i % bilder.length];
  // Schneller Sprecher (+12 %) und kurze Sätze: Ziel sind ~12-15 s statt 25 s (Sehdauer lag bei 4,4 s).
  // Erste Szene ohne Stock-Clip: das scharfe KI-Bild ist der stärkere Hook als ein zufälliger Archiv-Clip.
  const szenen = [
    { text: kurz(d.frage, 160), bild: b(0), tempo: '+12%', ohneClip: true },
    ...schritte.map((t, i) => ({ text: t, bild: b(1 + i), tempo: '+12%' })),
    { text: 'Folge für mehr! Was als Nächstes? Antworte in einem Wort!', bild: b(4), tempo: '+12%' },
  ];
  return fertig(d, nr, szenen, d.frage);
}

async function mythosSchreiben(kategorie, nr, bekannt) {
  const d = await kiJson(
    `Erstelle ein virales "Mythos oder Wahrheit?"-Kurzvideo auf Deutsch (Kategorie "${kategorie}"): eine Behauptung, die viele fuer wahr halten (oder die unglaublich klingt, aber stimmt). ${REGELN}` +
      `Schon benutzt (nicht wiederholen): ${bekannt.slice(-40).join(' | ') || 'keine'}. ` +
      `Felder: titel = kurzer Titel zur Behauptung (unter 60 Zeichen), hook = 2-5 Woerter, aussage = die Behauptung in einem Satz, wahr = true oder false, erklaerung = 2-3 kurze Saetze, caption = Frage plus Aufforderung zu kommentieren plus 4-6 passende Hashtags. Schreibe echte Inhalte, keine Platzhalter. ` +
      `Antworte NUR mit JSON: {"titel":"...","hook":"...","aussage":"...","wahr":true,"erklaerung":["..."],"caption":"...",${BILD}}`,
    { maxTokens: 1200 }
  );
  return mythosAus(d, kategorie, nr);
}

function mythosAus(d, kategorie, nr) {
  const bilder = bilderAus(d, kategorie);
  if (!d.aussage || typeof d.wahr !== 'boolean') throw new Error('Mythos unvollstaendig');
  const b = (i) => bilder[i % bilder.length];
  const erkl = (Array.isArray(d.erklaerung) ? d.erklaerung : [d.erklaerung]).map((t) => kurz(t, 220)).filter(Boolean).slice(0, 3);
  const szenen = [
    // Sofort-Start: die Behauptung kommt in der ersten Sekunde ("Mythos oder Wahrheit?" steht oben als Text).
    { text: kurz(d.aussage, 220), bild: b(0) },
    { text: 'Mythos oder wahr? Schreib es in die Kommentare! Drei, zwei, eins...', bild: b(1), overlay: { typ: 'countdown', optionen: [] } },
    { text: d.wahr ? 'Es ist tatsächlich wahr!' : 'Das ist ein Mythos!', bild: b(2), overlay: { typ: 'stempel', wahr: d.wahr } },
    ...erkl.map((t, i) => ({ text: t, bild: b(3 + i) })),
    { text: 'Folge für mehr!', bild: b(4) },
  ];
  return fertig(d, nr, szenen, `${d.aussage} (${d.wahr ? 'wahr' : 'Mythos'})`);
}

async function main() {
  mkdirSync(join(OUT, 'videos'), { recursive: true });
  const verlauf = verlaufLaden();
  const manifest = [];
  const tag = Math.floor(Date.now() / 86400000);
  for (let i = 0; i < ANZAHL; i++) {
    const nr = verlauf.nr + 1;
    KONTO = kontoFuer(i, tag, TT_LISTE, WEITERE_KONTEN, KANAL);
    const kategorie = (i < TT_LISTE.length && nischeFuer(KONTO, NISCHEN)[tag % Math.max(nischeFuer(KONTO, NISCHEN).length, 1)]) || KATEGORIEN[(tag * ANZAHL + i) % KATEGORIEN.length];
    const start = Date.now();
    try {
      // Bis zu 3 Versuche - bei einem unbrauchbaren Skript notfalls im naechsten Format.
      const liste = FORMATE.length ? FORMATE : ['fakt'];
      let skript;
      let format;
      // Zuerst die geprüfte Faktenliste (keine erfundenen Fakten); die KI schreibt nur, wenn die Liste leer ist.
      // Jedes TikTok-Konto hat seine Nische (z. B. nur Weltall) - so lernt der Algorithmus, wem er es zeigen soll.
      const nische = nischeFuer(KONTO, NISCHEN);
      // Jedes zweite TikTok-Video im gelernten Lieblingsformat - so wird weiter getestet, aber das Bessere öfter gezeigt.
      const festesFormat = i < TT_LISTE.length ? KONTO_FORMAT[KONTO.toLowerCase()] : null;
      const lieblingOk = LIEBLING && !OHNE.includes(LIEBLING) ? LIEBLING : null;
      // Gewinner-Fortsetzung zuerst: ging ein Video dieses Kontos ab, kommt jetzt "TEIL 2" mit dem passenden Folge-Szenario.
      const fortsetzung = i < TT_LISTE.length ? fortsetzungFuer(KONTO, POSTS, BANK, { verwendet: verlauf.bank || [], fortgesetzt: verlauf.fortgesetzt || [], erlaubt: (e) => laeuftGerade(e, saisonHeute()) }) : null;
      if (fortsetzung) {
        verlauf.fortgesetzt = [...(verlauf.fortgesetzt || []), fortsetzung.vorbild.id].slice(-200);
        console.log(`[100-fakten-kanal] 🔥 Gewinner (${fortsetzung.aufrufe} Aufrufe): "${fortsetzung.vorbild.titel}" -> Teil 2 "${fortsetzung.eintrag.titel}" auf ${KONTO}`);
      }
      const eintrag = fortsetzung?.eintrag || bankNaechster(verlauf.bank, i < TT_LISTE.length ? nische : [], festesFormat || (lieblingOk && (tag + i) % 2 === 0 ? lieblingOk : null), { ohne: OHNE, saison: saisonHeute() });
      if (eintrag) {
        skript = ({ quiz: quizAus, mythos: mythosAus, waswaere: waswaereAus }[eintrag.typ])(eintrag, eintrag.kat, nr);
        format = `${eintrag.typ}/Faktenliste ${eintrag.id}`;
        verlauf.bank = [...(verlauf.bank || []), eintrag.id];
      }
      for (let v = 0; v < 3 && !skript; v++) {
        // Die kostenlose KI drosselt schnelle Folgeanfragen: vor jedem neuen Versuch kurz warten.
        if (v > 0) await new Promise((r) => setTimeout(r, Number(process.env.FAKTEN_PAUSE_MS ?? 20000) * v));
        // Erst das feste Format des Kontos (z. B. "Was wäre wenn?"), danach im Wechsel.
        format = v === 0 && festesFormat && liste.includes(festesFormat) ? festesFormat : liste[(tag * ANZAHL + i + v) % liste.length];
        const schreiben = { fakt: skriptSchreiben, quiz: quizSchreiben, mythos: mythosSchreiben, waswaere: waswaereSchreiben }[format];
        try {
          skript = await schreiben(kategorie, nr, verlauf.fakten);
          if (umstritten(skript)) { console.log(`[100-fakten-kanal] ${format}-Skript verworfen (strittiger Rekord-Fakt) - neuer Versuch`); skript = undefined; }
          else if (echo(skript)) { console.log(`[100-fakten-kanal] ${format}-Skript verworfen (Anweisung als Titel abgeschrieben: "${String(skript.titel).slice(0, 50)}") - neuer Versuch`); skript = undefined; }
          else if (doppelt(skript, verlauf.fakten)) { console.log(`[100-fakten-kanal] ${format}-Skript verworfen (Thema schon gehabt: "${String(skript.titel).slice(0, 50)}") - neuer Versuch`); skript = undefined; }
        } catch (err) { console.log(`[100-fakten-kanal] ${format}-Skript verworfen (${String(err.message).slice(0, 80)}) - neuer Versuch`); }
      }
      if (!skript) throw new Error('3 Skripte unbrauchbar');
      // Endlos-Schleife: das letzte Bild ist das erste - das Video geht nahtlos von vorn los (mehr Sehdauer).
      const letzte = skript.szenen.at(-1);
      if (letzte && skript.szenen[0]?.bild) letzte.bild = skript.szenen[0].bild;
      // Serie pro TikTok-Konto: "WELTALL-QUIZ #7" oben (ohne extra #-Abzeichen, das den Text verdeckte), am Ende "Folge für Teil 8!".
      let teil = 0;
      if (i < TT_LISTE.length) {
        teil = ((verlauf.serien || {})[KONTO] || 0) + 1;
        skript.hook = serienHook(eintrag?.kat || nische[0] || kategorie, /^(mythos|waswaere)/.exec(format)?.[1] || 'quiz', teil);
        // Hook = das konkrete Thema groß in Sekunde 1 ("TEIL 12: STURZ INS SCHWARZE LOCH") statt nur der Serien-Name.
        const thema = String(eintrag?.titel || skript.titel || '').replace(/^#\d+:\s*/, '');
        if (/^waswaere/.test(format) && thema) skript.hook = `Teil ${teil}: ${thema}`;
        if (fortsetzung) {
          skript.hook = `Teil 2: ${fortsetzung.vorbild.titel}`;
          skript.caption = `Teil 2, weil ihr Teil 1 so gefeiert habt 🔥 ${skript.caption}`;
          if (letzte) letzte.text = 'Folge, damit du Teil 3 nicht verpasst! Antworte in einem Wort: krass oder krasser?';
        }
        if (letzte && /^Folge für [^!]*!/.test(letzte.text)) letzte.text = letzte.text.replace(/^Folge für [^!]*!/, `Folge für Teil ${teil + 1}!`);
        // TikTok-Trend "31 Days of Halloween": im Oktober nummeriert nach Kalendertag ("GRUSEL-OKTOBER 16/31").
        if (eintrag?.saison === 'halloween' && !fortsetzung) {
          const tagImMonat = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date()).slice(8, 10));
          skript.hook = `Grusel ${tagImMonat}/31: ${String(eintrag.titel || '')}`;
          if (letzte) letzte.text = 'Folge für mehr Grusel! Gruselig oder krass? Antworte in einem Wort!';
        }
      }
      // Echte Video-Clips statt Standbild - ohne Schlüssel (Wikimedia Commons gemeinfrei, NASA bei Weltall; Pexels falls
      // PEXELS_API_KEY gesetzt). FAKTEN_CLIPS=aus schaltet ab.
      // Weltall: echte NASA-Aufnahmen. Alles andere: echte KI-Clips (Bild-zu-Video) statt Archiv-Clips.
      const weltall = /weltall/i.test(eintrag?.kat || kategorie);
      const clips = /^(0|nein|aus|false)$/i.test(env('FAKTEN_CLIPS', 'an')) || !weltall ? null : { weltall, ohneMenschen: true, quellen: ['pexels', 'nasa'] }; // Weltall: nur NASA, kein Archiv-Zufall (ein Hockey-Clip für "empty astronaut helmet")
      if (/weltall/i.test(eintrag?.kat || kategorie)) for (const sz of skript.szenen) delete sz.ohneClip;
      // Eigener Gratis-Clip (per Hand in Kling/Bing/Flow gemacht, in eigene-clips/ hochgeladen) als Hook - jeder nur einmal.
      const eigener = i < TT_LISTE.length ? eigenenClipWaehlen(eigeneClipDateien(), `${eintrag?.titel || skript.titel} ${eintrag?.frage || ''} ${skript.szenen[0]?.bild || ''}`, verlauf.eigeneClips || []) : null;
      if (eigener && skript.szenen[0]) {
        skript.szenen[0].video = clipPfad(eigener);
        skript.szenen[0].videoQuelle = 'eigen';
        verlauf.eigeneClips = [...(verlauf.eigeneClips || []), eigener];
        console.log(`[100-fakten-kanal] 🎬 eigener Clip als Hook: ${eigener}`);
      }
      const v = await videoBauen(skript, join(OUT, `fakt-${i}`), { format: 'hoch', hook: skript.hook, premium: true, sprache: 'de', stil: 'cinematic, photorealistic, dramatic lighting', stockClips: clips, kiClips: true });
      if (moderatorinAn() && v.stimme) {
        try { await moderatorinEinfuegen(v.pfad, v.stimme, MODERATORIN_NR); } catch (err) { console.log(`[100-fakten-kanal] Moderatorin fehlgeschlagen: ${String(err.message).slice(0, 150)}`); }
      }
      const basis = `${new Date().toISOString().slice(0, 10)}-fakt-${nr}-${slug(skript.titel.replace(/^(Fakt )?#\d+:\s*/, ''))}`;
      copyFileSync(v.pfad, join(OUT, 'videos', `${basis}.mp4`));
      const vorschau = v.vorschau ? `${basis}.jpg` : '';
      if (vorschau) copyFileSync(v.vorschau, join(OUT, 'videos', vorschau));
      // Echte NASA-Aufnahmen im Video? Dann ehrlich nennen - und es ist ein starker Hook (gemeinfrei, keine Werbung für NASA).
      const nasa = skript.szenen.some((sz) => sz.videoQuelle === 'NASA');
      if (nasa) skript.caption = `🚀 Echte NASA-Aufnahmen! ${skript.caption}`.replace(/(\n|$)/, ' (Videomaterial: NASA)$1');
      manifest.push({ datei: `${basis}.mp4`, vorschau, sprache: 'de', kanal: 'fakten', titel: skript.titel, konto: KONTO, tiktok: i < TT_LISTE.length, caption: `${skript.caption}\n\n${i < TT_LISTE.length ? `Tag ${streakTag(Date.now(), env('FAKTEN_START', '2026-10-07'))} von 100 🔥 Folge ${KONTO}! ${querverweis(KONTO, TIKTOK_KONTEN, NISCHEN, tag)}`.trim() : `Folge ${KONTO} für täglich neue Fakten!`}`, thema: kategorie, format: 'hoch', dauer: Math.round(v.dauer), szenen: v.szenen });
      verlauf.nr = nr;
      if (teil) verlauf.serien = { ...(verlauf.serien || {}), [KONTO]: teil };
      verlauf.fakten = [...verlauf.fakten, skript.fakt].slice(-500);
      console.log(`[100-fakten-kanal] ✓ ${basis}.mp4 (${format}, ${kategorie}, ${Math.round(v.dauer)} s, ${Math.round((Date.now() - start) / 1000)} s Bauzeit)`);
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
