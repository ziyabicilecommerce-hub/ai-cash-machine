// Notfall-Skript OHNE KI: Sind alle kostenlosen KI-Dienste weg (Limit, Bezahlschranke), baut die Video-Fabrik
// das Produktvideo aus dem echten Shop-Text - woertliche Saetze aus der Produktbeschreibung, Preis, CTA.
// Nichts wird erfunden; so fallen keine Tagesvideos mehr aus, nur weil eine KI streikt.
import { readFileSync, existsSync } from 'node:fs';
import { reinText } from './shopProdukte.mjs';

const UEBERSCHRIFT = /^(warum du (es|ihn|sie) willst|warum du (es|ihn|sie) liebst|highlights|vorteile|details|eigenschaften|so funktioniert'?s|so geht'?s|anwendung|perfekt für)\s*:?\s*/i;
const RAUS = /versand|lieferung|lieferumfang|garantie|rückgabe|rueckgabe|widerruf|hinweis|ersetzt keine|arzt|medizin|\d+\s?(cm|mm|kg|g)\b|https?:/i;

// Saetze aus der Produktbeschreibung, die sich gut sprechen lassen (Reihenfolge wie im Shop).
export function saetzeAus(html) {
  const text = reinText(String(html || '').replace(/<\/(li|p|h\d|div)>/gi, '. ')).replace(/([.!?])(\s*\.)+/g, '$1').split(/\bHinweis:/)[0];
  return text.split(/(?<=[.!?])\s+/).map((s) => s.replace(/^[.\s•\-–]+/, '').replace(UEBERSCHRIFT, '').trim())
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .filter((s, i, l) => s.length >= 18 && s.length <= 170 && !RAUS.test(s) && l.indexOf(s) === i);
}

const euro = (preis) => (Number(preis) > 0 ? `${Number(preis).toFixed(2).replace('.', ',').replace(',00', '')} Euro` : '');

function hashtagsFuer(handle, pfad = 'zentrale/daten/suchbegriffe.json') {
  try { return existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')).produkte?.[handle]?.hashtags || [] : []; } catch { return []; }
}

// Liefert dieselbe Struktur wie die KI-Antwort (geht danach durch ausDaten der Fabrik).
export function notfallSkript(p, { tags = hashtagsFuer(p.handle) } = {}) {
  const saetze = saetzeAus(p.body_html);
  const preis = euro(p.variants?.[0]?.price);
  const fotos = Math.max(1, (p.images || []).length);
  const texte = [...saetze.slice(0, 5), ...(preis ? [`Gerade für ${preis} im ${p.shopName || 'Shop'}.`] : []), 'Alle Infos findest du über den Link in der Bio.'];
  const shopTag = `#${String(p.shopName || '').replace(/[^\p{L}\p{N}]/gu, '')}`;
  return {
    titel: p.title,
    hook: saetze[0] || p.title,
    caption: `${saetze[0] || p.title}\n\n${[...tags.slice(0, 4), shopTag].filter((t) => t.length > 1).join(' ')}`,
    hintergrund: 'clean minimal room with soft natural daylight, empty, no people, no text',
    szenen: saetze.length >= 2 ? texte.map((text, i) => ({ text, foto: i % fotos })) : [],
  };
}
