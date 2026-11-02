// Buffer-Verteiler (#113): jeder Buffer-Kanal bekommt EIGENE Inhalte, mindestens 5 Posts am Tag.
// Reine Funktionen - ohne Netz testbar. Kanal-IDs sind keine Geheimnisse (stehen auch in Buffer-Links).
// Keine Shop-Werbung: jeder Kanal bekommt allgemeine Inhalte, jeder etwas anderes.
export const KANAELE = [
  { id: '6ae8f441e29c69a1713e44f3', name: 'desk.rebel', dienst: 'instagram', quelle: 'horror' },
  { id: '6ae8f3dbe29c69a1713e416a', name: 'purivelle.785', dienst: 'instagram', quelle: 'fakten' },
  { id: '6ae8f39ae29c69a1713e3f33', name: 'giyuuu sama', dienst: 'youtube', quelle: 'anime' },
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
export function naechstes(videos, gepostet = {}) {
  if (!videos.length) return null;
  const rang = (v) => videos.indexOf(v);
  const neu = videos.filter((v) => !gepostet[v.datei]);
  // Reihenfolge der Quelle zählt zuerst (z. B. eigene Fakten-Videos), innerhalb davon die neuesten
  neu.sort((a, b) => (passendRang(a) - passendRang(b)) || String(b.erstellt || '').localeCompare(String(a.erstellt || '')) || rang(a) - rang(b));
  if (neu.length) return neu[0];
  return [...videos].sort((a, b) => String(gepostet[a.datei]).localeCompare(String(gepostet[b.datei])))[0];
}

// Soll dieser Kanal jetzt posten? Höchstens ZIEL_PRO_TAG+1 am Tag und mit Abstand zum letzten Post.
export function postenJetzt(heute, letzter, jetzt = Date.now(), { ziel = ZIEL_PRO_TAG, abstandMin = ABSTAND_MIN } = {}) {
  if (heute > ziel) return false;
  if (letzter && jetzt - Date.parse(letzter) < abstandMin * 60000) return false;
  return true;
}

// Text je Plattform: Instagram ohne nicht klickbaren Link (-> Link in Bio), YouTube mit Titel. Immer KI-Hinweis.
export function beitrag(v, dienst) {
  let roh = String(v.caption || v.titel || '').replace(/👉\s*https?:\/\/\S+/g, '🔗 Link in Bio').replace(/https?:\/\/\S+/g, '')
    .replace(/^.*jetzt auf YouTube!?\s*$/gim, '').replace(/^.*Folge @.*$/gim, '').replace(/Tag \d+ von \d+ 🔥\s*/g, '').replace(/\n{3,}/g, '\n\n').trim();
  // Caption besteht nur aus Hashtags? Dann steht der Titel davor - sonst weiß keiner, worum es geht
  if (v.titel && (!roh || roh.startsWith('#'))) roh = `${v.titel}\n\n${roh}`.trim();
  if (dienst === 'youtube') {
    const titel = String(v.titel || 'Kage no Shiro').replace(/\s+/g, ' ').slice(0, 90);
    const beschreibung = `${roh || titel}\n\nEigene Anime-Serie mit eigenen Figuren. #anime #animeserie #shorts\n${KI_HINWEIS}`.slice(0, 4900);
    return { text: beschreibung, metadata: { youtube: { title: `${titel} #shorts`.slice(0, 100), categoryId: '1', madeForKids: false, isAiGenerated: true, privacy: 'public' } } };
  }
  return { text: `${roh}\n\n${KI_HINWEIS}`.slice(0, 2100), metadata: { instagram: { type: 'reel', shouldShareToFeed: true, isAiGenerated: true } } };
}

// Beginn des heutigen Tages in Berlin als ISO (für die Zählung "Posts heute")
export function heuteBerlin(jetzt = new Date()) {
  const tag = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(jetzt);
  const versatz = new Date(jetzt.toLocaleString('en-US', { timeZone: 'Europe/Berlin' })) - new Date(jetzt.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(Date.parse(`${tag}T00:00:00Z`) - versatz).toISOString();
}

// Buffer-Posts zählen: alles außer Fehlern/Entwürfen zählt (gesendet, wird gesendet, geplant)
export function zaehlen(posts, kanalId) {
  const eigene = posts.filter((p) => p.channelId === kanalId && !['error', 'draft'].includes(p.status));
  const zeiten = eigene.map((p) => p.sentAt || p.dueAt).filter(Boolean).sort();
  return { heute: eigene.length, letzter: zeiten.at(-1) || null };
}
