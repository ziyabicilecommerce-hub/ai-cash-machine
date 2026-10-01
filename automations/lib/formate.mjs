// Video-Formate (bewaehrte Kurzvideo-Muster) + Trend-Radar-Hinweis. Welches Format ein Video bekommt,
// entscheiden die echten Zahlen (leistung.mjs, UCB): neue Formate werden ausprobiert, starke kommen
// oefter dran. Alle Formate sind ehrlich - kein "Ich hab es 30 Tage getestet", keine erfundenen Kunden.
import { readFileSync, existsSync } from 'node:fs';
import { lernstandLaden, waehlen } from './leistung.mjs';
import { suchHinweis } from './suchRadar.mjs';

export const FORMATE = {
  pov: 'Format POV: Szene 1 beginnt mit "POV:" und beschreibt eine typische Alltagssituation der Zielgruppe aus Ich-Sicht.',
  fehler: 'Format "3 Fehler": drei kurze, typische Fehler (je eine Szene), das Produkt ist die ehrliche Loesung fuer den wichtigsten.',
  keinerSagt: 'Format "Das sagt dir keiner": ein wenig bekannter, aber wahrer Fakt zur Situation, dann das Produkt als praktische Hilfe.',
  ranking: 'Format Mini-Ranking: drei Wege zum selben Ziel von "okay" ueber "besser" zu "am bequemsten" - das Produkt ist Platz 1, ohne die anderen schlechtzumachen.',
  mythos: 'Format Mythos oder Fakt: ein verbreiteter Irrtum wird ehrlich aufgeloest, dann zeigt das Produkt den richtigen Weg.',
  check: 'Format Schnell-Check: "Mach mal diesen 5-Sekunden-Check" - eine einfache Selbstpruefung, danach das Produkt.',
  sekunden: 'Format "In 20 Sekunden erklaert": schnelles Tempo, jede Szene ein klarer Nutzen, Zaehler 1-2-3 im gesprochenen Text.',
  detail: 'Format Detail-Nahaufnahme: ruhige Sprache, Material, Haptik und Handgriffe im Mittelpunkt (wie ASMR, aber gesprochen).',
};

export const formateAn = () => !/^(0|nein|aus|false)$/i.test(String(process.env.VIDEO_FORMATE || '').trim());

// Unbekannte Formate reihum (je Produkt und Tag versetzt), danach nach echten Zahlen.
// mitHook: Das Labor gibt den ersten Satz schon vor - dann keine Formate, die Szene 1 selbst festlegen.
export function formatWaehlen(p, { lernstand = lernstandLaden(), tag = Math.floor(Date.now() / 864e5), mitHook = false } = {}) {
  const namen = Object.keys(FORMATE).filter((n) => !(mitHook && ['pov', 'check'].includes(n)));
  const seed = [...String(p?.handle || p?.title || '')].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 9973, tag);
  const name = waehlen(namen, lernstand.format, { seed });
  return { name, anweisung: FORMATE[name] };
}

// Trend-Radar (automations/trend-radar.mjs): nur Trends, die zur Nische passen, und nur als Angebot.
export function trendHinweis(pfad = 'automations/state/trends.json', jetzt = Date.now()) {
  try {
    if (!existsSync(pfad)) return '';
    const t = JSON.parse(readFileSync(pfad, 'utf8'));
    if (!(jetzt - Date.parse(t.stand) < 2 * 864e5) || !t.passend?.length) return '';
    return `Aktuell in Deutschland gefragt: ${t.passend.slice(0, 3).map((x) => `"${x}"`).join(', ')}. Greife das NUR auf, wenn es ehrlich zum Produkt passt - sonst ignorieren. `;
  } catch { return ''; }
}

export const winkelAus = (text) => String(text || '').match(/Kauf-Psychologie: ([^.]+)\./)?.[1]?.trim() || '';

// Baut das Produkt-Skript mit Labor-Winkel + Format + Trend + echten Suchfragen und merkt sich, was benutzt wurde -
// der Poster schreibt es an jeden Post, damit der Leistungs-Sammler es spaeter auswerten kann.
export async function skriptMitFormat(p, winkel, bauer) {
  const f = formateAn() ? formatWaehlen(p, { mitHook: !!winkel }) : { name: '', anweisung: '' };
  const s = await bauer(p, [winkel, f.anweisung, trendHinweis(), suchHinweis(p)].filter(Boolean).join(' '));
  return { ...s, formatName: f.name, winkelName: winkelAus(winkel) };
}
