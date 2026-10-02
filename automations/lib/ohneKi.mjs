// Notfall-Skript OHNE KI: Sind alle kostenlosen KI-Dienste weg (Limit, Bezahlschranke), baut die Video-Fabrik
// das Produktvideo aus dem echten Shop-Text - woertliche Saetze aus der Produktbeschreibung, Preis, CTA.
// Nichts wird erfunden; so fallen keine Tagesvideos mehr aus, nur weil eine KI streikt.
import { readFileSync, existsSync } from 'node:fs';
import { reinText } from './shopProdukte.mjs';
import { saisonJetzt } from './saison.mjs';
import { pruefen } from './werbeCheck.mjs';

// Nur Saetze/Fragen, die der Werbe-Check durchlaesst (Shop-Texte und Google-Fragen enthalten oft "Schmerzen").
const werbeSauber = (t) => !pruefen(t).some((x) => x.stufe === 'block');

const UEBERSCHRIFT = /^(warum du (es|ihn|sie) willst|warum du (es|ihn|sie) liebst|highlights|vorteile|details|eigenschaften|so funktioniert'?s|so geht'?s|anwendung|perfekt für)\s*:?\s*/i;
const RAUS = /versand|lieferung|lieferumfang|garantie|rückgabe|rueckgabe|widerruf|hinweis|ersetzt keine|arzt|medizin|\d+\s?(cm|mm|kg|g)\b|https?:/i;

// Saetze aus der Produktbeschreibung, die sich gut sprechen lassen (Reihenfolge wie im Shop).
export function saetzeAus(html) {
  const text = reinText(String(html || '').replace(/<\/(li|p|h\d|div)>/gi, '. ')).replace(/([.!?])(\s*\.)+/g, '$1').split(/\bHinweis:/)[0];
  return text.split(/(?<=[.!?])\s+/).map((s) => s.replace(/^[.\s•\-–]+/, '').replace(UEBERSCHRIFT, '').trim())
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .filter((s, i, l) => s.length >= 18 && s.length <= 170 && !RAUS.test(s) && werbeSauber(s) && l.indexOf(s) === i);
}

const euro = (preis) => (Number(preis) > 0 ? `${Number(preis).toFixed(2).replace('.', ',').replace(',00', '')} Euro` : '');

function suchEintrag(handle, pfad = 'zentrale/daten/suchbegriffe.json') {
  try { return existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')).produkte?.[handle] || null : null; } catch { return null; }
}

const gross = (w) => String(w).split(' ').map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
const stamm = (w) => w.toLowerCase().replace(/(en|er|e|n|s)$/, '').slice(0, 6);

// Viraler Einstieg ohne KI: echte Google-Frage (nur wenn der Shop-Text sie beantwortet), sonst Neugier-Hook im Tageswechsel.
export function einstieg(saetze, wort, fragen = [], tag = Math.floor(Date.now() / 864e5)) {
  for (const f of fragen.filter(werbeSauber)) {
    const kern = f.split(/\s+/).filter((w) => w.length >= 4 && !wort.toLowerCase().includes(w.toLowerCase()));
    const antwort = saetze.find((s) => kern.some((w) => s.toLowerCase().includes(stamm(w))));
    if (kern.length && antwort) return { hook: `${gross(wort)}: ${f.replace(new RegExp(wort, 'i'), '').trim()}?`.replace(/\s+\?/, '?'), antwort };
  }
  const vorlagen = [`3 Dinge, die du über ${gross(wort)} wissen solltest.`, `${gross(wort)} in 30 Sekunden erklärt.`, `${gross(wort)} - so benutzt du es richtig.`, `Kennst du das schon? ${gross(wort)}.`];
  return { hook: vorlagen[tag % vorlagen.length], antwort: '' };
}

// Frage ans Publikum vor dem Schluss - Kommentare bringen Reichweite (und der Kommentar-Agent antwortet).
export const kommentarFrage = (tag = Math.floor(Date.now() / 864e5)) => ['Würdest du das ausprobieren? Schreib ja oder nein in die Kommentare.', 'Welche Frage hast du dazu? Ab in die Kommentare, wir antworten.', 'Wofür würdest du es benutzen? Schreib es in die Kommentare.'][tag % 3];

// KI-Beispiel-Szene (Bildmodell mit dem echten Produktfoto als Vorlage) - funktioniert auch ohne Text-KI.
export const ANWENDUNG = {
  szene: 2, foto: 0,
  prompt: 'realistic smartphone photo, one adult person using the exact product from the reference image the way it is meant to be used, in a typical everyday situation at home or in the office, fully clothed, natural light, product clearly visible',
  schritte: [
    'realistic smartphone photo, one adult person picking up the exact product from the reference image and getting ready to use it, at home, fully clothed, natural light',
    'realistic smartphone photo, the same adult person in the middle of using the exact product from the reference image as intended, at home, fully clothed, natural light, product clearly visible',
    'realistic smartphone photo, the same adult person finishing with the exact product from the reference image, relaxed and smiling, at home, fully clothed, natural light',
  ],
};

function hashtagsFuer(handle, pfad = 'zentrale/daten/suchbegriffe.json') {
  try { return existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')).produkte?.[handle]?.hashtags || [] : []; } catch { return []; }
}

// Liefert dieselbe Struktur wie die KI-Antwort (geht danach durch ausDaten der Fabrik).
export function notfallSkript(p, { such = suchEintrag(p.handle), tags = such?.hashtags || hashtagsFuer(p.handle), tag = Math.floor(Date.now() / 864e5) } = {}) {
  const saetze = saetzeAus(p.body_html);
  const preis = euro(p.variants?.[0]?.price);
  const fotos = Math.max(1, (p.images || []).length);
  const wort = such?.stichwort || String(p.title || '').split(/\s[–—-]\s/)[1]?.split(/\s(?:für|zur|mit|&)\s/)[0] || p.title;
  const { hook, antwort } = einstieg(saetze, wort, such?.fragen || [], tag);
  const kern = [...(antwort ? [antwort] : []), ...saetze.filter((x) => x !== antwort)].slice(0, 4);
  const texte = [hook, ...kern, ...(preis ? [`Gerade für ${preis} im ${p.shopName || 'Shop'}.`] : []), kommentarFrage(tag), 'Alle Infos findest du über den Link in der Bio.'];
  const shopTag = `#${String(p.shopName || '').replace(/[^\p{L}\p{N}]/gu, '')}`;
  return {
    titel: p.title,
    hook,
    caption: `${hook}\n\n${saetze[0] || p.title}\n\n${kommentarFrage(tag)}\n\n${[...tags.slice(0, 4), ...(saisonJetzt()?.tags || []).slice(0, 1), shopTag].filter((t) => t.length > 1).join(' ')}`,
    hintergrund: 'clean minimal room with soft natural daylight, empty, no people, no text',
    anwendung: ANWENDUNG,
    szenen: saetze.length >= 2 ? texte.map((text, i) => ({ text, foto: i % fotos })) : [],
  };
}
