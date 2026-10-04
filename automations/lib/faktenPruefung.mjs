// Fakten-Kanal: Skripte zu Rekord-Fragen, bei denen Quellen sich uneinig sind, werden verworfen -
// auf einem Community-Konto soll keine strittige Behauptung als sichere Tatsache stehen.
const UMSTRITTEN = /l(ä|ae)ngste[rnms]?\s+(fluss|flusses|strom)|fluss\S*\s+(ist|war)\s+(der\s+)?l(ä|ae)ngste|(h(ö|oe)chste[rnms]?|gr(ö|oe)(ß|ss)te[rnms]?|(ä|ae)lteste[rnms]?)\s+(berg|tier|lebewesen|baum)|l(ä|ae)ngste[rnms]?\s+\S*(fluss|strom)/i;

export const umstritten = (skript) => {
  const text = [skript?.titel, skript?.fakt, ...(skript?.szenen || []).map((s) => s?.text)].filter(Boolean).join('\n');
  return UMSTRITTEN.test(text);
};

// Die kleine KI schreibt gelegentlich Teile der Anweisung ("5-6 Szenen mit je 1 kurzem Satz", "genau ein Thema") als
// Titel/Hook/Caption ab - solche Skripte sind unbrauchbar.
const ECHO = /\bszenen?\b|genau\s+ein(em)?\s+thema|max\.\s*\d|gesprochen(en|er|e)?\s+satz|hashtags?\b|pattern[- ]interrupt|du-form|wissensl(ü|ue)cke|\bhook\b|\bcaption\b|nur\s+das\s+thema|ein\s+thema\??$|\bzeichen\b|platzhalter|^\W*(\.{2,}|…)\W*$/im;
export const echo = (skript) => ECHO.test([skript?.titel, skript?.hook, skript?.caption].filter(Boolean).join('\n'));

// Dasselbe Thema nicht mehrfach: gleiche Inhaltswoerter (>= 5 Buchstaben) wie ein bekannter Fakt -> doppelt.
const woerter = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-zäöüß ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 5));
const BANAL = new Set(['fakt', 'wahrheit', 'mythos', 'tatsächlich', 'tatsaechlich', 'wirklich', 'welche', 'welcher', 'welches', 'genau', 'diese', 'dieser', 'dieses', 'frage', 'schon', 'krasse', 'unglaublich', 'fakten', 'folge', 'mehr']);
export function doppelt(skript, bekannt = []) {
  const neu = [...woerter([skript?.titel, skript?.fakt].join(' '))].filter((w) => !BANAL.has(w));
  if (!neu.length) return false;
  return bekannt.some((b) => {
    const alt = woerter(b);
    const gemeinsam = neu.filter((w) => alt.has(w) || [...alt].some((a) => a.slice(0, 6) === w.slice(0, 6)));
    // Ein langes, markantes Wort (>= 7 Buchstaben, z. B. "oktopus") oder zwei gemeinsame Woerter = dasselbe Thema.
    return gemeinsam.some((w) => w.length >= 7) || gemeinsam.length >= 2;
  });
}
