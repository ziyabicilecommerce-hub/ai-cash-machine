// TikTok-Viral-Zentrale (#103): rechnet die Buffer-Posts der TikTok-Konten zu Dashboard-Daten zusammen
// (Kennzahlen gesamt und je Konto, beste Videos, geplante Posts, Lern-Ergebnis, automatische Tipps).
// Reine Funktionen - ohne Netz testbar.
import { typAus } from './tiktokLernen.mjs';

const wert = (p, typ) => Number((p.metrics || []).find((m) => m.type === typ)?.value) || 0;
const ersteZeile = (t) => String(t || '').split('\n')[0].replace(/#[\p{L}\p{N}_]+/gu, '').trim().slice(0, 90);
const sicherLink = (u) => (/^https:\/\/(www\.)?tiktok\.com\//.test(String(u || '')) ? u : '');
const norm = (s) => String(s || '').replace(/^@/, '').toLowerCase();
const runden = (x, n = 1) => Math.round(x * 10 ** n) / 10 ** n;

function summe(posts) {
  const mitZahlen = posts.filter((p) => wert(p, 'views') > 0);
  const aufrufe = posts.reduce((a, p) => a + wert(p, 'views'), 0);
  return {
    posts: posts.length,
    aufrufe,
    likes: posts.reduce((a, p) => a + wert(p, 'reactions'), 0),
    kommentare: posts.reduce((a, p) => a + wert(p, 'comments'), 0),
    shares: posts.reduce((a, p) => a + wert(p, 'shares'), 0),
    sehdauer: mitZahlen.length ? runden(mitZahlen.reduce((a, p) => a + wert(p, 'averageTimeWatched'), 0) / mitZahlen.length) : 0,
  };
}

export function tippsAus(gesamt, konten, geplant, fehler, ohneZahlen = 0) {
  const tipps = [];
  if (ohneZahlen) tipps.push({ stufe: 'warn', text: `Buffer holt für ${ohneZahlen} Post(s) keine Zahlen mehr von TikTok ab - die Zahlen hier sind zu niedrig. In TikTok selbst nachsehen oder den Kanal in Buffer neu verbinden.` });
  if (!gesamt.aufrufe) tipps.push({ stufe: 'info', text: 'Noch keine Zahlen von TikTok - die kommen meist 1-2 Tage nach dem Post.' });
  if (gesamt.aufrufe && gesamt.sehdauer < 8) tipps.push({ stufe: 'warn', text: `Sehdauer nur ${gesamt.sehdauer} s: die Leute wischen früh weg. Frage noch schneller, Videos kürzer.` });
  if (gesamt.aufrufe >= 300 && (gesamt.kommentare / gesamt.aufrufe) * 100 < 1) tipps.push({ stufe: 'warn', text: 'Unter 1 Kommentar pro 100 Aufrufe: mehr Fragen, bei denen jeder mitreden will (Schätzen, Streit-Fragen).' });
  const mitAufrufen = konten.filter((k) => k.aufrufe > 0);
  if (mitAufrufen.length >= 2) {
    const schnitt = mitAufrufen.reduce((a, k) => a + k.aufrufe / Math.max(k.posts, 1), 0) / mitAufrufen.length;
    for (const k of mitAufrufen) {
      const proPost = k.aufrufe / Math.max(k.posts, 1);
      if (proPost < schnitt * 0.5) tipps.push({ stufe: 'warn', text: `${k.name} läuft deutlich schwächer (${Math.round(proPost)} Aufrufe/Post): Thema ${k.nische.join('/') || '-'} prüfen.` });
      if (proPost > schnitt * 1.5) tipps.push({ stufe: 'gut', text: `${k.name} läuft stark (${Math.round(proPost)} Aufrufe/Post) - mehr in diese Richtung.` });
    }
  }
  if (!geplant.length) tipps.push({ stufe: 'warn', text: 'Keine TikTok-Posts geplant - der nächste Fakten-Lauf füllt die Warteschlange.' });
  if (fehler) tipps.push({ stufe: 'warn', text: `${fehler} Post(s) bei Buffer fehlgeschlagen - in Buffer nachsehen.` });
  return tipps;
}

export function dashboardDaten({ posts = [], kanaele = [], nischen = {}, serien = {}, lernen = null, jetzt = Date.now() }) {
  const name = Object.fromEntries(kanaele.map((k) => [k.id, `@${norm(k.name)}`]));
  const gesendet = posts.filter((p) => p.status === 'sent');
  const tag = 86400000;
  const zeit = (p) => Date.parse(p.sentAt || p.dueAt || 0) || 0;
  const letzte7 = gesendet.filter((p) => zeit(p) >= jetzt - 7 * tag);
  const davor7 = gesendet.filter((p) => zeit(p) < jetzt - 7 * tag && zeit(p) >= jetzt - 14 * tag);
  const gesamt = { ...summe(gesendet), aufrufe7: summe(letzte7).aufrufe, aufrufeVor7: summe(davor7).aufrufe };
  const zeile = (p) => ({
    zeit: p.sentAt || p.dueAt || '', konto: name[p.channelId] || '?', text: ersteZeile(p.text), link: sicherLink(p.externalLink),
    format: typAus(p.text), aufrufe: wert(p, 'views'), sehdauer: runden(wert(p, 'averageTimeWatched')), likes: wert(p, 'reactions'), kommentare: wert(p, 'comments'),
  });
  const konten = kanaele.map((k) => {
    const eigene = gesendet.filter((p) => p.channelId === k.id);
    const bester = [...eigene].sort((a, b) => wert(b, 'views') - wert(a, 'views'))[0];
    return { name: `@${norm(k.name)}`, nische: nischen[norm(k.name)] || [], serie: serien[`@${norm(k.name)}`] || 0, ...summe(eigene), bester: bester && wert(bester, 'views') ? zeile(bester) : null };
  });
  const geplant = posts.filter((p) => p.status === 'scheduled').sort((a, b) => zeit(a) - zeit(b)).map(zeile);
  const fehler = posts.filter((p) => p.status === 'error').length;
  // Buffer aktualisiert die Zahlen eines Posts nach dem Senden; ist das nach 6 Stunden nie passiert, fehlen sie.
  const ohneZahlen = gesendet.filter((p) => zeit(p) < jetzt - 6 * 3600000 && p.metricsUpdatedAt && Date.parse(p.metricsUpdatedAt) < zeit(p)).length;
  const letzte = [...gesendet].sort((a, b) => zeit(b) - zeit(a)).slice(0, 30).map(zeile);
  return { stand: new Date(jetzt).toISOString(), gesamt, konten, geplant, letzte, fehler, ohneZahlen, lernen, tipps: tippsAus(gesamt, konten, geplant, fehler, ohneZahlen) };
}
