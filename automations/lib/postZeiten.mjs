// Beste Posting-Zeiten (Arsenal Tier 11 "Platform Assassins"): jede Plattform postet in ihren starken Stunden
// (Europe/Berlin, Erfahrungswerte fuer DACH), hoechstens 1 Post je Kanal und Lauf - verteilt statt Spam-Block.
// Ueberschreibbar je Plattform per Variable POST_ZEITEN_<NAME> = "12,18,20"; POST_ZEITEN=aus schaltet ab.
export const FENSTER = {
  tiktok: [12, 17, 18, 19, 20, 21], instagram: [8, 11, 12, 13, 18, 19, 20], youtube: [12, 15, 16, 17, 18, 19, 20],
  facebook: [9, 12, 13, 14, 15, 19], x: [8, 9, 12, 13, 17, 18], linkedin: [8, 9, 10, 12, 17], pinterest: [14, 19, 20, 21, 22],
  threads: [8, 12, 13, 18, 19, 20], bluesky: [9, 10, 11, 12, 18, 19, 20], mastodon: [9, 10, 12, 17, 18, 19], telegram: [8, 12, 18, 19, 20],
  discord: [16, 17, 18, 19, 20, 21], reddit: [8, 9, 10, 11, 12], tumblr: [17, 19, 20, 21, 22], dailymotion: [12, 17, 18, 19, 20],
};
const env = (k) => (process.env[k] || '').trim();
export const berlinStunde = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d).find((x) => x.type === 'hour').value);

export function fensterFuer(plattform) {
  const eigen = env(`POST_ZEITEN_${plattform.toUpperCase()}`);
  if (eigen) return eigen.split(',').map(Number).filter((h) => h >= 0 && h <= 23);
  return FENSTER[plattform.toLowerCase()] || null;
}

// Jetzt posten? Ja in einer starken Stunde - oder wenn die restlichen starken Stunden heute nicht mehr reichen (Aufholen).
export function jetztPosten(plattform, stunde, { heute = 0, limit = 5, letzteStunde = 22 } = {}) {
  if (/^(aus|0|nein|false)$/i.test(env('POST_ZEITEN'))) return true;
  const f = fensterFuer(plattform);
  if (!f || !f.length || f.includes(stunde)) return true;
  return f.filter((h) => h > stunde && h <= letzteStunde).length < limit - heute;
}

// Doppel-Post-Schutz: dasselbe Produkt nicht zweimal in 24 h auf demselben Kanal.
export const produktSchluessel = (titel) => String(titel || '').split(/\s[–—-]\s/)[0].trim().toLowerCase();
export function kuerzlichGepostet(posts, plattform, titel, { jetzt = Date.now(), stunden = 24 } = {}) {
  const k = produktSchluessel(titel);
  return Boolean(k) && (posts || []).some((p) => p.plattform === plattform && p.produkt === k && jetzt - Date.parse(p.gepostet) < stunden * 36e5);
}
