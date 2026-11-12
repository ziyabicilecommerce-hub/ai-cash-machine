// Trick-Radar (#115): welche Kniffe im Hook bringen bei UNSEREN Videos wirklich mehr Aufrufe - gemessen, nicht geraten.
// Jeder Post wird mit dem Schnitt (Median) seines eigenen Kontos in den Tagen drumherum verglichen (x1.0 = normal für
// dieses Konto zu dieser Zeit). So verfälschen weder große/kleine Konten noch gute/schlechte Wochen das Ergebnis.
// Dazu der Deckel-Check: bekommen die Videos eines Kontos fast immer gleich viele Aufrufe, entscheidet dort nicht der
// Inhalt - die Plattform zeigt jedes Video derselben Testrunde und hört auf (die Leute bleiben nicht lange genug).
const TAG = 864e5;
const median = (l) => { const s = [...l].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
export const hookVon = (p) => String(p.text || '').trim().split(/(?<=[.!?])\s/)[0] || '';

// name -> Prüfung(hook, anfang des Textes). Nur Dinge, die man am Text sicher erkennt.
export const TRICKS = {
  'Du-Ansprache am Anfang (Wenn/Schau/Geh …)': (h) => /^(Wenn|Schau|Geh|Öffne|Lies|Dankt|Sag|Du|If|Never|Don't|When)\b/i.test(h),
  'Uhrzeit (3 Uhr, 3:12)': (h, t) => /\d ?Uhr|\d:\d\d|\d ?(a\.?m\.?|p\.?m\.?)/i.test(t),
  'Zahl im ersten Satz': (h) => /\d/.test(h),
  'Ich-Erzählung (Ich/Mein …)': (h) => /^(Ich|Mein|Meine|I|My)\b/.test(h),
  'kurzer erster Satz (höchstens 7 Wörter)': (h) => h.split(/\s+/).length <= 7,
  'Technik (Handy, Kamera, App …)': (h, t) => /Handy|Kamera|App|Navi|Filter|Lampe|Stream|Chat|Nummer|Nachricht|Babyphone|Klingel|phone|camera/i.test(t),
  'Zuhause (Wohnung, Bett, Tür)': (h, t) => /Wohnung|Bett|Tür|Zimmer|allein|home|door|bed/i.test(t),
  'Familie (Mama, Oma, Kind)': (h, t) => /Mama|Mutter|Oma|Kind|Baby|Tochter|Sohn|Bruder|Schwester|mom|mother|child/i.test(t),
  'Aufzug': (h, t) => /Aufzug|elevator/i.test(t),
  'Wald': (h, t) => /Wald|zelte|forest|woods/i.test(t),
};

// Aufrufe geteilt durch den Median des Kontos in +-3 Tagen (mind. 4 Posts, Median mind. 10) - sonst null
export function normiert(posts) {
  return posts.map((p) => {
    const nah = posts.filter((q) => q.konto === p.konto && Math.abs(new Date(q.zeit) - new Date(p.zeit)) < 3 * TAG).map((q) => q.aufrufe || 0);
    const m = median(nah);
    return { p, x: nah.length >= 4 && m >= 10 ? (p.aufrufe || 0) / m : null };
  }).filter((e) => e.x !== null);
}

// -> [{ trick, n, faktor, ueber, ohne }] sortiert nach Faktor; nur Tricks mit genug Posts (mind = 8)
export function trickRadar(verlauf = [], jetzt = Date.now(), { mind = 8, tricks = TRICKS } = {}) {
  const reif = verlauf.filter((p) => jetzt - new Date(p.zeit) >= TAG && (p.format || 'horror') === 'horror');
  const e = normiert(reif);
  const aus = [];
  for (const [trick, pruefe] of Object.entries(tricks)) {
    const hat = (x) => pruefe(hookVon(x.p), String(x.p.text || '').slice(0, 140));
    const mit = e.filter(hat).map((x) => x.x), ohne = e.filter((x) => !hat(x)).map((x) => x.x);
    if (mit.length < mind || ohne.length < mind) continue;
    aus.push({ trick, n: mit.length, faktor: Math.round(median(mit) * 100) / 100, ohne: Math.round(median(ohne) * 100) / 100, ueber: Math.round((mit.filter((x) => x > 1).length / mit.length) * 100) });
  }
  return aus.sort((a, b) => b.faktor - a.faktor);
}

// Deckel je Konto (letzte 10 Tage): Anteil der Videos ohne Aufrufe (< 5) und ob der Rest fast gleich viele bekommt
export function deckel(verlauf = [], jetzt = Date.now()) {
  const aus = {};
  const reif = verlauf.filter((p) => { const a = jetzt - new Date(p.zeit); return a >= TAG && a < 10 * TAG; });
  for (const konto of [...new Set(reif.map((p) => p.konto))]) {
    const l = reif.filter((p) => p.konto === konto).map((p) => p.aufrufe || 0);
    if (l.length < 6) continue;
    const lebt = l.filter((x) => x >= 5), m = median(lebt);
    const gleich = lebt.filter((x) => Math.abs(x - m) <= 0.08 * m).length;
    aus[konto] = { posts: l.length, tot: l.length - lebt.length, median: Math.round(m), hoechst: Math.max(...l), gedeckelt: lebt.length >= 5 && gleich / lebt.length >= 0.5 };
  }
  return aus;
}

// Klartext für den Wochenbericht (höchstens 4 Zeilen, nur klare Befunde)
export function trickSchritte(radar = [], deckelung = {}) {
  const s = [];
  const gut = radar.filter((r) => r.faktor >= 1.15 && r.ueber >= 55).slice(0, 2);
  const schlecht = radar.filter((r) => r.faktor <= 0.9 && r.ueber <= 40).slice(-1);
  for (const r of gut) s.push(`Trick-Radar: „${r.trick}“ bringt x${r.faktor} gegenüber dem Konto-Schnitt (${r.n} Videos, ${r.ueber} % über Schnitt).`);
  for (const r of schlecht) s.push(`Trick-Radar: „${r.trick}“ bremst (x${r.faktor}, ${r.n} Videos).`);
  const fest = Object.entries(deckelung).filter(([, d]) => d.gedeckelt).map(([k, d]) => `${k} (~${d.median})`);
  if (fest.length) s.push(`Deckel: ${fest.join(', ')} - fast jedes Video bekommt dort gleich viele Aufrufe. Der Inhalt entscheidet nicht; die Videos kommen nicht über die erste Testrunde hinaus (zu kurz angesehen).`);
  const tot = Object.entries(deckelung).filter(([, d]) => d.tot / d.posts >= 0.3).map(([k, d]) => `${k} (${d.tot} von ${d.posts})`);
  if (tot.length) s.push(`Ohne Aufrufe: ${tot.join(', ')} - diese Videos wurden gar nicht ausgespielt.`);
  return s;
}
