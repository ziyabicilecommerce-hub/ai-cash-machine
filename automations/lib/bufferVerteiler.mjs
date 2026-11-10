// Buffer-Verteiler (#113): jeder Buffer-Kanal bekommt EIGENE Inhalte, mindestens 5 Posts am Tag.
// Reine Funktionen - ohne Netz testbar. Kanal-IDs sind keine Geheimnisse (stehen auch in Buffer-Links).
// Keine Shop-Werbung: jeder Kanal bekommt allgemeine Inhalte, jeder etwas anderes.
import { typAus } from './tiktokLernen.mjs';
// Weniger, dafür zur besten Zeit (10.11., Test für eine Woche): alle Top-Videos blieben bei ~1.000 Aufrufen stehen,
// mit 8 Shorts am Tag fiel YouTube von 4.435 auf 1.716 Aufrufe/Tag. Jetzt 3 Videos je Kanal und Tag (ziel 2 = bis zu 3),
// nur nachts und abends (Ø 209 bzw. 175 Aufrufe; nachmittags Ø 101). Zurück: ZIEL_WENIGER = 5 und guteStunde = () => true.
export const ZIEL_WENIGER = 2;
export const guteStunde = (stunde) => stunde < 6 || stunde >= 19;
export const KANAELE = [
  // desk.rebel (10.11.): Sprach-Test wie auf YouTube - Englisch erreicht weltweit mehr Leute, dort holt es Ø 519 statt 340.
  // Halbe-halbe, bis der Wochenbericht für diesen Kanal einen klaren Sieger hat (sprachTests); purivelle bleibt deutsch.
  { id: '6ae8f441e29c69a1713e44f3', name: 'desk.rebel', dienst: 'instagram', quelle: 'horror-mix', ziel: ZIEL_WENIGER },
  // purivelle (06.11., Wunsch des Nutzers): Horror statt "Wahr oder Mythos?" - eigene Geschichten, nie dieselbe wie desk.rebel
  { id: '6ae8f3dbe29c69a1713e416a', name: 'purivelle.785', dienst: 'instagram', quelle: 'horror', ziel: ZIEL_WENIGER },
  // YouTube: Sprach-Test (06.11.) - deutsche Horror-Shorts holten hier 179-706 Aufrufe, Englisch erreicht weltweit mehr.
  // Halbe-halbe, bis der Wochenbericht einen klaren Sieger hat; dann bekommt der 85 % (sprachAnteil).
  { id: '6ae8f39ae29c69a1713e3f33', name: 'giyuuu sama', dienst: 'youtube', quelle: 'horror-mix', ziel: ZIEL_WENIGER },
  // Englischer Horror-Kanal: an, sobald seine Buffer-Kanal-ID eingetragen ist (Repo-Variable EN_KANAL, optional EN_DIENST)
  ...(/^[a-f\d]{24}$/.test(process.env.EN_KANAL || '') ? [{ id: process.env.EN_KANAL, name: 'english-horror', dienst: process.env.EN_DIENST || 'youtube', quelle: 'horror-en' }] : []),
];
// Die TikTok-Konten werden von Serie, Videobot und Fakten-Kanal bespielt - hier nur gezählt.
export const TIKTOK = [
  { id: '6ac7cb606a5c39ccb6535fab', name: 'futureflowx3' },
  { id: '6ac7cae66a5c39ccb6535c40', name: 'zyx_7851' },
  { id: '6ac7ca226a5c39ccb65356a5', name: 'futureflowxx' },
];
export const ZIEL_PRO_TAG = 5;
export const ABSTAND_MIN = 90;
export const KI_HINWEIS = '(KI-generiert: Bild, Stimme und Text wurden mit KI erstellt.)';

