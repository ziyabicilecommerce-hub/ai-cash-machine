// Buffer-Verteiler (#113): jeder Buffer-Kanal bekommt EIGENE Inhalte, mindestens 5 Posts am Tag.
// Reine Funktionen - ohne Netz testbar. Kanal-IDs sind keine Geheimnisse (stehen auch in Buffer-Links).
export const KANAELE = [
  { id: '6ae8f441e29c69a1713e44f3', name: 'desk.rebel', dienst: 'instagram', quelle: 'deskrebel' },
  { id: '6ae8f3dbe29c69a1713e416a', name: 'purivelle.785', dienst: 'instagram', quelle: 'purivelle' },
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

const SHOPS = ['deskrebel', 'purivelle'];
const text = (v) => `${v.url || ''} ${v.caption || ''} ${v.thema || ''} ${v.titel || ''}`.toLowerCase();
const sicher = (u) => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\//.test(String(u || ''));

// Welche Videos aus dem Feed passen zu welcher Quelle (nur Hochformat, nur Deutsch/ohne Sprache, nie Fakten-Videos)
export function passend(videos, quelle) {
  return videos.filter((v) => !v.kanal && (!v.sprache || ['de', 'int'].includes(v.sprache)) && v.format === 'hoch' && sicher(v.url) && (v.dauer || 0) <= 180)
    .filter((v) => {
      const t = text(v);
      if (quelle === 'anime') return t.includes('anime');
      // Sammel-Videos mit beiden Shops ("Highlights") gehören keinem Kanal allein
      return t.includes(quelle) && !t.includes('anime') && !SHOPS.filter((x) => x !== quelle).some((x) => t.includes(x));
    })
    .filter((v, i, alle) => alle.findIndex((x) => x.datei === v.datei) === i);  // der Feed enthält manche Videos doppelt
}

// Nächstes Video: noch nie auf diesem Kanal gepostet (neueste zuerst), sonst das am längsten nicht gepostete (Wiederholung)
export function naechstes(videos, gepostet = {}) {
  if (!videos.length) return null;
  const neu = videos.filter((v) => !gepostet[v.datei]).sort((a, b) => String(b.erstellt || '').localeCompare(String(a.erstellt || '')));
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
  const roh = String(v.caption || v.titel || '').replace(/👉\s*https?:\/\/\S+/g, '🔗 Link in Bio').replace(/https?:\/\/\S+/g, '').trim();
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
