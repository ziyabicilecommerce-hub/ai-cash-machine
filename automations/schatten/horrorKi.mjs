// Horror-Generator: die (kostenlose) KI schreibt jedes Mal eine NEUE kurze Horror-Geschichte im Videobot-Format.
// Alles wird streng geprüft (Länge, Felder, verbotene Themen) - sonst kommt eine Geschichte aus dem Vorrat.
import { pruefen, ORTE, BOESE } from './videobot.mjs';

// Nichts, was Plattformen sperren oder was echte Menschen betrifft: kein Blut/Gewaltdetail, keine Selbstverletzung,
// keine Kinder in Gefahr, keine echten Personen, Orte oder Marken.
const VERBOTEN = /blut|messer|mord|tötet|leiche|selbstmord|suizid|ritz|vergewalt|droge|waffe|pistole|gewehr|nazi|hitler|terror|amok|instagram|tiktok|youtube|whatsapp|iphone|samsung|netflix/i;

export const BEISPIEL = { titel: 'Zwei Zahnbürsten', ort: 'haus', boesewicht: 'frau', stimme: 'frau',
  hook: 'Ich wohne allein. Heute stehen zwei Zahnbürsten im Glas.',
  saetze: ['Ich denke erst, ich habe eine doppelt gekauft.', 'Dann schreibt meine Nachbarin.', 'Ich schaue zum Fenster. Da ist niemand.', 'Aber im Badezimmer läuft jetzt das Wasser.'],
  absender: 'Nachbarin', nachricht: 'Wer ist die Frau an deinem Fenster?', monster: 'Ich putze nur meine Zähne.',
  ende: 'Die zweite Zahnbürste ist nass. Und sie steht hinter mir.', frage: 'Hättest du ins Bad geschaut?', wahl: ['Ins Bad', 'Raus hier'] };