// Shop-Werbung erkennt man am Shop-Link oder Shop-Hashtag (nicht am Kontonamen @purivelle.785)
const WERBUNG = /deskrebel\.store|purivelle\.store|#deskrebel|#purivelle|deskrebel |purivelle /i;
const text = (v) => `${v.url || ''} ${v.caption || ''} ${v.thema || ''} ${v.titel || ''}`.toLowerCase();
const sicher = (u) => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\//.test(String(u || ''));

// Welche Videos aus dem Feed passen zu welcher Quelle (nur Hochformat, nur Deutsch/ohne Sprache). Nie Shop-Videos.
export function passend(videos, quelle, konto = '') {
  const basis = videos.filter((v) => (!v.sprache || ['de', 'int'].includes(v.sprache)) && v.format === 'hoch' && sicher(v.url) && (v.dauer || 0) <= 180)
    .filter((v, i, alle) => alle.findIndex((x) => x.datei === v.datei) === i);  // der Feed enthält manche Videos doppelt
  if (quelle === 'anime') return basis.filter((v) => !v.kanal && text(v).includes('anime') && !WERBUNG.test(text(v)));
  if (quelle === 'fakten') {
    // eigene Fakten-Videos des Kontos zuerst, dann neutrale, dann die der TikTok-Konten; nie die eines anderen Instagram-Kontos
    const rang = (v) => (v.konto === `@${konto}` ? 0 : !v.konto ? 1 : 2);
    return basis.filter((v) => v.kanal === 'fakten' && !WERBUNG.test(text(v)) && !(v.konto && /desk\.rebel|purivelle/.test(v.konto) && v.konto !== `@${konto}`))
      .sort((a, b) => rang(a) - rang(b));
  }
  return [];
}

const passendRang = (v) => (v.kanal === 'fakten' ? (v.konto && /desk\.rebel|purivelle/.test(v.konto) ? 0 : !v.konto ? 1 : 2) : 0);

// Nächstes Video: noch nie auf diesem Kanal gepostet (neueste zuerst), sonst das am längsten nicht gepostete (Wiederholung)
// formatPunkte: Ø Aufrufe je Format auf diesem Konto (formatWerte) - das stärkste Format kommt zuerst
export function naechstes(videos, gepostet = {}, formatPunkte = null) {
  if (!videos.length) return null;
  const rang = (v) => videos.indexOf(v);
  const neu = videos.filter((v) => !gepostet[v.datei]);
  const werte = Object.values(formatPunkte || {});
  const mittel = werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : 0;
  const fp = (v) => (formatPunkte ? formatPunkte[typAus(v.caption || v.titel)] ?? mittel : 0);
  // Reihenfolge der Quelle zählt zuerst (z. B. eigene Fakten-Videos), dann das stärkste Format, dann die neuesten
  neu.sort((a, b) => (passendRang(a) - passendRang(b)) || (fp(b) - fp(a)) || String(b.erstellt || '').localeCompare(String(a.erstellt || '')) || rang(a) - rang(b));
  if (neu.length) return neu[0];
  return [...videos].sort((a, b) => String(gepostet[a.datei]).localeCompare(String(gepostet[b.datei])))[0];
}

// Soll dieser Kanal jetzt posten? Höchstens ZIEL_PRO_TAG+1 am Tag und mit Abstand zum letzten Post.
// Ø Aufrufe je Format für ein Konto aus daten.json "letzte" (nur Posts mit Zahlen, mind. 2 je Format)
export function formatWerte(letzte = [], konto = '', jetzt = Date.now()) {
  const g = {};
  for (const p of letzte) {
    if (!String(p.konto || '').includes(konto) || !(p.aufrufe > 0) || jetzt - new Date(p.zeit) < 864e5) continue;
    (g[p.format] ||= []).push(p.aufrufe);
  }
  const aus = Object.fromEntries(Object.entries(g).filter(([, l]) => l.length >= 2).map(([f, l]) => [f, l.reduce((a, b) => a + b, 0) / l.length]));
  return Object.keys(aus).length >= 2 ? aus : null;  // nur mit einem echten Vergleich
}

