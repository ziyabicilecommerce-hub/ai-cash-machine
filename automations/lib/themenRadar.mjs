// Themen-Radar für die NACHTWERK-Bots: Aufhänger des Tages aus freien Quellen ohne eigenen Schlüssel.
// - Anlass-Kalender (Halloween, Advent, Silvester ...) und Vollmond (Mondphase gerechnet, ohne Internet)
// - NASA "Astronomy Picture of the Day" (öffentlicher DEMO_KEY von api.nasa.gov)
// - Open-Meteo-Wetter für Deutschland (Sturm, Schnee, Gewitter)
// Nur Anregungen: die KI greift sie auf, wenn es zum Bot passt - eigene Figuren, keine echten Personen/Marken.
const datum = (j, m, t) => Date.UTC(j, m - 1, t);

export function anlassHeute(jetzt = new Date()) {
  const j = jetzt.getUTCFullYear();
  const t = Date.UTC(j, jetzt.getUTCMonth(), jetzt.getUTCDate());
  const liste = [
    ['Halloween', datum(j, 10, 20), datum(j, 10, 31), 'Halloween week - pumpkins, costumes, spooky night'],
    ['Erster Schnee', datum(j, 11, 15), datum(j, 11, 30), 'first snow of the year'],
    ['Advent', datum(j, 12, 1), datum(j, 12, 24), 'Christmas season - lights, snow, magical winter night'],
    ['Silvester', datum(j, 12, 27), datum(j, 12, 31), 'New Year\'s Eve - fireworks over the city'],
    ['Neujahr', datum(j, 1, 1), datum(j, 1, 6), 'a brand new year begins'],
    ['Valentinstag', datum(j, 2, 10), datum(j, 2, 14), 'Valentine\'s day - an unexpected friendship or love story'],
    ['Frühlingsanfang', datum(j, 3, 18), datum(j, 3, 25), 'first day of spring - everything starts to bloom'],
    ['Sommeranfang', datum(j, 6, 18), datum(j, 6, 24), 'longest day of the year, endless summer sunset'],
    ['Sternschnuppen', datum(j, 8, 9), datum(j, 8, 14), 'Perseid meteor shower - shooting stars all night'],
  ];
  const treffer = liste.find(([, von, bis]) => t >= von && t <= bis);
  return treffer ? { name: treffer[0], text: treffer[3] } : null;
}

// Mondalter in Tagen (synodischer Monat 29,53 d, Bezugs-Neumond 6.1.2000 18:14 UTC) - Vollmond bei ~14,8 Tagen.
export function vollmond(jetzt = new Date()) {
  const alter = (((jetzt.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588 + 29.530588) % 29.530588;
  return Math.abs(alter - 14.77) <= 1.2;
}

// Wettercodes (WMO) von Open-Meteo -> spannender Aufhänger, sonst nichts.
export function wetterAufhaenger(code, wind) {
  if ([95, 96, 99].includes(code)) return 'a thunderstorm is raging over Germany tonight';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'it is snowing in Germany today';
  if (wind >= 60) return 'a heavy storm is blowing over Germany';
  return '';
}

const holen = async (url, laden) => {
  const res = await laden(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'nachtwerk-themen-radar' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

// Liefert bis zu 3 kurze englische Anregungen; jede Quelle darf ausfallen.
export async function themenDesTages({ jetzt = new Date(), laden = fetch } = {}) {
  const themen = [];
  const anlass = anlassHeute(jetzt);
  if (anlass) themen.push(anlass.text);
  if (vollmond(jetzt)) themen.push('full moon tonight');
  try {
    const d = await holen('https://api.open-meteo.com/v1/forecast?latitude=51.2&longitude=10.4&current=weather_code,wind_speed_10m', laden);
    const w = wetterAufhaenger(d?.current?.weather_code, d?.current?.wind_speed_10m);
    if (w) themen.push(w);
  } catch { /* ohne Wetter */ }
  try {
    const d = await holen('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&thumbs=true', laden);
    const titel = String(d?.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (titel) themen.push(`today's NASA space picture: "${titel}"`);
  } catch { /* ohne NASA */ }
  return themen.slice(0, 3);
}

export const themenHinweis = (themen) => (themen?.length
  ? `\nOptional inspiration from today (use at most one, only if it fits this channel naturally; keep characters original): ${themen.map((t) => `- ${t}`).join(' ')}`
  : '');
