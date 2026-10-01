// Such-Radar: was tippen Leute WIRKLICH in Google und YouTube zu unseren Produkten? Die offenen
// Autocomplete-Vorschlaege (kostenlos, kein Schluessel) zeigen echte Suchbegriffe und echte Fragen.
// Daraus werden: Video-Ideen (Fragen ehrlich beantworten), passende Hashtags und ein Hinweis fuer
// die Video-Fabrik. Fremde Marken landen nie in Hashtags.
import { readFileSync, existsSync } from 'node:fs';

export const ZIEL = 'zentrale/daten/suchbegriffe.json';
export const QUELLEN = { google: '', youtube: 'yt' };
const ZUSAETZE = ['', ' für', ' wie', ' oder', 'beste '];
const FRAGE = /^(wie|was|welche[rsn]?|warum|wann|wo|wieso|hilft|helfen|lohnt|bringt|bringen|kann|darf|soll|ist|sind)\b|\b(sinnvoll|erfahrung(en)?|test|wirkung|anleitung|übungen|uebungen)\b/;
const STOPP = new Set(['für', 'fuer', 'wie', 'oder', 'und', 'mit', 'der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'beste', 'besten', 'test', 'kaufen', 'günstig', 'amazon', 'lidl', 'aldi', 'decathlon', 'ebay', 'kaufland', 'temu', 'shein', 'testsieger', 'stiftung', 'warentest', 'gegen', 'bei', 'zum', 'zur', 'von', 'auf', 'ohne', 'lange', 'oft', 'man', 'benutzen', 'anwenden']);
const NISCHE = ['fitness', 'training', 'workout', 'sport', 'gym', 'klimmzug', 'muskel', 'ruecken', 'rücken', 'nacken', 'schulter', 'haltung', 'massage', 'entspann', 'verspann', 'yoga', 'pilates', 'dehnen', 'stretching', 'homeoffice', 'büro', 'wellness', 'faszien', 'griff', 'kraft', 'arme', 'beine', 'hand', 'fuß', 'akupressur', 'widerstand'];

// Grund-Suchbegriff aus dem Produktnamen: "Marke Modell – Klimmzugband & Widerstandsband" -> "klimmzugband".
export function stichwort(name) {
  const teil = String(name || '').split(/\s[–—-]\s/).slice(1).join(' ') || String(name || '');
  return teil.split(/\s(?:für|zur|zum|mit|aus|in|gegen)\s|[&,/]/)[0].replace(/-/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export const handleAus = (url) => String(url || '').replace(/[?#].*$/, '').split('/').filter(Boolean).pop() || '';

// Antwort von suggestqueries (client=firefox): ["anfrage", ["vorschlag 1", ...]]
export function vorschlaegeLesen(text) {
  try {
    const d = JSON.parse(text);
    return Array.isArray(d?.[1]) ? d[1].map((s) => String(s).toLowerCase().trim()).filter(Boolean) : [];
  } catch { return []; }
}

export async function abfragen(begriff, quelle = 'google', laden = fetch) {
  const ds = QUELLEN[quelle] ? `&ds=${QUELLEN[quelle]}` : '';
  const res = await laden(`https://suggestqueries.google.com/complete/search?client=firefox&hl=de&gl=de&ie=utf-8&oe=utf-8${ds}&q=${encodeURIComponent(begriff)}`, { headers: { 'User-Agent': 'Mozilla/5.0 such-radar' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Autocomplete ${res.status}`);
  return vorschlaegeLesen(new TextDecoder('utf-8').decode(await res.arrayBuffer()));
}

// Haeufigkeit ueber alle Anfragen = wie "stark" ein Vorschlag ist; der reine Grundbegriff zaehlt nicht.
export function rangliste(listen, grund) {
  const z = new Map();
  for (const l of listen) l.forEach((s, i) => { if (s !== grund) z.set(s, (z.get(s) || 0) + 1 + (10 - Math.min(i, 9)) / 10); });
  return [...z.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}

export const fragen = (liste) => liste.filter((s) => FRAGE.test(s));

// Hashtags nur aus Woertern, die zum eigenen Produkt oder zur Nische gehoeren (keine fremden Marken).
export function hashtags(liste, name, max = 8) {
  const eigen = new Set(String(name).toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 3));
  const z = new Map();
  for (const s of liste) for (const w of new Set(s.split(/[^\p{L}]+/u))) {
    if (w.length < 4 || w.length > 22 || STOPP.has(w)) continue;
    if (eigen.has(w) || NISCHE.some((n) => w.includes(n))) z.set(w, (z.get(w) || 0) + 1);
  }
  return [...z.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([w]) => `#${w.replace(/ß/g, 'ss')}`);
}

// Ein Produkt: Grundbegriff mit Zusaetzen in Google und YouTube abfragen.
export async function produktRadar(p, { laden = fetch, pause = 250 } = {}) {
  const grund = stichwort(p.name);
  const roh = { google: [], youtube: [] };
  for (const quelle of Object.keys(QUELLEN)) {
    for (const z of ZUSAETZE) {
      const q = z.endsWith(' ') ? `${z}${grund}` : `${grund}${z}`;
      try { roh[quelle].push(await abfragen(q, quelle, laden)); } catch { roh[quelle].push([]); }
      if (pause) await new Promise((r) => setTimeout(r, pause));
    }
  }
  const google = rangliste(roh.google, grund).slice(0, 15);
  const youtube = rangliste(roh.youtube, grund).slice(0, 15);
  return { name: p.name, shop: p.shop, stichwort: grund, google, youtube, fragen: [...new Set(fragen([...youtube, ...google]))].slice(0, 8), hashtags: hashtags([...google, ...youtube], p.name) };
}

// Hinweis fuer das Video-Skript: echte Fragen/Suchen - nur aufgreifen, wenn es ehrlich passt.
export function suchHinweis(p, pfad = ZIEL, jetzt = Date.now()) {
  try {
    if (!existsSync(pfad)) return '';
    const d = JSON.parse(readFileSync(pfad, 'utf8'));
    if (!(jetzt - Date.parse(d.stand) < 4 * 864e5)) return '';
    const e = d.produkte?.[p?.handle] || Object.values(d.produkte || {}).find((x) => x.name === p?.title);
    if (!e) return '';
    const f = e.fragen.slice(0, 3), s = e.google.slice(0, 3);
    if (f.length) return `Diese Fragen googeln Leute wirklich: ${f.map((x) => `"${x}"`).join(', ')}. Beantworte EINE davon ehrlich und kurz im Video, wenn du sie aus den Produktinfos beantworten kannst - nichts erfinden, keine Heilversprechen. `;
    return s.length ? `Echte Suchbegriffe dazu: ${s.map((x) => `"${x}"`).join(', ')}. Nutze diese Woerter natuerlich im Text, wenn sie passen. ` : '';
  } catch { return ''; }
}