export function postenJetzt(heute, letzter, jetzt = Date.now(), { ziel = ZIEL_PRO_TAG, abstandMin = ABSTAND_MIN } = {}) {
  if (heute > ziel) return false;
  if (letzter && jetzt - Date.parse(letzter) < abstandMin * 60000) return false;
  return true;
}

// Viral-Taktik je Nische: wenige passende Hashtags (Nische + Reichweite DE) und ein erster Kommentar mit Frage -
// Kommentare sind das stärkste Signal für Reels. Die 1/2-Wahl aus dem Horror-Video steht direkt als Antwort-Vorlage drin.
export const TAGS = {
  // Instagram erlaubt höchstens 5 Hashtags pro Beitrag
  horror: '#horror #gruselgeschichte #creepypasta #gänsehaut #horrorstory',
  fakten: '#wusstestdu #fakten #wissen #krassefakten #lernen',
  'horror-en': '#horror #scary #creepypasta #scarystories #horrorstory',
  anime: '#anime #animeserie #animeshorts #shorts',
};
export function ersterKommentar(v, quelle) {
  if (quelle === 'horror-en') {
    if (/hidden/i.test(v.caption || '')) return 'At what second did you spot the eyes? 👀 Drop the time, e.g. 0:07 👇';
    const w = String(v.caption || '').match(/1️⃣\s*(.+?)\s+or\s+2️⃣\s*(.+?)\?/);
    return w ? `What do you do? 1️⃣ ${w[1]} or 2️⃣ ${w[2]} - just comment the number 👇` : 'What would you have done? 👇';
  }
  if (quelle === 'horror') {
    if (/versteckt/i.test(v.caption || '')) return 'Bei welcher Sekunde hast du die Augen gesehen? 👀 Schreib die Zeit, z. B. 0:07 👇';
    const w = String(v.caption || '').match(/1️⃣\s*(.+?)\s+oder\s+2️⃣\s*(.+?)\?/);
    return w ? `Was machst du? 1️⃣ ${w[1]} oder 2️⃣ ${w[2]} - schreib nur die Zahl 👇` : 'Was hättest du gemacht? Schreib es hier rein 👇';
  }
  if (quelle === 'fakten') return 'Wusstest du das schon? Ja oder Nein 👇 Markier jemanden, der das wissen muss!';
  return '';
}

