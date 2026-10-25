// NACHTWERK-Bot-Netzwerk: Die Seite /nachtwerk/bots.html öffnet ein vorausgefülltes GitHub-Issue (Label "video-bot")
// mit einem JSON-Auftrag. Der Workflow nachtwerk-bots.yml liest ihn hier aus und startet damit das Ziya Studio.
// Alles wird geprüft und begrenzt - der Issue-Text ist Eingabe von außen.
import { themenHinweis } from './themenRadar.mjs';

const PRESETS = ['anime-kampf', 'dolly-in', 'dolly-out', 'crash-zoom', 'orbit', 'fpv', 'crane-up', 'bullet-time', 'handheld', 'zeitlupe', 'grusel'];
const STILE = ['kino', 'cartoon', 'anime'];
const zahl = (x, min, max, std) => { const n = Number(x); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : std; };
const text = (x, n) => String(x ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const jaNein = (x, std) => (typeof x === 'boolean' ? x : std);

export function auftragAusIssue(body, bots) {
  const block = String(body || '').match(/```(?:json)?\s*([\s\S]*?)```/);
  let roh;
  try { roh = JSON.parse(block ? block[1] : body); } catch { throw new Error('Kein gültiger Auftrag gefunden (JSON-Block fehlt oder ist kaputt).'); }
  const bot = bots.find((b) => b.id === roh.bot) || bots[0];
  const idee = text(roh.idee, 400);
  if (idee.length < 5) throw new Error('Die Idee fehlt oder ist zu kurz.');
  const geschichte = jaNein(roh.geschichte, bot.geschichte);
  return {
    bot: bot.id, idee,
    preset: PRESETS.includes(roh.preset) ? roh.preset : bot.preset,
    stil: STILE.includes(roh.stil) ? roh.stil : bot.stil,
    shots: String(Math.round(zahl(roh.shots, 1, 18, bot.shots))),
    sekunden: String(zahl(roh.sekunden, 2, 5, 3.5)),
    geschichte,
    menschen: jaNein(roh.menschen, geschichte || bot.preset === 'anime-kampf'),
    durchgehend: jaNein(roh.durchgehend, !geschichte),
    loop: jaNein(roh.loop, false),
    krass: jaNein(roh.krass, true),
    text: text(roh.text, 600),
    hook: text(roh.hook, 60) || HOOKS[bot.id] || '',
  };
}

// Tages-Bot: zwei Videos am Tag (nachts und nachmittags), jedes Mal ist der nächste Bot dran (reihum nach
// Halbtag im Jahr) und denkt sich selbst eine Idee aus. tag = Nummer des Halbtags (auch für die Ideenliste).
export function tagesBot(bots, datum = new Date()) {
  const tag = Math.floor((datum - new Date(Date.UTC(datum.getUTCFullYear(), 0, 0))) / 86400000) * 2 + (datum.getUTCHours() >= 12 ? 1 : 0);
  return { bot: bots[tag % bots.length], tag };
}

// Tagesvideos sind länger als bestellte: mindestens 14 Szenen à 4 s (~50 s mit Hook und Abspann).
export const TAGES_LAENGE = { shots: 14, sekunden: 4 };

// Serie: die letzte Folge des Bots aus den Tagesvideo-Issues (neueste zuerst, wie gh issue list sie liefert).
export function letzteFolge(issues, bot) {
  for (const i of Array.isArray(issues) ? issues : []) {
    if (!String(i?.title || '').includes(bot.name)) continue;
    const idee = String(i.body || '').match(/\*\*Idee:\*\*\s*(.+)/)?.[1];
    if (!idee) continue;
    const folge = Number(String(i.body).match(/\*\*Folge:\*\*\s*(\d+)/)?.[1]) || 1;
    return { idee: text(idee, 400), folge };
  }
  return null;
}

export const ideePrompt = (bot, vorher = null, themen = []) => `${vorher
    ? `Write the NEXT episode (part ${vorher.folge + 1}) of an ongoing short video series for the "${bot.name}" channel (${bot.text}).
Previous episode: "${vorher.idee}". Keep the same main characters and world, continue the story with a new, bigger escalation or twist.`
    : `Invent ONE fresh, original idea for a short vertical AI video for the "${bot.name}" channel (${bot.text}).`}
Style example: "${bot.beispiel}".${themenHinweis(themen)}
Rules: original characters only (no existing movie, series, game or anime characters, no
celebrities, no brands), visually spectacular, lots of movement, one sentence in English, max 30 words.
Also write a short German hook line for the first 2 seconds (max 6 words, a question or a shock, no hashtags, no emojis),
e.g. "Wer gewinnt diesen Kampf?" or "Das hätte niemand erwartet...".
Also write a German narrator text for the video ("sprecher": 2-3 short, dramatic sentences, max 30 words, no emojis)
and a German TikTok caption ("beschreibung": one catchy sentence plus 4-6 fitting hashtags, max 150 characters)
plus the same caption in English ("beschreibung_en").
Answer ONLY with JSON: {"idee":"...","hook":"...","sprecher":"...","beschreibung":"...","beschreibung_en":"..."}`;

// Fester Hook je Bot, falls die KI keinen liefert - kurze Frage/Schock-Zeile für die ersten 2 Sekunden.
export const HOOKS = { grusel: 'Schau nicht allein...', cartoon: 'Das endet anders als gedacht', anime: 'Wer gewinnt diesen Kampf?',
  kino: 'Das hätte niemand überlebt', welt: 'Das ist wirklich passiert?', drache: 'Der Drache ist erwacht', tier: 'Niemand hat damit gerechnet' };

const ohneDeko = (x, n) => text(x, n + 40).replace(/#\S+/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim().slice(0, n);

// TikTok-Beschreibung: immer mit #KI bzw. #AI (KI-Inhalt offen kennzeichnen), keine fremden Marken nötig.
export function beschreibungBauen(roh, hook, bot, { englisch = false } = {}) {
  const marke = englisch ? '#AI' : '#KI';
  let b = text(roh, 200);
  if (b.length < 10) b = englisch ? `Wait for the end... #${bot.id} #animation #fyp` : `${hook} #${bot.id} #animation #fyp`;
  if (!new RegExp(`${marke}\\b`, 'i').test(b)) b += ` ${marke}`;
  return b.slice(0, 220);
}

// Idee von der Gratis-KI; klappt das nicht, eine der festen Ideen des Bots (reihum).
// Sprechertext nur für Bots ohne Geschichte - Geschichten bringen ihren Erzähler selbst mit.
// vorher (letzteFolge): die KI schreibt die nächste Folge mit denselben Figuren - "Teil N" im Hook und im TikTok-Text.
export async function tagesIdee(bot, tag, kiJson, vorher = null, themen = []) {
  const ersatz = HOOKS[bot.id] || 'Warte bis zum Ende...';
  try {
    const antwort = await kiJson(ideePrompt(bot, vorher, themen), { maxTokens: 500 });
    const idee = text(antwort?.idee, 400);
    const hook = ohneDeko(antwort?.hook, 60);
    const folge = vorher ? vorher.folge + 1 : 1;
    const teil = folge > 1 ? `Teil ${folge}: ` : '';
    const fertigerHook = `${teil}${hook.length >= 4 ? hook : ersatz}`.slice(0, 60);
    const sprecher = bot.geschichte ? '' : ohneDeko(antwort?.sprecher, 300);
    const beschreibung = beschreibungBauen(folge > 1 ? `(Teil ${folge}) ${text(antwort?.beschreibung, 200)}` : antwort?.beschreibung, fertigerHook, bot);
    const beschreibungEn = beschreibungBauen(folge > 1 ? `(Part ${folge}) ${text(antwort?.beschreibung_en, 200)}` : antwort?.beschreibung_en, fertigerHook, bot, { englisch: true });
    if (idee.length >= 15) return { idee, hook: fertigerHook, sprecher, beschreibung, beschreibungEn, folge, quelle: 'ki' };
    console.log(`[tages-bot] KI-Idee unbrauchbar: ${JSON.stringify(antwort).slice(0, 200)}`);
  } catch (err) { console.log(`[tages-bot] KI-Idee fehlgeschlagen: ${String(err?.message || err).slice(0, 200)}`); }
  // Ohne KI keine echte Fortsetzung möglich - dann startet eine neue Geschichte (Folge 1).
  const liste = bot.ideen?.length ? bot.ideen : [bot.beispiel];
  return { idee: liste[tag % liste.length], hook: ersatz, sprecher: '', beschreibung: beschreibungBauen('', ersatz, bot), beschreibungEn: beschreibungBauen('', ersatz, bot, { englisch: true }), folge: 1, quelle: 'liste' };
}
