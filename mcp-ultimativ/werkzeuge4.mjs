// Ultimativ-MCP, Teil 4: die ZENTRALE als Werkzeuge - jede KI, an der dieser MCP haengt, sieht den echten
// Stand der Cash Machine (Engpass, 15 Kanaele, Shop-Doktor, Videos, Labor, Lernstand, Kommentare) und kann
// Agenten auf GitHub starten. Lesen geht ohne Schluessel (oeffentliches Repo); Starten braucht ein
// GITHUB_TOKEN (fine-grained, nur "Actions: write" fuer dieses Repo) und ist auf feste Agenten beschraenkt.
import { hole, kurz, zahl, T, S, N } from './werkzeuge.mjs';
import '../zentrale/js/engpass.js';
import { pruefen as werbePruefen } from '../automations/lib/werbeCheck.mjs';

const REPO = (process.env.ZENTRALE_REPO || 'ziyabicilecommerce-hub/ai-cash-machine').trim();
const ROH = (pfad) => `https://raw.githubusercontent.com/${REPO}/main/${pfad}`;
const SEITE = `https://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}`;
const datei = (pfad) => hole(`${ROH(pfad)}?t=${Math.floor(Date.now() / 60000)}`);

// Nur diese Agenten duerfen per MCP gestartet werden (keine beliebigen Workflows).
export const AGENTEN = {
  'video-fabrik': { datei: 'automation-94-video-fabrik.yml', eingaben: ['anzahl'] },
  'shop-doktor': { datei: 'shop-doktor.yml', eingaben: [] },
  'engpass-chef': { datei: 'engpass-chef.yml', eingaben: ['ziel'] },
  'werbe-labor': { datei: 'werbe-labor.yml', eingaben: ['anzahl'] },
  'poster': { datei: 'automation-99-direkt-poster.yml', eingaben: ['anzahl'] },
  'kommentar-agent': { datei: 'kommentar-agent.yml', eingaben: [] },
  'zahlen-sammler': { datei: 'leistung-sammler.yml', eingaben: [] },
  'fakten-kanal': { datei: 'automation-100-fakten-kanal.yml', eingaben: ['anzahl'] },
  'community-agent': { datei: 'community-agent.yml', eingaben: [] },
};

async function zentraleStatus() {
  const e = await datei('zentrale/daten/engpass.json');
  return { stand: e.stand, ziel_videos_pro_tag: e.ziel, engpass: e.engpass?.name, grund: e.grund, plan: e.plan, deine_aufgabe: e.aufgabe ? `${e.aufgabe.titel}: ${e.aufgabe.text}` : 'keine', agenten: (e.agenten || []).map((a) => ({ name: a.name, leistung_pro_tag: a.leistung, status: a.status })), zentrale: `${SEITE}/zentrale/` };
}

async function kanaeleStatus() {
  const k = await datei('video-feed/kanaele.json').catch(() => null);
  if (!k) return { hinweis: 'Noch kein Kanal-Status - er erscheint nach dem nächsten Poster-Lauf (stündlich 8-22 Uhr).', anleitung: `${SEITE}/zentrale/ (Bereich "15 Kanäle")` };
  const liste = Object.entries(k.kanaele || {}).map(([name, s]) => ({ name, verbunden: s.verbunden, heute: `${s.heute}/${s.limit}`, letzter_erfolg: s.letzterErfolg, letzter_fehler: s.letzterFehler?.text || null }));
  return { stand: k.stand, verbunden: `${liste.filter((x) => x.verbunden).length}/15`, kanaele: liste, anleitung: `${SEITE}/zentrale/ (Bereich "15 Kanäle")` };
}

async function shopDoktor({ shop, nur_kritisch }) {
  const d = await datei('zentrale/daten/shop-doktor.json');
  const stufen = nur_kritisch ? ['kritisch'] : ['kritisch', 'wichtig'];
  return {
    stand: d.stand,
    shops: (d.shops || []).filter((s) => !shop || s.name.toLowerCase().includes(String(shop).toLowerCase())).map((s) => ({
      name: s.name, punkte: s.punkte, startseite_ms: s.ladezeitMs, pflichtseiten: s.pflicht,
      todo: [...s.befunde.map((b) => ({ ...b, wo: 'Shop' })), ...s.produkte.flatMap((p) => p.befunde.map((b) => ({ ...b, wo: p.titel })))].filter((b) => stufen.includes(b.stufe)).slice(0, 30).map((b) => `${b.stufe.toUpperCase()} · ${b.wo}: ${b.was}${b.tipp ? ` → ${b.tipp}` : ''}`),
    })),
    letzte_aenderungen: (d.aenderungen || []).slice(0, 10).map((a) => `${a.datum} ${a.shop} · ${a.titel}: ${a.text}`),
  };
}

