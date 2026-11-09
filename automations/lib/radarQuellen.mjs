// Mega-Radar für den Trend-Radar (#114): misst, welche Gruselthemen gerade gefragt sind - aus freien Quellen.
//   ohne Schlüssel: Wikipedia-Aufrufe (DE+EN) für ~30 Gruselbegriffe, NOAA-Satellitendaten (Polarlicht-Index Kp),
//                   Mondphase (gerechnet)
//   mit Gratis-Schlüssel (optional, Repo-Secrets): YOUTUBE_API_KEY (meistgesehene Horror-Shorts der letzten 48 h,
//                   nur als Anregung - nie kopieren), NASA_API_KEY (statt des öffentlichen DEMO_KEY)
// Reine Funktionen + Abrufer mit austauschbarem fetch - ohne Netz testbar. Jede Quelle darf ausfallen.
import { vollmond } from './themenRadar.mjs';

// name = Anzeige, de/en = Wikipedia-Artikel, thema = Aufhänger für neue Geschichten (eigene Figuren, nichts Echtes)
export const BEGRIFFE = [
  { name: 'Schlafparalyse', de: 'Schlafparalyse', en: 'Sleep_paralysis', thema: 'Schlafparalyse: jemand sitzt nachts auf meiner Brust' },
  { name: 'Creepypasta', de: 'Creepypasta', en: 'Creepypasta', thema: 'Eine Gruselgeschichte aus dem Internet wird wahr' },
  { name: 'Backrooms', de: 'Backrooms', en: 'The_Backrooms', thema: 'Endlose gelbe Flure hinter einer normalen Tür' },
  { name: 'Liminal Spaces', de: 'Liminal_Space', en: 'Liminal_space_(aesthetic)', thema: 'Leeres Einkaufszentrum um 3 Uhr nachts' },
  { name: 'Doppelgänger', de: 'Doppelgänger', en: 'Doppelgänger', thema: 'Ich treffe mich selbst im Treppenhaus' },
  { name: 'Poltergeist', de: 'Poltergeist', en: 'Poltergeist', thema: 'Möbel stehen morgens anders' },
  { name: 'Spukhaus', de: 'Spukhaus', en: 'Haunted_house', thema: 'Die neue Wohnung war zu billig' },
  { name: 'Ouija', de: 'Hexenbrett', en: 'Ouija', thema: 'Das Brett bewegt sich ohne Finger' },
  { name: 'Skinwalker', de: 'Skinwalker', en: 'Skin-walker', thema: 'Etwas imitiert die Stimme meiner Mutter im Wald' },
  { name: 'Wendigo', de: 'Wendigo', en: 'Wendigo', thema: 'Hunger im verschneiten Wald' },
  { name: 'Slender Man', de: 'Slender_Man', en: 'Slender_Man', thema: 'Eine sehr große Gestalt am Waldrand' },
  { name: 'Bloody Mary', de: 'Bloody_Mary_(Sage)', en: 'Bloody_Mary_(folklore)', thema: 'Dreimal einen Namen in den Spiegel sagen' },
  { name: 'Schattenmenschen', de: 'Schattenmensch', en: 'Shadow_person', thema: 'Ein Schatten ohne Menschen dazu' },
  { name: 'Mothman', de: 'Mothman', en: 'Mothman', thema: 'Rote Augen auf der Brücke' },
  { name: 'Analog Horror', de: 'Analog_Horror', en: 'Analog_horror', thema: 'Eine alte Notfallsendung im Fernsehen' },
  { name: 'SCP', de: 'SCP_Foundation', en: 'SCP_Foundation', thema: 'Ein Gegenstand, den man nicht ansehen darf' },
  { name: 'Moderne Sagen', de: 'Moderne_Sage', en: 'Urban_legend', thema: 'Die Sage aus meiner Kindheit stimmt' },
  { name: 'Black-eyed Children', de: 'Black-eyed_Children', en: 'Black-eyed_children', thema: 'Zwei Kinder wollen nachts rein' },
  { name: 'Uncanny Valley', de: 'Uncanny_Valley', en: 'Uncanny_valley', thema: 'Ein Gesicht, das fast menschlich ist' },
  { name: 'Geister', de: 'Gespenst', en: 'Ghost', thema: 'Jemand steht am Fußende des Bettes' },
  { name: 'Exorzismus', de: 'Exorzismus', en: 'Exorcism', thema: 'Eine Stimme, die nicht zu meinem Mund passt' },
  { name: 'Klartraum', de: 'Klartraum', en: 'Lucid_dream', thema: 'Ich wache auf - im Traum' },
  { name: 'Nahtoderfahrung', de: 'Nahtoderfahrung', en: 'Near-death_experience', thema: 'Am Ende des Tunnels wartet jemand' },
  { name: 'Mimic', de: 'Mimikry', en: 'Mimicry', thema: 'Etwas lernt meine Stimme' },
  { name: 'Zeitschleife', de: 'Zeitschleife', en: 'Time_loop', thema: 'Derselbe Anruf jede Nacht um 3:12 Uhr' },
  { name: 'Vollmond', de: 'Vollmond', en: 'Full_moon', thema: 'Vollmondnacht, der Hund heult' },
  { name: 'Polarlicht', de: 'Polarlicht', en: 'Aurora', thema: 'Polarlicht über Deutschland - und etwas darin' },
  { name: 'Stromausfall', de: 'Stromausfall', en: 'Power_outage', thema: 'Stromausfall, aber ein Zimmer bleibt hell' },
  { name: 'Nebel', de: 'Nebel', en: 'Fog', thema: 'Nebel auf der Landstraße' },
  { name: 'Friedhof', de: 'Friedhof', en: 'Cemetery', thema: 'Ein frisches Grab mit meinem Namen' },
];