export function prompt(bekannt = [], zufall = Math.random, { thema = '', inspiration = '' } = {}) {
  const ort = ORTE[Math.floor(zufall() * ORTE.length)], boese = BOESE[Math.floor(zufall() * BOESE.length)];
  const t = String(thema).replace(/["`$<>]/g, '').slice(0, 80), insp = String(inspiration).replace(/["`$<>]/g, '').slice(0, 80);
  return 'Schreibe eine NEUE, originelle, kurze Horror-Geschichte auf Deutsch für ein 25-Sekunden-Video (Ich-Perspektive, Alltag, Gänsehaut, kein Blut, keine Gewaltdetails, keine echten Personen/Marken/Orte, keine Kinder in Gefahr). '
    + (t ? `Aktuelles Thema, um das es gehen soll: ${t}. ` : '') + (insp ? `Nur als Stimmung (NICHT nacherzählen): ${insp}. ` : '')
    + `Ort: ${ort}. Bösewicht: ${boese}. Der Hook (max. 75 Zeichen) besteht aus zwei kurzen Sätzen: erst eine ganz normale Alltagssituation, dann ein unmöglicher Widerspruch dazu - passend zum Thema, in Ich-Form, mit einem konkreten Detail (Uhrzeit, Zahl oder Gegenstand). `
    + 'Genau 4 kurze Sätze (je höchstens 60 Zeichen), dann ein Twist am Ende (höchstens 80 Zeichen), eine Frage an die Zuschauer und zwei Antworten (je höchstens 16 Zeichen). '
    + `Nicht diese Themen wiederholen: ${bekannt.slice(-40).join(', ')}. `
    + 'Erfinde ALLES selbst. Schreibe natürliches, fehlerfreies Deutsch, deutscher Titel. '
    + `Antworte NUR mit JSON in dieser Form (Platzhalter durch eigene Texte ersetzen): ${JSON.stringify(VORLAGE(ort, boese))}`;
}

// Vorlage mit Platzhaltern statt fertiger Geschichte - kleine Modelle schreiben sonst das Beispiel ab
const VORLAGE = (ort, boesewicht) => ({ titel: '<2-4 Wörter>', ort, boesewicht, stimme: 'mann oder frau', hook: '<ein Satz mit Widerspruch, max 75 Zeichen>',
  saetze: ['<Satz 1>', '<Satz 2>', '<Satz 3>', '<Satz 4>'], monster: '<was das Wesen flüstert, max 40 Zeichen>', ende: '<Twist, max 80 Zeichen>',
  frage: '<Frage an die Zuschauer?>', wahl: ['<Antwort 1, max 16 Zeichen>', '<Antwort 2, max 16 Zeichen>'] });
// Wort-Ähnlichkeit zweier Sätze (0-1): Anteil gemeinsamer Wörter ab 3 Buchstaben
const woerter = (t) => new Set(String(t).toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3));
export function aehnlich(a, b) {
  const x = woerter(a), y = woerter(b);
  if (!x.size || !y.size) return 0;
  let gemeinsam = 0; for (const w of x) if (y.has(w)) gemeinsam++;
  return gemeinsam / Math.min(x.size, y.size);
}
// Greift die Geschichte das Thema auf? (ein Wortteil mit 5 Buchstaben aus dem Thema kommt im Text vor)
export function passtZumThema(s, thema = '') {
  // Wortteile mit 5 Buchstaben, damit auch zusammengesetzte Wörter passen ("Novembernebel" -> "nebel")
  const teile = [...woerter(thema)].filter((w) => w.length >= 5).flatMap((w) => Array.from({ length: w.length - 4 }, (_, i) => w.slice(i, i + 5)));
  if (!teile.length) return true;
  const text = [s.hook, ...s.saetze, s.ende].join(' ').toLowerCase();
  return teile.some((w) => text.includes(w));
}

const PLATZHALTER = /<[^>]*>|Satz \d|Antwort \d|Platzhalter/i;
// Wortgrenze statt Abbruch mitten im Wort
const kuerzen = (t, n) => { const x = String(t || '').trim(); return x.length <= n ? x : x.slice(0, n).replace(/\s+\S*$/, '').trim(); };

const kurzGenug = (s, n) => typeof s === 'string' && s.trim().length > 2 && s.trim().length <= n;

// KI-Antwort säubern, kleine Fehler reparieren (Länge, Fragezeichen) und prüfen.
// Gibt das Skript zurück oder null; der Grund steht dann in saeubern.grund (fürs Log).
export function saeubern(roh) {
  const nein = (g) => { saeubern.grund = g; return null; };
  if (!roh || typeof roh !== 'object') return nein('keine JSON-Antwort');
  if (PLATZHALTER.test(JSON.stringify(roh))) return nein('Platzhalter nicht ersetzt');
  if (aehnlich(String(roh.hook || ''), BEISPIEL.hook) >= 0.5) return nein('Beispiel abgeschrieben');
  const saetze = (Array.isArray(roh.saetze) ? roh.saetze : []).map((x) => String(x).trim()).filter((x) => x && x.length <= 90).slice(0, 5);
  let frage = String(roh.frage || '').trim();
  if (frage && !frage.endsWith('?')) frage = `${frage.replace(/[.!]+$/, '')}?`;
  const s = { titel: kuerzen(roh.titel, 50), ort: ORTE.includes(roh.ort) ? roh.ort : 'haus', boesewicht: BOESE.includes(roh.boesewicht) ? roh.boesewicht : 'schatten',
    stimme: roh.stimme === 'frau' ? 'frau' : 'mann', hook: String(roh.hook || '').trim(), saetze, ende: kuerzen(roh.ende, 100), frage: kuerzen(frage, 80),
    wahl: Array.isArray(roh.wahl) ? roh.wahl.slice(0, 2).map((x) => kuerzen(x, 18)) : [] };
  if (roh.nachricht && kurzGenug(roh.nachricht, 90)) { s.nachricht = String(roh.nachricht).trim(); s.absender = String(roh.absender || 'Unbekannt').trim().slice(0, 20); }
  if (roh.monster && kurzGenug(roh.monster, 60)) s.monster = String(roh.monster).trim();
  if (!s.titel) s.titel = kuerzen(s.hook.split(/[.!?]/)[0], 40);
  if (!kurzGenug(s.hook, 80)) return nein(`Hook fehlt oder zu lang (${s.hook.length})`);
  if (s.saetze.length < 3) return nein(`nur ${s.saetze.length} brauchbare Sätze`);
  if (!kurzGenug(s.ende, 100)) return nein('Twist fehlt');
  if (!kurzGenug(s.frage, 80)) return nein('Frage fehlt');
  if (s.wahl.length !== 2 || !s.wahl.every((w) => kurzGenug(w, 18))) return nein('Antworten fehlen');
  if (VERBOTEN.test(JSON.stringify(s))) return nein(`verbotenes Wort: ${JSON.stringify(s).match(VERBOTEN)[0]}`);
  const f = pruefen(s);
  if (f.length) return nein(f.join('; '));
  saeubern.grund = '';
  return s;
}

// Hook-Punkte (0-6) nach den Regeln aus dem Hook-Tester der App - was bei unseren Videos die Leute hält
export function hookPunkte(h = '') {
  return [h.length > 0 && h.length <= 70, /^(ich|mein|meine|um|im|heute|kein)\b/i.test(h), /(aber|trotzdem|nicht|kein|niemand|nur|allein|tot|gibt es)/i.test(h),
    /\d|uhr|nacht|drei/i.test(h), /(handy|nachricht|anruf|kamera|foto|app|chat|klingel)/i.test(h), !/^teil\s*\d/i.test(h) && !/\?$/.test(h)].filter(Boolean).length;
}

// Hook-Wettbewerb: bis zu 3 gültige Geschichten von der KI, die mit dem stärksten Hook gewinnt (mind. 3 von 6 Punkten)
export async function neueGeschichte(kiJson, bekannt = [], { versuche = 3, mindestens = 3, thema = '', inspiration = '', hooks = [] } = {}) {
  const kandidaten = [];
  for (let i = 0; i < versuche; i++) {
    try {
      const s = saeubern(await kiJson(prompt(bekannt, Math.random, { thema, inspiration })));
      if (kiJson.quelle === 'lokal' && !/^(1|ja|an|true)$/i.test(process.env.HORROR_KI_LOKAL || '')) { console.log('[horror-ki] abgelehnt: nur die kleine eigene KI erreichbar - zu holpriges Deutsch (Gemini/Groq-Schlüssel fehlt)'); break; }
      if (!s) console.log(`[horror-ki] abgelehnt: ${saeubern.grund}`);
      else if (bekannt.includes(s.titel)) console.log(`[horror-ki] abgelehnt: Titel schon da (${s.titel})`);
      else if (hooks.some((h) => aehnlich(s.hook, h) >= 0.6)) console.log(`[horror-ki] abgelehnt: Hook zu ähnlich wie ein vorhandener (${s.hook})`);
      else if (!passtZumThema(s, thema)) console.log(`[horror-ki] abgelehnt: Thema „${thema}“ nicht aufgegriffen`);
      else { kandidaten.push(s); console.log(`[horror-ki] Kandidat „${s.titel}“, Hook ${hookPunkte(s.hook)}/6: ${s.hook}`); }
    } catch (e) { console.log(`[horror-ki] ${String(e.message).slice(0, 120)}`); }
    if (kandidaten.some((k) => hookPunkte(k.hook) >= 5)) break;  // schon sehr stark - nicht weiter warten
  }
  const best = kandidaten.sort((a, b) => hookPunkte(b.hook) - hookPunkte(a.hook))[0];
  return best && hookPunkte(best.hook) >= mindestens ? best : null;
}

// KI für Geschichten: zuerst die eigene KI im GitHub-Lauf (Ollama, kein Limit, erzwungenes JSON), sonst die Gratis-Kette.
// (Die allgemeine Kette fragt zuerst Pollinations - ohne Schlüssel gedrosselt, da kamen 0 Geschichten raus.)
export async function geschichtenKi(prompt) {
  const { lokalBereit, kiLokal } = await import('../lib/kiLokal.mjs');
  const { jsonAusText, kiJson, githubModels, githubModelsBereit } = await import('../lib/kiJson.mjs');
  const env = (k) => (process.env[k] || '').trim();
  geschichtenKi.quelle = '';
  // 1. GitHub Models (gratis im Actions-Lauf) - antwortet bei manchen Konten leer, dann weiter
  if (githubModelsBereit()) {
    try { const r = jsonAusText(await githubModels(`${prompt}\nGib nur das JSON zurück.`, 900)); geschichtenKi.quelle = 'github-models'; return r; } catch (e) { console.log(`[horror-ki] GitHub Models: ${String(e.message).slice(0, 120)}`); }
  }
  // 2. starke Gratis-KI mit eigenem Schlüssel (GEMINI_API_KEY oder GROQ_API_KEY als Repo-Secret)
  if (env('GEMINI_API_KEY') || env('GROQ_API_KEY') || env('POLLINATIONS_TOKEN')) {
    try { const r = await kiJson(prompt, { maxTokens: 3000 }); geschichtenKi.quelle = 'stark'; return r; } catch (e) { console.log(`[horror-ki] Gratis-KI: ${String(e.message).slice(0, 120)}`); }
  }
  // 3. eigene kleine KI im Lauf - schreibt holpriges Deutsch, deshalb werden ihre Geschichten nur mit HORROR_KI_LOKAL=an genommen
  if (lokalBereit()) {
    const r = jsonAusText((await kiLokal(prompt, { maxTokens: 1200 })).antwort); geschichtenKi.quelle = 'lokal'; return r;
  }
  throw new Error('keine KI erreichbar');
}
