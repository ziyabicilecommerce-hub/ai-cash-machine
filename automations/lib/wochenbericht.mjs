// Wochenbericht: sammelt unsere Posts in einem Verlauf (daten.json hat nur ~2 Tage) und vergleicht die letzten 7 Tage
// mit den 7 Tagen davor - je Konto, je Format, je Skript-Muster, beste Uhrzeit, Top-Videos und konkrete nächste Schritte.
// Nichts wird erfunden: gerechnet wird nur mit Posts, für die die Plattform schon Zahlen geliefert hat (älter als 1 Tag).
const TAG = 864e5;
const schluessel = (p) => p.link || `${p.konto}|${p.zeit}`;
const schnitt = (l, f = (p) => p.aufrufe) => (l.length ? l.reduce((a, p) => a + f(p), 0) / l.length : 0);
const stunde = (iso) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)));

// Verlauf fortschreiben: neue Posts dazu, bekannte mit den frischesten Zahlen überschreiben, älter als 30 Tage fliegt raus
export function verlaufMischen(verlauf = [], letzte = [], jetzt = Date.now()) {
  const m = new Map(verlauf.map((p) => [schluessel(p), p]));
  for (const p of letzte) m.set(schluessel(p), { ...m.get(schluessel(p)), ...p });
  return [...m.values()].filter((p) => jetzt - new Date(p.zeit) < 30 * TAG).sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)));
}

function gruppe(posts, nach) {
  const g = {};
  for (const p of posts) { const k = nach(p); if (k) (g[k] ||= []).push(p); }
  return Object.fromEntries(Object.entries(g).map(([k, l]) => [k, { n: l.length, schnitt: Math.round(schnitt(l)), sehdauer: Math.round(schnitt(l, (p) => p.sehdauer || 0) * 10) / 10 }]));
}

// musterVon(post) -> Muster-Name oder '' (kommt vom Skript-Bot, damit diese Datei ohne ihn testbar bleibt)
// varianteVon(post) -> {kalt, raum, suchbild} oder null (A/B-Test aus buffer-verteiler/varianten.json)
export function abAuswertung(posts, varianteVon = () => null) {
  const aus = {};
  for (const p of posts.filter((x) => (x.sehdauer || 0) > 0)) {  // nur Posts mit Sehdauer (YouTube liefert keine)
    const v = varianteVon(p);
    if (!v) continue;
    for (const [f, an] of Object.entries(v)) if (typeof an === 'boolean') ((aus[f] ||= { an: [], aus: [] })[an ? 'an' : 'aus']).push(p);
  }
  const kurz = (l) => ({ n: l.length, schnitt: Math.round(schnitt(l)), sehdauer: Math.round(schnitt(l, (p) => p.sehdauer || 0) * 10) / 10 });
  return Object.fromEntries(Object.entries(aus).map(([f, g]) => [f, { an: kurz(g.an), aus: kurz(g.aus) }]));
}