// Text je Plattform: Instagram ohne nicht klickbaren Link, YouTube mit Titel. Immer KI-Hinweis.
export function beitrag(v, dienst, quelle = '') {
  let roh = String(v.caption || v.titel || '').replace(/👉\s*https?:\/\/\S+/g, '').replace(/https?:\/\/\S+/g, '')
    .replace(/^.*jetzt auf YouTube!?\s*$/gim, '').replace(/^.*Folge @.*$/gim, '').replace(/Tag \d+ von \d+ 🔥\s*/g, '').replace(/\n{3,}/g, '\n\n').trim();
  // Caption besteht nur aus Hashtags? Dann steht der Titel davor - sonst weiß keiner, worum es geht
  if (v.titel && (!roh || roh.startsWith('#'))) roh = `${v.titel}\n\n${roh}`.trim();
  // vorhandene Hashtags durch die Nischen-Tags ersetzen (keine doppelten, keine fremden Kontonamen)
  const tags = TAGS[quelle] || '';
  if (tags) roh = roh.replace(/(^|\s)#\p{L}[\p{L}\p{N}_]*/gu, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const en = quelle === 'horror-en', hinweis = en ? '(AI-generated: image, voice and text were made with AI. Fictional story.)' : KI_HINWEIS;
  if (dienst === 'youtube' && quelle.startsWith('horror')) {
    // Shorts-Titel = der Hook (das, was neugierig macht), nicht der interne Geschichtenname
    let hook = (roh.split(/\s*(?:🎧|👀|1️⃣|\n)/)[0] || v.titel || 'Horror').replace(/\s+/g, ' ').trim();
    if (hook.length > 85) hook = hook.slice(0, 85).replace(/\s+\S*$/, '') + '…';
    const beschreibung = `${roh}\n\n${en ? 'A new scary story every day – subscribe if you dare.\n#horror #scary #creepypasta #shorts' : 'Jeden Tag eine neue Gruselgeschichte – abonnieren, wenn du dich traust.\n#horror #gruselgeschichte #creepypasta #shorts'}\n${hinweis}`.slice(0, 4900);
    return { text: beschreibung, metadata: { youtube: { title: `${hook} 😨 #shorts`.slice(0, 100), categoryId: '24', madeForKids: false, isAiGenerated: true, privacy: 'public' } } };
  }
  if (dienst === 'youtube') {
    const titel = String(v.titel || 'Kage no Shiro').replace(/\s+/g, ' ').slice(0, 90);
    const beschreibung = `${roh || titel}\n\nEigene Anime-Serie mit eigenen Figuren. Abonnieren für die nächste Folge!\n${tags || '#anime #shorts'}\n${KI_HINWEIS}`.slice(0, 4900);
    return { text: beschreibung, metadata: { youtube: { title: `${titel} #shorts`.slice(0, 100), categoryId: '1', madeForKids: false, isAiGenerated: true, privacy: 'public' } } };
  }
  const kommentar = ersterKommentar(v, quelle);
  return { text: `${roh}\n\n${tags}\n${hinweis}`.replace(/\n{3,}/g, '\n\n').slice(0, 2100),
    metadata: { instagram: { type: 'reel', shouldShareToFeed: true, isAiGenerated: true, ...(kommentar ? { firstComment: kommentar } : {}) } } };
}

// Beginn des heutigen Tages in Berlin als ISO (für die Zählung "Posts heute")
export function heuteBerlin(jetzt = new Date()) {
  const tag = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(jetzt);
  const versatz = new Date(jetzt.toLocaleString('en-US', { timeZone: 'Europe/Berlin' })) - new Date(jetzt.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(Date.parse(`${tag}T00:00:00Z`) - versatz).toISOString();
}

// Buffer-Posts zählen: alles außer Fehlern/Entwürfen zählt (gesendet, wird gesendet, geplant)
// Instagram-Story als Anstoß fürs neue Reel: Titelbild + Text-Sticker, ohne Beitragstext (zählt so nicht als Post)
// sticker/alt: für die 2-Satz-Horror-Kacheln (kurzHorror.mjs) - sonst der Hinweis aufs neue Reel
export function storyEingabe(kanalId, coverUrl, en = false, sticker = '', alt = '') {
  return { channelId: kanalId, text: '', schedulingType: 'automatic', mode: 'shareNow',
    // .mp4 -> Video-Story (2-Satz-Horror mit Schock), sonst Bild
    assets: [/\.mp4$/i.test(coverUrl) ? { video: { url: coverUrl } } : { image: { url: coverUrl, metadata: { altText: alt || (en ? 'Cover of the new horror video' : 'Titelbild des neuen Horror-Videos') } } }],
    metadata: { instagram: { type: 'story', shouldShareToFeed: false, isAiGenerated: true, stickerFields: { text: sticker || (en ? 'New video 👀 Headphones on! Check my profile' : 'Neues Video 👀 Kopfhörer auf! Schau auf mein Profil') } } } };
}

// A/B-Test: jedes Feature ist bei 30 % der Horror-Videos aus - so zeigt der Wochenbericht, was wirklich wirkt
// duhook: Anfangssatz im Du-Stil statt "Ich ..." - halbe-halbe, weil hier keine Variante die "normale" ist
// KI-Bilder sind seit 06.11. immer an (Wunsch des Nutzers) und deshalb nicht mehr im A/B-Test
// schlag (11.11.): große Schlagzeile (höchstens 6 Wörter) in den ersten 2,6 s - halbe-halbe, bis Zahlen da sind
export const AB_FEATURES = { kalt: 0.3, raum: 0.3, suchbild: 0.3, duhook: 0.5, schlag: 0.5 };  // Wahrscheinlichkeit für "aus"
export function abVariante(zufall = Math.random, gewichte = AB_FEATURES) {
  return Object.fromEntries(Object.entries(gewichte).map(([f, aus]) => [f, zufall() >= aus]));
}
// Selbst-Optimierung: hat der Wochenbericht ein klares Ergebnis (je >= 3 Videos, >= 0,5 s Unterschied in der Sehdauer),
// läuft der Gewinner bei 85 % der Videos, der Verlierer nur noch bei 15 % - ein Rest bleibt zum Weitertesten.
export function abGewichte(ab = {}) {
  const g = { ...AB_FEATURES };
  for (const [f, w] of Object.entries(ab || {})) {
    if (!(f in g) || !(w?.an?.n >= 3) || !(w?.aus?.n >= 3)) continue;
    const d = w.an.sehdauer - w.aus.sehdauer;
    if (d >= 0.5) g[f] = 0.15; else if (d <= -0.5) g[f] = 0.85;
  }
  return g;
}
// YouTube: Gewinner nach Aufrufen (>= 3 Videos je Seite, mindestens 1,3x so viele) - Sehdauer gibt es dort nicht
export function abGewichteAufrufe(ab = {}) {
  const g = { ...AB_FEATURES };
  for (const [f, w] of Object.entries(ab || {})) {
    if (!(f in g) || !(w?.an?.n >= 3) || !(w?.aus?.n >= 3)) continue;
    const r = w.an.schnitt / Math.max(w.aus.schnitt, 1);
    if (r >= 1.3) g[f] = 0.15; else if (r <= 1 / 1.3) g[f] = 0.85;
  }
  return g;
}
export const abSchluessel = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 40);

// Anteil englischer Videos auf dem Mix-Kanal: 50 %, bis je >= 4 Videos mit Zahlen da sind und eine Sprache >= 1,5x so viele Aufrufe holt
export function sprachAnteil(test = null) {
  if (!(test?.de?.n >= 4) || !(test?.en?.n >= 4)) return 0.5;
  const v = test.en.schnitt / Math.max(test.de.schnitt, 1);
  return v >= 1.5 ? 0.85 : v <= 1 / 1.5 ? 0.15 : 0.5;
}

// Zweite Quelle: unser eigenes Post-Protokoll (buffer-verteiler/stand.json, je Kanal { schluessel: ISO-Zeit }).
// Buffer listet frische Posts verzögert - am 08.11. bekam desk.rebel so 8 statt höchstens 6 Reels, teils 15 Min. auseinander.
// Es zählt immer der höhere Wert; Stories (kurz:) zählen nicht.
export function zaehlenMitStand(buffer = { heute: 0, letzter: null }, standKanal = {}, heute = '') {
  const zeiten = Object.entries(standKanal || {}).filter(([k, t]) => !k.startsWith('kurz:') && /^\d{4}-\d{2}-\d{2}T/.test(String(t))).map(([, t]) => String(t));
  const heuteStand = zeiten.filter((t) => t >= heute).length;
  const letzter = [buffer.letzter, ...zeiten].filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) || null;
  return { heute: Math.max(buffer.heute, heuteStand), letzter };
}

export function zaehlen(posts, kanalId) {
  // Stories (ohne Text) zählen nicht als Post - sie begleiten nur das Reel
  const eigene = posts.filter((p) => p.channelId === kanalId && !['error', 'draft'].includes(p.status) && (p.text === undefined || String(p.text).trim()));
  const zeiten = eigene.map((p) => p.sentAt || p.dueAt).filter(Boolean).sort();
  return { heute: eigene.length, letzter: zeiten.at(-1) || null };
}
