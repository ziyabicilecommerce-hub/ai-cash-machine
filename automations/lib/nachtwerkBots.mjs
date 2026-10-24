// NACHTWERK-Bot-Netzwerk: Die Seite /nachtwerk/bots.html öffnet ein vorausgefülltes GitHub-Issue (Label "video-bot")
// mit einem JSON-Auftrag. Der Workflow nachtwerk-bots.yml liest ihn hier aus und startet damit das Ziya Studio.
// Alles wird geprüft und begrenzt - der Issue-Text ist Eingabe von außen.
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

// Tages-Bot: jeden Tag ist ein anderer Bot dran (reihum nach Tag im Jahr) und denkt sich selbst eine Idee aus.
export function tagesBot(bots, datum = new Date()) {
  const tag = Math.floor((datum - new Date(Date.UTC(datum.getUTCFullYear(), 0, 0))) / 86400000);
  return { bot: bots[tag % bots.length], tag };
}

export const ideePrompt = (bot) => `Invent ONE fresh, original idea for a short vertical AI video for the "${bot.name}" channel (${bot.text}).
Style example: "${bot.beispiel}". Rules: original characters only (no existing movie, series, game or anime characters, no
celebrities, no brands), visually spectacular, lots of movement, one sentence in English, max 30 words.
Also write a short German hook line for the first 2 seconds (max 6 words, a question or a shock, no hashtags, no emojis),
e.g. "Wer gewinnt diesen Kampf?" or "Das hätte niemand erwartet...".
Also write a German narrator text for the video ("sprecher": 2-3 short, dramatic sentences, max 30 words, no emojis)
and a German TikTok caption ("beschreibung": one catchy sentence plus 4-6 fitting hashtags, max 150 characters).
Answer ONLY with JSON: {"idee":"...","hook":"...","sprecher":"...","beschreibung":"..."}`;

// Fester Hook je Bot, falls die KI keinen liefert - kurze Frage/Schock-Zeile für die ersten 2 Sekunden.
export const HOOKS = { grusel: 'Schau nicht allein...', cartoon: 'Das endet anders als gedacht', anime: 'Wer gewinnt diesen Kampf?',
  kino: 'Das hätte niemand überlebt', welt: 'Das ist wirklich passiert?', drache: 'Der Drache ist erwacht', tier: 'Niemand hat damit gerechnet' };

const ohneDeko = (x, n) => text(x, n + 40).replace(/#\S+/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim().slice(0, n);

// TikTok-Beschreibung: immer mit #KI (KI-Inhalt offen kennzeichnen), keine fremden Marken nötig.
export function beschreibungBauen(roh, hook, bot) {
  let b = text(roh, 200);
  if (b.length < 10) b = `${hook} #${bot.id} #animation #fyp`;
  if (!/#ki\b/i.test(b)) b += ' #KI';
  return b.slice(0, 220);
}

// Idee von der Gratis-KI; klappt das nicht, eine der festen Ideen des Bots (reihum).
// Sprechertext nur für Bots ohne Geschichte - Geschichten bringen ihren Erzähler selbst mit.
export async function tagesIdee(bot, tag, kiJson) {
  const ersatz = HOOKS[bot.id] || 'Warte bis zum Ende...';
  try {
    const antwort = await kiJson(ideePrompt(bot), { maxTokens: 500 });
    const idee = text(antwort?.idee, 400);
    const hook = ohneDeko(antwort?.hook, 60);
    const fertigerHook = hook.length >= 4 ? hook : ersatz;
    const sprecher = bot.geschichte ? '' : ohneDeko(antwort?.sprecher, 300);
    if (idee.length >= 15) return { idee, hook: fertigerHook, sprecher, beschreibung: beschreibungBauen(antwort?.beschreibung, fertigerHook, bot), quelle: 'ki' };
  } catch { /* Rückfall */ }
  const liste = bot.ideen?.length ? bot.ideen : [bot.beispiel];
  return { idee: liste[tag % liste.length], hook: ersatz, sprecher: '', beschreibung: beschreibungBauen('', ersatz, bot), quelle: 'liste' };
}