async function neuesteVideos({ limit, sprache }) {
  const f = await datei('video-feed/videos.json');
  const sp = String(sprache || 'de').toLowerCase();
  return (f.videos || []).filter((v) => sp === 'alle' || (v.sprache || 'de') === sp).slice(0, zahl(limit, 8, 1, 30))
    .map((v) => ({ titel: v.titel, datei: v.datei, sekunden: v.dauer, sprache: v.sprache, url: v.url, vorschau: v.vorschauUrl, erstellt: v.erstellt, anfaenge: (v.varianten || []).map((x) => x.hookTyp) }));
}

async function produktFeeds() {
  const d = await datei('zentrale/daten/shop-doktor.json');
  return Object.fromEntries(Object.entries(d.feeds || {}).map(([shop, f]) => [shop, { eintraege: f.eintraege, google_shopping: `${SEITE}/zentrale/${f.google}`, facebook_instagram: `${SEITE}/zentrale/${f.meta}`, pinterest: `${SEITE}/zentrale/${f.pinterest}` }]));
}

async function werbeLabor({ produkt }) {
  const d = await datei('zentrale/daten/werbe-labor.json');
  return Object.values(d.produkte || {}).filter((e) => !produkt || String(e.produkt).toLowerCase().includes(String(produkt).toLowerCase())).slice(0, 20)
    .map((e) => ({ produkt: e.produkt, gewinner_hook: e.final?.hook, kauf_psychologie: e.gewinner?.winkel, punkte: e.gewinner?.punkte, quelle: e.gewinner?.quelle, geht_an_fabrik: e.gewinner?.quelle === 'Jury' && !e.ersatz, einwand: e.einwand?.text || null, erstellt: e.erstellt }));
}

async function lernstand() {
  const l = await datei('automations/state/lernen.json').catch(() => null);
  if (!l || !l.posts) return { hinweis: 'Noch keine echten Zahlen - das Lernen startet, sobald ein Kanal postet und der Zahlen-Sammler misst.' };
  const top = (o) => Object.entries(o || {}).sort((a, b) => b[1].punkte - a[1].punkte).map(([k, e]) => ({ name: k, punkte: e.punkte, messungen: e.n }));
  return { stand: l.stand, posts_mit_zahlen: l.posts, hook_typen: top(l.hookTyp), formate: top(l.format), kauf_psychologie: top(l.winkel) };
}

async function suchbegriffe({ produkt }) {
  const d = await datei('zentrale/daten/suchbegriffe.json').catch(() => null);
  if (!d) return { hinweis: 'Noch keine Daten - der Such-Radar läuft täglich mit dem Zahlen-Sammler.' };
  const q = String(produkt || '').toLowerCase();
  return { stand: d.stand, produkte: Object.values(d.produkte || {}).filter((e) => !q || e.name.toLowerCase().includes(q)).map((e) => ({ name: e.name, fragen: e.fragen, google: e.google.slice(0, 8), youtube: e.youtube.slice(0, 8), hashtags: e.hashtags })) };
}

async function kommentareStatistik({ tage }) {
  const k = await datei('zentrale/daten/kommentare.json').catch(() => ({ tage: {} }));
  return Object.entries(k.tage || {}).slice(-zahl(tage, 7, 1, 30)).map(([datum, t]) => ({ datum, beantwortet: t.antworten, an_dich_gemeldet: t.melden, spam_ignoriert: t.ignorieren }));
}

function engpassRechnen({ auftraege, schritte, von, nach, menge }) {
  const liste = (Array.isArray(schritte) ? schritte : []).map((s, i) => ({ id: String(s.id || `s${i}`), name: String(s.name || `Schritt ${i + 1}`), verfuegbar: Number(s.verfuegbar), jeAuftrag: Number(s.jeAuftrag) }));
  const v = { von: String(von || liste[0]?.id), nach: String(nach || liste[1]?.id), menge: Number(menge) || 0 };
  const r = globalThis.ZEngpass.analyse({ auftraege: Number(auftraege) || 0, schritte: liste, verschiebung: v });
  return { vorher_moeglich: r.vorher.durchsatz, nachher_moeglich: r.nachher.durchsatz, veraenderung: r.differenz, engpass_vorher: r.vorher.engpaesse.map((e) => e.name), engpass_nachher: r.nachher.engpaesse.map((e) => e.name), kapazitaet_nachher: r.nachher.schritte.map((s) => ({ name: s.name, kapazitaet: s.kapazitaet })), offen_nachher: r.offenNachher, beste_verschiebung: globalThis.ZEngpass.ausbalancieren(liste.find((s) => s.id === v.von), liste.find((s) => s.id === v.nach)) };
}

