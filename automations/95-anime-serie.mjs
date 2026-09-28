// Anime-Serie (#95) - jeden Tag eine neue Folge einer eigenen Anime-Serie,
// komplett ohne API-Key: KI schreibt Folge fuer Folge weiter (Serien-Bibel mit
// Figuren und bisherigen Folgen in anime-serie/serie.json), Pollinations malt
// die Bilder im Anime-Stil, edge-tts spricht Erzaehler und jede Figur mit eigener
// Stimme, ffmpeg schneidet. Nur eigene, originale Figuren - keine geschuetzten
// Figuren oder Namen bestehender Serien (sonst Sperre/Urheberrecht).
//   node automations/95-anime-serie.mjs   -> naechste Folge nach out/ bauen
// Danach uebernimmt 94-video-fabrik.mjs --feed/--metricool das Veroeffentlichen.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { videoBauen } from './lib/videoFabrik.mjs';
import { kiText, kiJson, szenenRetten } from './lib/kiJson.mjs';

const OUT = 'out';
const SERIE = 'anime-serie/serie.json';
const env = (k, d = '') => (process.env[k] || d).trim();

const MINUTEN = Math.min(Math.max(parseFloat(env('ANIME_MINUTEN', '4')) || 4, 1), 30);
const FORMAT = env('ANIME_FORMAT', 'quer') === 'hoch' ? 'hoch' : 'quer';
const NEU = env('ANIME_NEU').toLowerCase() === 'ja';
const THEMA = env('ANIME_THEMA') || 'Ninja-Abenteuer: junge Ninjas in einem verborgenen Bergdorf, Freundschaft, Rivalitaet, hartes Training, geheimnisvolle Kraefte und ein uralter Feind';
// Stil steht VORNE im Bild-Prompt (sonst malt das Modell halb-realistisch) und nochmal hinten.
const STIL_VORNE = 'masterpiece 2D anime illustration, anime screencap, cel shading, clean bold lineart, flat vibrant colors';
const STIL = env('ANIME_STIL') || 'japanese anime art style, detailed anime key visual, dramatic lighting, not photorealistic, not a 3d render, no text, no watermark';

const ERZAEHLER = 'de-DE-FlorianMultilingualNeural';
const STIMMEN = {
  m: ['de-DE-ConradNeural', 'de-DE-KillianNeural', 'de-AT-JonasNeural', 'de-CH-JanNeural'],
  w: ['de-DE-AmalaNeural', 'de-DE-KatjaNeural', 'de-AT-IngridNeural', 'de-CH-LeniNeural', 'de-DE-SeraphinaMultilingualNeural'],
};

// Leichte Tonhoehen-Unterschiede, damit jede Figur unverwechselbar klingt.
const TONHOEHEN = ['+0Hz', '+6Hz', '-5Hz', '+10Hz', '-8Hz'];

// Namen/Begriffe bestehender Serien fliegen raus - die Serie muss original sein.
const GESCHUETZT = /\b(naruto|sasuke|sakura haruno|kakashi|hokage|konoha(gakure)?|akatsuki|sharingan|rinnegan|byakugan|rasengan|chidori|uchiha|uzumaki|hyuga|hinata|itachi|boruto|jiraiya|orochimaru|kurama|goku|vegeta|luffy|zoro|pikachu|pok[eé]mon|one piece|dragon ball|bleach|ichigo|demon slayer|tanjiro|jujutsu|gojo|attack on titan|eren jaeger)\b/gi;
const sauber = (t, max = 600) => String(t || '').replace(GESCHUETZT, '').replace(/\s+/g, ' ').trim().slice(0, max);
const REGELN = 'Die Serie ist komplett ORIGINAL: erfinde eigene Figuren, Orte, Techniken und Namen. Keine Figuren, Namen, Orte, Techniken oder Anspielungen aus bestehenden Animes/Mangas (z. B. nichts aus Naruto, One Piece, Dragon Ball). Jugendfrei: Kaempfe ja, aber kein Blut, keine Brutalitaet.';

const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'folge';

