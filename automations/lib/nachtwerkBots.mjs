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
    text: text(roh.text, 600),
  };
}
