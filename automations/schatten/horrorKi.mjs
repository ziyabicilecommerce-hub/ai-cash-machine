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

export function prompt(bekannt = [], zufall = Math.random) {
  const ort = ORTE[Math.floor(zufall() * ORTE.length)], boese = BOESE[Math.floor(zufall() * BOESE.length)];
  return 'Schreibe eine NEUE, originelle, kurze Horror-Geschichte auf Deutsch für ein 25-Sekunden-Video (Ich-Perspektive, Alltag, Gänsehaut, kein Blut, keine Gewaltdetails, keine echten Personen/Marken/Orte). '
    + `Ort: ${ort}. Bösewicht: ${boese}. Der Hook ist ein einziger Satz mit Widerspruch (z. B. "Ich wohne allein. Heute stehen zwei Zahnbürsten im Glas."), höchstens 75 Zeichen. `
    + 'Genau 4 kurze Sätze (je höchstens 60 Zeichen), dann ein Twist am Ende (höchstens 80 Zeichen), eine Frage an die Zuschauer und zwei Antworten (je höchstens 16 Zeichen). '
    + `Nicht diese Themen wiederholen: ${bekannt.slice(-40).join(', ')}. `
    + `Antworte NUR mit JSON genau in dieser Form: ${JSON.stringify({ ...BEISPIEL, ort, boesewicht: boese })}`;
}

const kurzGenug = (s, n) => typeof s === 'string' && s.trim().length > 2 && s.trim().length <= n;

// KI-Antwort säubern und prüfen. Gibt das Skript zurück oder null.
export function saeubern(roh) {
  if (!roh || typeof roh !== 'object') return null;
  const s = { titel: String(roh.titel || '').trim().slice(0, 50), ort: ORTE.includes(roh.ort) ? roh.ort : 'haus', boesewicht: BOESE.includes(roh.boesewicht) ? roh.boesewicht : 'schatten',
    stimme: roh.stimme === 'frau' ? 'frau' : 'mann', hook: String(roh.hook || '').trim(), saetze: (Array.isArray(roh.saetze) ? roh.saetze : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 5),
    ende: String(roh.ende || '').trim(), frage: String(roh.frage || '').trim(), wahl: Array.isArray(roh.wahl) ? roh.wahl.slice(0, 2).map((x) => String(x).trim()) : [] };
  if (roh.nachricht && kurzGenug(roh.nachricht, 90)) { s.nachricht = String(roh.nachricht).trim(); s.absender = String(roh.absender || 'Unbekannt').trim().slice(0, 20); }
  if (roh.monster && kurzGenug(roh.monster, 60)) s.monster = String(roh.monster).trim();
  if (!s.titel) s.titel = s.hook.split(/[.!?]/)[0].slice(0, 40);
  const ok = kurzGenug(s.hook, 80) && s.saetze.length >= 3 && s.saetze.every((x) => x.length <= 80) && kurzGenug(s.ende, 100)
    && kurzGenug(s.frage, 80) && s.frage.endsWith('?') && s.wahl.length === 2 && s.wahl.every((w) => kurzGenug(w, 18))
    && !VERBOTEN.test(JSON.stringify(s)) && pruefen(s).length === 0;
  return ok ? s : null;
}

// Hook-Punkte (0-6) nach den Regeln aus dem Hook-Tester der App - was bei unseren Videos die Leute hält
export function hookPunkte(h = '') {
  return [h.length > 0 && h.length <= 70, /^(ich|mein|meine|um|im|heute|kein)\b/i.test(h), /(aber|trotzdem|nicht|kein|niemand|nur|allein|tot|gibt es)/i.test(h),
    /\d|uhr|nacht|drei/i.test(h), /(handy|nachricht|anruf|kamera|foto|app|chat|klingel)/i.test(h), !/^teil\s*\d/i.test(h) && !/\?$/.test(h)].filter(Boolean).length;
}

// Hook-Wettbewerb: bis zu 3 gültige Geschichten von der KI, die mit dem stärksten Hook gewinnt (mind. 3 von 6 Punkten)
export async function neueGeschichte(kiJson, bekannt = [], { versuche = 3, mindestens = 3 } = {}) {
  const kandidaten = [];
  for (let i = 0; i < versuche; i++) {
    try { const s = saeubern(await kiJson(prompt(bekannt))); if (s && !bekannt.includes(s.titel)) kandidaten.push(s); } catch (e) { console.log(`[horror-ki] ${String(e.message).slice(0, 120)}`); }
    if (kandidaten.some((k) => hookPunkte(k.hook) >= 5)) break;  // schon sehr stark - nicht weiter warten
  }
  const best = kandidaten.sort((a, b) => hookPunkte(b.hook) - hookPunkte(a.hook))[0];
  return best && hookPunkte(best.hook) >= mindestens ? best : null;
}