async function serieAnlegen() {
  const d = await kiJson(
    `Erfinde eine neue Anime-Serie auf Deutsch. Thema: ${THEMA}. ${REGELN} ` +
      'Erfinde 4 bis 6 Hauptfiguren mit einpraegsamen, eigenen japanisch klingenden Namen. "aussehen" ist eine ENGLISCHE, sehr konkrete Bildbeschreibung (Haarfarbe und Frisur, Augenfarbe, Kleidung mit Farben, besondere Merkmale), damit die Figur auf jedem Bild gleich aussieht. ' +
      'Antworte NUR mit JSON: {"titel":"Serientitel","logline":"1 Satz","welt":"2-3 Saetze zur Welt","figuren":[{"name":"...","geschlecht":"m oder w","rolle":"Held/Rivale/Mentor/...","art":"Charakter in 1 Satz","aussehen":"english visual description"}]}',
    { maxTokens: 1800 }
  );
  const zaehler = { m: 0, w: 0 };
  const figuren = (Array.isArray(d.figuren) ? d.figuren : [])
    .map((f) => {
      const g = geschlecht(f);
      const n = zaehler[g]++;
      return { name: sauber(f.name, 40), geschlecht: g, rolle: sauber(f.rolle, 60), art: sauber(f.art, 200), aussehen: sauber(f.aussehen, 300), stimme: STIMMEN[g][n % STIMMEN[g].length], tonhoehe: TONHOEHEN[n % TONHOEHEN.length] };
    })
    .filter((f) => f.name.length > 1 && f.aussehen.length > 10)
    .slice(0, 6);
  const titel = sauber(d.titel, 80);
  if (!titel || figuren.length < 2) throw new Error('Serien-Bibel unbrauchbar');
  await looksAufEnglisch(figuren);
  return { titel, logline: sauber(d.logline, 300), welt: sauber(d.welt, 600), figuren, folgen: [], erstellt: new Date().toISOString() };
}

function geschlecht(f) {
  const roh = String(f.geschlecht || '').toLowerCase().trim();
  if (/^(w|f)\b|weib|female|frau|m(ae|ä)dchen|girl/.test(roh)) return 'w';
  if (/^m\b|m(ae|ä)nn|^male|junge|boy/.test(roh)) return 'm';
  return /\b(sie|ihr|ihre|she|her)\b/i.test(`${f.aussehen} ${f.art}`) ? 'w' : 'm';
}

// Das Bildmodell versteht Englisch am besten - deutsche Beschreibungen werden uebersetzt.
async function looksAufEnglisch(figuren) {
  if (!figuren.some((f) => /\b(hat|und|mit|trägt|traegt|sie|seine|ihre|Haar)\b/.test(f.aussehen))) return;
  try {
    const d = await kiJson(`Translate these anime character descriptions to concise English image-prompt text (hair, eyes, outfit, colors). Answer ONLY with JSON: {"looks":["..."]} in the same order.\n${JSON.stringify(figuren.map((f) => f.aussehen))}`, { maxTokens: 1200 });
    if (Array.isArray(d.looks) && d.looks.length === figuren.length) d.looks.forEach((l, i) => { if (String(l).trim().length > 10) figuren[i].aussehen = sauber(l, 300); });
  } catch {
    /* deutsche Beschreibung behalten */
  }
}

function figurenText(serie) {
  return serie.figuren.map((f) => `${f.name} (${f.rolle}; ${f.art})`).join('; ');
}

// Bild-Prompt mit dem festen Aussehen aller Figuren, die in der Szene vorkommen.
function bildPrompt(serie, bild, sprecher) {
  const drin = serie.figuren.filter((f) => f.name === sprecher || bild.toLowerCase().includes(f.name.toLowerCase()));
  const looks = drin.map((f) => `${f.name}: ${f.aussehen}`).join('; ');
  return `${STIL_VORNE}, ${bild}${looks ? `. Characters: ${looks}` : ''}`.slice(0, 900);
}

function szenenPruefen(serie, roh) {
  const namen = new Map(serie.figuren.map((f) => [f.name.toLowerCase(), f]));
  return (Array.isArray(roh) ? roh : [])
    .map((s) => {
      const figur = namen.get(String(s.sprecher || '').trim().toLowerCase());
      const text = sauber(s.text, 400);
      const bild = sauber(s.bild, 400);
      return figur
        ? { text, bild: bildPrompt(serie, bild, figur.name), stimme: figur.stimme, tonhoehe: figur.tonhoehe || '', schild: figur.name, sprecher: figur.name }
        : { text, bild: bildPrompt(serie, bild), stimme: ERZAEHLER, tempo: '-5%', sprecher: 'Erzaehler' };
    })
    .filter((s) => s.text.length > 3 && s.bild.length > 5);
}