export async function agentStarten({ agent, anzahl, ziel }, laden = fetch) {
  const a = AGENTEN[String(agent || '').toLowerCase()];
  if (!a) throw new Error(`Unbekannter Agent. Erlaubt: ${Object.keys(AGENTEN).join(', ')}`);
  const token = (process.env.GITHUB_TOKEN || '').trim();
  if (!token) throw new Error('Zum Starten braucht der MCP ein GITHUB_TOKEN (fine-grained, nur "Actions: write" für dieses Repo) in seiner Umgebung.');
  const inputs = {};
  if (a.eingaben.includes('anzahl') && anzahl) inputs.anzahl = String(zahl(anzahl, 1, 1, 10));
  if (a.eingaben.includes('ziel') && ziel) inputs.ziel = String(zahl(ziel, 5, 1, 10));
  const res = await laden(`https://api.github.com/repos/${REPO}/actions/workflows/${a.datei}/dispatches`, { method: 'POST', headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'cashmachine-ultimativ-mcp' }, body: JSON.stringify({ ref: 'main', inputs }) });
  if (res.status !== 204) throw new Error(`GitHub ${res.status}: ${kurz(await res.text(), 200)}`);
  return { gestartet: agent, eingaben: inputs, verlauf: `https://github.com/${REPO}/actions/workflows/${a.datei}` };
}

export const WERKZEUGE4 = [
  T('zentrale_status', 'Cash-Machine-Zentrale: heutiger Engpass, Plan, Leistung jedes Agenten und deine eine Aufgabe.', {}, [], zentraleStatus),
  T('kanaele_status', 'Status der 15 Social-Kanäle: verbunden, Posts heute, letzter Erfolg/Fehler.', {}, [], kanaeleStatus),
  T('shop_doktor', 'Live-Check der Shops: Punkte, Pflichtseiten, To-dos (kritisch/wichtig), letzte Preis-/Bestandsänderungen.', { shop: S('optional, z. B. Purivelle'), nur_kritisch: { type: 'boolean', description: 'nur kritische Punkte' } }, [], shopDoktor),
  T('neueste_videos', 'Neueste Videos aus dem Video-Feed mit Download- und Vorschau-Link.', { limit: N('max. Videos, Standard 8'), sprache: S('de (Standard), en, … oder alle') }, [], neuesteVideos),
  T('produkt_feeds', 'Links der Produkt-Feeds für Google Shopping, Facebook/Instagram und Pinterest.', {}, [], produktFeeds),
  T('werbe_labor', 'Getestete Gewinner-Hooks je Produkt aus dem Werbe-Labor.', { produkt: S('optional, Teil des Produktnamens') }, [], werbeLabor),
  T('lernstand', 'Was laut echten Zahlen wirkt: beste Hook-Typen, Formate und Kauf-Psychologie.', {}, [], lernstand),
  T('suchbegriffe', 'Such-Radar: echte Google-/YouTube-Suchen und Fragen je Produkt (Video-Ideen, Hashtags).', { produkt: S('optional, Teil des Produktnamens') }, [], suchbegriffe),
  T('werbe_check', 'Werbe-Check (HWG/UWG-Sicherheitsnetz, 12 Sprachen): findet Heilversprechen, „klinisch getestet“, Testsieger, erfundene Knappheit und Kundenzahlen in einem Werbetext.', { text: S('Werbetext, Titel oder Caption') }, ['text'], ({ text }) => { const t = werbePruefen(text); return { erlaubt: !t.some((x) => x.stufe === 'block'), treffer: t, hinweis: 'Keine Rechtsberatung - Schutz vor den häufigsten Abmahnfehlern.' }; }),
  T('kommentare_statistik', 'Kommentar-Agent: beantwortete, gemeldete und ignorierte Kommentare je Tag.', { tage: N('Tage, Standard 7') }, [], kommentareStatistik),
  T('engpass_rechnen', 'Engpass-Rechnung (NEULAND): wo stockt ein Ablauf und was bringt eine Verschiebung von Stunden?', { auftraege: N('erwartete Aufträge'), schritte: { type: 'array', description: '[{id, name, verfuegbar, jeAuftrag}]', items: { type: 'object' } }, von: S('id Geber-Schritt'), nach: S('id Empfänger-Schritt'), menge: N('verschobene Stunden') }, ['auftraege', 'schritte'], engpassRechnen),
  T('agent_starten', `Startet einen Agenten sofort auf GitHub: ${Object.keys(AGENTEN).join(', ')}.`, { agent: S('Name des Agenten'), anzahl: N('optional, z. B. Videos'), ziel: N('optional, Engpass-Chef: Videos pro Tag') }, ['agent'], (a) => agentStarten(a)),
];