export function bericht(verlauf = [], jetzt = Date.now(), musterVon = () => '', varianteVon = () => null) {
  const reif = verlauf.filter((p) => jetzt - new Date(p.zeit) >= TAG);  // Zahlen brauchen ~1 Tag
  const woche = reif.filter((p) => jetzt - new Date(p.zeit) < 8 * TAG);
  const vorher = reif.filter((p) => { const a = jetzt - new Date(p.zeit); return a >= 8 * TAG && a < 15 * TAG; });
  const konten = gruppe(woche, (p) => p.konto);
  const vorherKonten = gruppe(vorher, (p) => p.konto);
  for (const [k, w] of Object.entries(konten)) w.vorher = vorherKonten[k]?.schnitt ?? null;
  const formate = gruppe(woche, (p) => p.format);
  const muster = gruppe(woche, musterVon);
  const zeiten = gruppe(woche, (p) => { const h = stunde(p.zeit); return h < 6 ? 'nachts' : h < 12 ? 'vormittags' : h < 18 ? 'nachmittags' : 'abends'; });
  const top = [...woche].sort((a, b) => b.aufrufe - a.aufrufe).slice(0, 3).map(({ konto, text, aufrufe, sehdauer, link }) => ({ konto, text: String(text || '').slice(0, 100), aufrufe, sehdauer, link }));
  const bestes = (o, min = 2) => Object.entries(o).filter(([, w]) => w.n >= min).sort((a, b) => b[1].schnitt - a[1].schnitt)[0];
  const schritte = [];
  const bk = bestes(konten), bm = bestes(muster), bz = bestes(zeiten, 3);
  if (bk) schritte.push(`${bk[0]} läuft am besten (Ø ${bk[1].schnitt}) - neue Ideen dort zuerst testen.`);
  const tot = Object.entries(konten).filter(([, w]) => w.n >= 5 && w.schnitt < 10).map(([k]) => k);
  if (tot.length) schritte.push(`Unter 10 Ø-Aufrufen: ${tot.join(', ')} - Kontostatus prüfen, selbst aktiv sein, ein paar Tage weniger posten.`);
  if (bm) schritte.push(`Stärkstes Geschichten-Muster: „${bm[0]}“ (Ø ${bm[1].schnitt}) - der Skript-Bot nimmt es automatisch öfter.`);
  if (bz) schritte.push(`Beste Tageszeit: ${bz[0]} (Ø ${bz[1].schnitt}).`);
  const kurz = schnitt(woche, (p) => p.sehdauer || 0);
  if (woche.length && kurz < 5) schritte.push(`Ø Sehdauer nur ${kurz.toFixed(1)} s - die ersten 2 Sekunden entscheiden: Hook kürzer, Schock früher.`);
  const ab = abAuswertung(woche, varianteVon);
  const NAMEN = { kalt: 'Kalter Einstieg', raum: '3D-Ton', suchbild: 'Versteckte Augen', duhook: 'Du-Hook', ki: 'KI-Bilder' };
  for (const [f, w] of Object.entries(ab)) {
    if (w.an.n < 3 || w.aus.n < 3) continue;  // zu wenig Daten für ein Urteil
    const besser = w.an.sehdauer - w.aus.sehdauer;
    if (Math.abs(besser) >= 0.5) schritte.push(`A/B-Test ${NAMEN[f] || f}: mit ${w.an.sehdauer} s, ohne ${w.aus.sehdauer} s Sehdauer - ${besser > 0 ? 'wirkt, bleibt an' : 'bringt nichts, könnte weg'}.`);
  }
  const gesamt = { posts: woche.length, aufrufe: woche.reduce((a, p) => a + p.aufrufe, 0), vorherAufrufe: vorher.length ? vorher.reduce((a, p) => a + p.aufrufe, 0) : null };
  return { stand: new Date(jetzt).toISOString(), gesamt, konten, formate, muster, zeiten, top, ab, schritte };
}

// Vorrats-Wächter: wie viele Geschichten sind noch ungepostet und wie viele Tage reicht das (bei proTag Posts am Tag)?
// gepostet = Schlüssel aus buffer-verteiler/stand.json ("horror:<slug>", "horror:hit:<slug>")
export function vorrat(slugs = [], gepostet = [], proTag = 5) {
  const weg = new Set(gepostet.map((k) => String(k).replace(/^horror:(hit:)?/, '')));
  const rest = slugs.filter((x) => !weg.has(x)).length;
  return { rest, tage: Math.floor(rest / proTag) };
}

// Sprach-Test auf dem YouTube-Mix-Kanal: Ø Aufrufe deutscher vs. englischer Shorts (nur Posts mit Zahlen)
export function sprachTest(posts = [], istEnglisch = () => false, konto = /giyuuu/i) {
  const g = { de: [], en: [] };
  for (const p of posts) if (konto.test(p.konto || '') && p.aufrufe > 0 && p.format !== 'anime') g[istEnglisch(p) ? 'en' : 'de'].push(p.aufrufe);  // alte Anime-Posts zählen nicht
  const k = (l) => ({ n: l.length, schnitt: l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0 });
  return { de: k(g.de), en: k(g.en) };
}
