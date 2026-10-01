// Agenten-Fliessband: Labor -> Video-Fabrik -> Pruefer -> Poster -> Zahlen-Sammler. Jeder Agent meldet
// seine ECHTE Tagesleistung aus den Dateien im Repo (nichts geschaetzt). Der Engpass-Chef rechnet nach
// NEULAND (kleinste Kapazitaet begrenzt alles, zentrale/js/engpass.js) und verschiebt das knappe
// KI-Kontingent zwischen Labor und Fabrik - plus genau eine Aufgabe fuer den Menschen, falls noetig.
import { readFileSync, existsSync } from 'node:fs';
import '../../zentrale/js/engpass.js';

const TAG = 864e5;
const lesen = (pfad, leer) => { try { return existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')) : leer; } catch { return leer; } };

export const AGENTEN = {
  labor: { name: 'Werbe-Labor', job: 'testet Hooks an der Test-Jury', einheit: 'Jury-Gewinner' },
  fabrik: { name: 'Video-Fabrik', job: 'baut Produkt-Videos', einheit: 'Videos' },
  pruefer: { name: 'Video-Prüfer', job: 'gibt fehlerfreie Videos frei', einheit: 'freigegeben' },
  poster: { name: 'Poster', job: 'postet auf allen verbundenen Kanälen', einheit: 'gepostet' },
  sammler: { name: 'Zahlen-Sammler', job: 'holt echte Aufrufe und Likes', einheit: 'gemessen' },
};

// Durchschnitt pro Tag ueber die letzten `tage` Tage (nur Tage, seit es die Quelle gibt; mind. 1).
function proTag(zeitpunkte, jetzt, tage) {
  const ab = jetzt - tage * TAG;
  const t = zeitpunkte.map((x) => Date.parse(x)).filter((x) => Number.isFinite(x) && x > ab && x <= jetzt);
  if (!t.length) return 0;
  const spanne = Math.min(tage, Math.floor((jetzt - Math.min(...t)) / TAG) + 1); // heute zaehlt mit
  return Math.round((t.length / spanne) * 10) / 10;
}

export function messen({ jetzt = Date.now(), tage = 7, pfade = {} } = {}) {
  const p = { feed: 'video-feed/videos.json', pruefung: 'automations/state/video-pruefung.json', labor: 'automations/state/werbe-labor.json', posts: 'video-feed/posts.json', ...pfade };
  const feed = lesen(p.feed, { videos: [] }).videos || [];
  const pruefung = lesen(p.pruefung, { laeufe: [] }).laeufe || [];
  const labor = Object.values(lesen(p.labor, { produkte: {} }).produkte || {});
  const posts = lesen(p.posts, []);
  const deAds = feed.filter((v) => (v.sprache || 'de') === 'de' && !v.kanal && !v.teaser && v.thema !== 'highlights');
  const freigaben = pruefung.flatMap((l) => Array(Math.max(0, (l.ok || 0) + (l.repariert || 0))).fill(l.datum));
  const gepostet = [...new Map(posts.map((x) => [x.datei, x.gepostet])).values()];
  const kanaele = new Set(posts.filter((x) => jetzt - Date.parse(x.gepostet) < tage * TAG).map((x) => x.plattform));
  return {
    stand: new Date(jetzt).toISOString(),
    leistung: {
      labor: proTag(labor.filter((e) => e.gewinner?.quelle === 'Jury' && !e.ersatz).map((e) => e.erstellt), jetzt, tage),
      fabrik: proTag(deAds.map((v) => v.erstellt), jetzt, tage),
      pruefer: proTag(freigaben, jetzt, tage),
      poster: proTag(gepostet, jetzt, tage),
      sammler: proTag(posts.filter((x) => x.zahlen?.gemessen).map((x) => x.zahlen.gemessen), jetzt, tage),
    },
    kanaele: [...kanaele],
    laborQuote: labor.length ? Math.round((labor.filter((e) => e.gewinner?.quelle === 'Jury').length / labor.length) * 100) : null,
  };
}

// Engpass-Rechnung ueber die serielle Kette (jedes Video durchlaeuft jeden Schritt; Labor ist Zulieferer).
export function ketteAnalysieren(m, ziel) {
  const ids = ['fabrik', 'pruefer', 'poster', 'sammler'];
  return globalThis.ZEngpass.analyse({
    auftraege: ziel,
    schritte: ids.map((id) => ({ id, name: AGENTEN[id].name, verfuegbar: Math.max(0, m.leistung[id]), jeAuftrag: 1 })),
  });
}

// Entscheidung des Engpass-Chefs: Plan fuer morgen (Fabrik-/Labor-Menge) + hoechstens EINE Aufgabe fuer dich.
// KI-Budget: Labor ~3 Anfragen je Produkt, Fabrik ~3 je Video. Die Summe bleibt gleich - nur die Verteilung wandert.
export function entscheiden(m, { ziel = 5, altPlan = {} } = {}) {
  const a = ketteAnalysieren(m, ziel);
  const engpass = a.vorher.engpaesse[0];
  const L = m.leistung;
  // Gleiches KI-Budget wie im Normalbetrieb (Labor 6 + Fabrik Ziel, je ~3 Anfragen) - nur die Verteilung wandert.
  const budget = (6 + ziel) * 3;
  const laborFuer = (fabrik) => Math.min(20, Math.max(3, Math.floor((budget - fabrik * 3) / 3)));
  let plan = { fabrikAnzahl: ziel, laborAnzahl: 6 }, grund = '', aufgabe = null;
  if (engpass.id === 'poster' && !m.kanaele.length) {
    plan = { fabrikAnzahl: 2, laborAnzahl: laborFuer(2) };
    grund = `Kein Kanal postet - Videos stauen sich. Fabrik baut nur 2 pro Tag, das freie KI-Kontingent geht ins Labor (${plan.laborAnzahl} statt 6 Produkte vorgetestet).`;
    aufgabe = { titel: 'Einen Kanal verbinden', text: 'Telegram oder Bluesky (5 Minuten): GitHub > Settings > Secrets > Actions. Danach postet der Poster automatisch.', ziel: 'daten' };
  } else if (engpass.id === 'poster') {
    const f = Math.min(ziel, Math.max(2, Math.ceil(L.poster) + 1));
    plan = { fabrikAnzahl: f, laborAnzahl: laborFuer(f) };
    grund = `Poster schafft ${L.poster}/Tag (Tageslimits der Kanäle). Fabrik baut passend dazu ${plan.fabrikAnzahl}, Rest des KI-Kontingents ins Labor.`;
    aufgabe = { titel: 'Weiteren Kanal verbinden', text: 'Jeder zusätzliche Kanal erhöht den Durchsatz direkt (YouTube, Instagram, TikTok).', ziel: 'daten' };
  } else if (engpass.id === 'fabrik') {
    plan = { fabrikAnzahl: Math.min(10, Math.floor((budget - 9) / 3)), laborAnzahl: 3 };
    grund = `Fabrik schafft nur ${L.fabrik} von ${ziel} Videos/Tag (meist gedrosselte Gratis-KI). Labor testet nur 3 Produkte, die Fabrik bekommt das KI-Kontingent für ${plan.fabrikAnzahl} Videos.`;
  } else if (engpass.id === 'pruefer') {
    plan = { fabrikAnzahl: Math.min(10, ziel + 1), laborAnzahl: laborFuer(Math.min(10, ziel + 1)) };
    grund = `Prüfer gibt nur ${L.pruefer}/Tag frei - zu viele Videos fallen durch. Fabrik baut einen Puffer mehr, abgelehnte werden automatisch neu gebaut.`;
    aufgabe = { titel: 'Prüfbericht ansehen', text: 'Welche Fehler häufen sich? Steht in automations/state/video-pruefung.json.', ziel: 'heute' };
  } else if (engpass.id === 'sammler') {
    plan = { fabrikAnzahl: ziel, laborAnzahl: 6 };
    grund = 'Videos gehen raus, aber es kommen keine Zahlen zurück - ohne Zahlen kann nichts lernen.';
    aufgabe = { titel: 'Kanal mit Statistik verbinden', text: 'YouTube, Bluesky, Instagram oder Facebook liefern Zahlen; Telegram und Discord nicht.', ziel: 'daten' };
  }
  if (a.vorher.durchsatz >= ziel) {
    plan = { fabrikAnzahl: Math.min(10, ziel + 1), laborAnzahl: 6 };
    grund = `Alle Agenten schaffen das Ziel von ${ziel}/Tag - Ziel wird morgen auf ${plan.fabrikAnzahl} erhöht.`;
    aufgabe = null;
  }
  // Verschiebung im NEULAND-Sinn: KI-Anfragen vom Labor in die Fabrik (oder umgekehrt) bei gleicher Summe.
  const vorherKi = (altPlan.laborAnzahl ?? 6) * 3 + (altPlan.fabrikAnzahl ?? 5) * 3;
  const nachherKi = plan.laborAnzahl * 3 + plan.fabrikAnzahl * 3;
  return { engpass, durchsatz: a.vorher.durchsatz, ziel, analyse: a, plan, grund, aufgabe, kiAnfragen: { vorher: vorherKi, nachher: nachherKi } };
}