const tag = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

// Aufrufe -> Anstieg: Schnitt der letzten 3 Tage geteilt durch Schnitt der 14 Tage davor (mind. 50 Aufrufe/Tag zählen, kleine Wikipedias weniger)
export function anstieg(werte = [], minimum = 50) {
  if (werte.length < 10) return null;
  const neu = werte.slice(-3), alt = werte.slice(-17, -3);
  const n = neu.reduce((a, b) => a + b, 0) / neu.length, a = alt.reduce((x, y) => x + y, 0) / Math.max(alt.length, 1);
  if (n < minimum) return null;
  return { anstieg: Math.round((n / Math.max(a, 1)) * 100) / 100, proTag: Math.round(n) };
}

async function holenJson(laden, url) {
  const res = await laden(url, { headers: { 'user-agent': 'ai-cash-machine-trend-radar/1.0 (https://github.com/ziyabicilecommerce-hub/ai-cash-machine)' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// Wikipedia: Aufrufe der letzten ~18 Tage je Begriff (DE + EN zusammen) -> die stärksten Aufsteiger zuerst
export async function wikiRadar({ laden = fetch, jetzt = new Date(), begriffe = BEGRIFFE } = {}) {
  const ende = new Date(jetzt.getTime() - 864e5), start = new Date(jetzt.getTime() - 19 * 864e5);
  const aus = [];
  for (const b of begriffe) {
    const reihen = [];
    for (const [projekt, artikel] of [['de.wikipedia', b.de], ['en.wikipedia', b.en]]) {
      try {
        const d = await holenJson(laden, `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${projekt}/all-access/user/${encodeURIComponent(artikel)}/daily/${tag(start)}/${tag(ende)}`);
        reihen.push((d.items || []).map((x) => x.views || 0));
      } catch { /* Artikel fehlt oder Netz weg */ }
    }
    if (!reihen.length) continue;
    const laenge = Math.max(...reihen.map((r) => r.length));
    const summe = Array.from({ length: laenge }, (_, i) => reihen.reduce((a, r) => a + (r[r.length - laenge + i] || 0), 0));
    const w = anstieg(summe);
    if (w) aus.push({ name: b.name, thema: b.thema, ...w });
  }
  return aus.sort((a, b) => b.anstieg - a.anstieg);
}

// NOAA (Satellitendaten zum Weltraumwetter): aktueller Kp-Index. Ab Kp 6 ist Polarlicht bis nach Deutschland möglich.
// Die Datei kommt als Tabelle (erste Zeile = Spaltennamen) oder als Liste von Objekten - beides wird gelesen.
export function kpAus(daten) {
  const zeilen = Array.isArray(daten) ? daten : [];
  const letzte = zeilen[zeilen.length - 1];
  const kp = Array.isArray(letzte) ? Number(letzte[1]) : Number(letzte?.Kp ?? letzte?.kp_index ?? letzte?.kp);
  return Number.isFinite(kp) ? kp : null;
}
export async function himmelRadar({ laden = fetch, jetzt = new Date(), nasaKey = 'DEMO_KEY' } = {}) {
  const h = { vollmond: vollmond(jetzt), kp: null, polarlicht: false, nasa: '' };
  try { h.kp = kpAus(await holenJson(laden, 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')); h.polarlicht = h.kp >= 6; } catch { /* ohne */ }
  try { h.nasa = String((await holenJson(laden, `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(nasaKey)}`)).title || '').slice(0, 80); } catch { /* ohne */ }
  return h;
}

// YouTube (nur mit eigenem Gratis-Schlüssel): meistgesehene Horror-Shorts der letzten 48 h - Titel nur als Stimmung
export const ytTitel = (d) => (d?.items || []).map((x) => String(x?.snippet?.title || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()).filter(Boolean);
export async function youtubeRadar({ laden = fetch, key = '', jetzt = new Date() } = {}) {
  if (!key) return { an: false, de: [], en: [] };
  const seit = new Date(jetzt.getTime() - 2 * 864e5).toISOString();
  const suche = async (q, region, sprache) => {
    try {
      return ytTitel(await holenJson(laden, `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&order=viewCount&maxResults=10&q=${encodeURIComponent(q)}&regionCode=${region}&relevanceLanguage=${sprache}&publishedAfter=${encodeURIComponent(seit)}&key=${encodeURIComponent(key)}`));
    } catch { return []; }
  };
  return { an: true, de: await suche('gruselgeschichte horror', 'DE', 'de'), en: await suche('scary story horror', 'US', 'en') };
}

// Radar -> Themen für neue Geschichten: Himmel (Polarlicht, Vollmond) zuerst, dann die Wikipedia-Aufsteiger (Anstieg >= 1.2)
export function radarThemen({ wiki = [], himmel = {} } = {}) {
  const t = [];
  if (himmel.polarlicht) t.push({ thema: 'Polarlicht über Deutschland - und etwas darin', quelle: 'satellit' });
  if (himmel.vollmond) t.push({ thema: 'Vollmondnacht, der Hund heult', quelle: 'mond' });
  for (const w of wiki.filter((x) => x.anstieg >= 1.2).slice(0, 3)) t.push({ thema: w.thema, quelle: 'wikipedia', anstieg: w.anstieg });
  return t;
}