async function portion(serie, prompt) {
  try {
    return szenenPruefen(serie, (await kiJson(prompt, { maxTokens: 2500 })).szenen);
  } catch {
    try {
      return szenenPruefen(serie, szenenRetten(await kiText(prompt, { maxTokens: 2500 })));
    } catch {
      return [];
    }
  }
}

async function korrektur(szenen) {
  try {
    const d = await kiJson(
      'Du bist Lektorin einer deutschen Anime-Synchronisation. Korrigiere Rechtschreibung und Grammatik dieser Zeilen, ersetze erfundene Unsinnswoerter und englische Saetze durch natuerliches Deutsch. Inhalt, Sprecher und Laenge beibehalten. ' +
        `Antworte NUR mit JSON: {"saetze":["..."]} in derselben Reihenfolge.\n${JSON.stringify(szenen.map((s) => s.text))}`,
      { maxTokens: 1500 }
    );
    const saetze = Array.isArray(d.saetze) ? d.saetze : [];
    if (saetze.length === szenen.length) saetze.forEach((t, i) => { if (typeof t === 'string' && t.trim().length > 3) szenen[i].text = sauber(t, 400); });
  } catch {
    /* Original behalten */
  }
}

async function folgeSchreiben(serie) {
  const nr = serie.folgen.length + 1;
  const vorher = serie.folgen.slice(-4).map((f) => `Folge ${f.nr} "${f.titel}": ${f.zusammenfassung}`).join('\n') || 'Noch keine - das ist die allererste Folge: stelle Welt und Held vor.';
  const plan = await kiJson(
    `Anime-Serie "${serie.titel}". ${serie.logline} Welt: ${serie.welt} Figuren: ${figurenText(serie)}.\nBisherige Folgen:\n${vorher}\n` +
      `Plane Folge ${nr} (ca. ${MINUTEN} Minuten). Erzaehle die Geschichte logisch weiter, mit Action, Gefuehl und Humor, und ende mit einem Cliffhanger. ${REGELN} ` +
      'Antworte NUR mit JSON: {"titel":"Folgentitel","zusammenfassung":"3-4 Saetze, was passiert","akte":["Akt 1 in 1-2 Saetzen","..."]} mit 4 bis 6 Akten.',
    { maxTokens: 1200 }
  );
  const zusammenfassung = sauber(plan.zusammenfassung || plan.summary || plan.inhalt, 800);
  const akte = (Array.isArray(plan.akte) ? plan.akte : Array.isArray(plan.acts) ? plan.acts : []).map((a) => sauber(typeof a === 'string' ? a : a?.text || a?.inhalt || JSON.stringify(a), 300)).filter(Boolean).slice(0, 6);
  let titel = sauber(plan.titel || plan.title || plan.folgentitel || plan.name, 60);
  if (!titel || /^folge\s*\d+$/i.test(titel)) {
    titel = sauber((await kiText(`Gib dieser Anime-Folge einen packenden deutschen Titel mit 2 bis 5 Woertern. Nur den Titel, ohne Anfuehrungszeichen.\n${zusammenfassung || akte.join(' ')}`, { maxTokens: 40 })).split('\n')[0].replace(/["„“*]/g, ''), 60) || `Kapitel ${nr}`;
  }
  if (!akte.length) throw new Error('Keine Akte erhalten');
  const ziel = Math.round((MINUTEN * 60) / 9);
  const proAkt = Math.max(4, Math.round(ziel / akte.length));
  const namen = serie.figuren.map((f) => f.name).join(', ');
  const szenen = [];
  for (const [ai, akt] of akte.entries()) {
    const imAkt = [];
    for (let versuch = 0; imAkt.length < proAkt && versuch < Math.ceil(proAkt / 6) + 2; versuch++) {
      const n = Math.min(6, proAkt - imAkt.length);
      const bisher = [...szenen, ...imAkt].slice(-8).map((s) => `${s.sprecher}: ${s.text}`).join(' | ');
      const ablauf = akte.map((a, j) => `${j + 1}) ${a}${j === ai ? '  <- DIESER AKT' : j < ai ? ' (schon erzaehlt)' : ' (kommt spaeter)'}`).join('\n');
      imAkt.push(...(await portion(serie,
        `Anime-Serie "${serie.titel}", Folge ${nr} "${titel}". Ablauf der Folge:\n${ablauf}\nSchreibe NUR Akt ${ai + 1}: ${akt} - bereits Erzaehltes nicht wiederholen, nichts aus spaeteren Akten vorwegnehmen.\n` +
          `${bisher ? `Zuletzt (nahtlos weiter, nichts wiederholen): ${bisher}\n` : ''}` +
          `Schreibe die naechsten ${n} Szenen wie eine deutsche Anime-Synchronisation: abwechselnd Erzaehler und Dialoge der Figuren (${namen}). Pro Szene 1-2 kurze, lebendige Saetze auf Deutsch, fehlerfrei. ${ai === akte.length - 1 ? 'Letzter Akt: ende mit einem Cliffhanger.' : 'Die Folge ist hier NICHT zu Ende.'} ` +
          '"sprecher" ist "Erzaehler" oder genau ein Figurenname. "bild" ist ein ENGLISCHER Bild-Prompt der Szene, nenne darin die Namen der sichtbaren Figuren, Ort, Pose, Kamerawinkel. ' +
          'Antworte NUR mit JSON: {"szenen":[{"sprecher":"...","text":"...","bild":"..."}]}'
      )).slice(0, n));
    }
    await korrektur(imAkt);
    console.log(`[95-anime-serie] Akt ${ai + 1}: ${imAkt.length}/${proAkt} Szenen`);
    szenen.push(...imAkt);
  }
  if (szenen.length < Math.max(6, ziel * 0.4)) throw new Error(`Zu wenige Szenen (${szenen.length}/${ziel})`);
  const gruppe = serie.figuren.slice(0, 3).map((f) => `${f.name}: ${f.aussehen}`).join('; ');
  szenen.unshift({ text: `${serie.titel}. Folge ${nr}: ${titel}.`, bild: `${STIL_VORNE}, epic anime title key visual, group shot of the main characters standing together, ${gruppe}`.slice(0, 900), stimme: ERZAEHLER, sprecher: 'Erzaehler' });
  szenen.push({ text: `Wie geht es weiter? Fortsetzung folgt in Folge ${nr + 1}!`, bild: szenen.at(-1).bild, stimme: ERZAEHLER, sprecher: 'Erzaehler' });
  return { nr, titel, zusammenfassung, szenen };
}

async function main() {
  mkdirSync(join(OUT, 'videos'), { recursive: true });
  let serie = !NEU && existsSync(SERIE) ? JSON.parse(readFileSync(SERIE, 'utf8')) : null;
  if (!serie) {
    serie = await serieAnlegen();
    console.log(`[95-anime-serie] Neue Serie "${serie.titel}" mit ${serie.figuren.map((f) => f.name).join(', ')}`);
  }
  const start = Date.now();
  const folge = await folgeSchreiben(serie);
  const hook = `Folge ${folge.nr}: ${folge.titel}`.slice(0, 60);
  const titel = `${serie.titel} – Folge ${folge.nr}: ${folge.titel}`;
  const v = await videoBauen({ titel, hook, szenen: folge.szenen }, join(OUT, 'anime-arbeit'), { format: FORMAT, stimme: ERZAEHLER, stil: STIL, hook });
  const basis = `${new Date().toISOString().slice(0, 10)}-anime-${slug(serie.titel)}-folge-${folge.nr}`;
  copyFileSync(v.pfad, join(OUT, 'videos', `${basis}.mp4`));
  let vorschau = '';
  if (v.vorschau) {
    vorschau = `${basis}.jpg`;
    copyFileSync(v.vorschau, join(OUT, 'videos', vorschau));
  }
  const caption = `${folge.zusammenfassung}\n\n#anime #animeserie #ninja #${slug(serie.titel).replace(/-/g, '')} #folge${folge.nr}`;
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify([{ datei: `${basis}.mp4`, vorschau, sprache: 'de', titel, caption, thema: 'anime', format: FORMAT, dauer: Math.round(v.dauer), szenen: v.szenen }], null, 1));
  serie.folgen.push({ nr: folge.nr, titel: folge.titel, zusammenfassung: folge.zusammenfassung, datum: new Date().toISOString().slice(0, 10) });
  mkdirSync('anime-serie', { recursive: true });
  writeFileSync(SERIE, JSON.stringify(serie, null, 1) + '\n');
  console.log(`[95-anime-serie] ✓ ${basis}.mp4 (${Math.round(v.dauer)} s, ${v.szenen} Szenen, ${Math.round((Date.now() - start) / 1000)} s Bauzeit)`);
}

main().catch((err) => {
  console.error('[95-anime-serie] Fehler:', err.message);
  process.exit(1);
});
