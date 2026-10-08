// Buffer-Poster (Teil von #101): verteilt die frisch gebauten Fakten-Videos auf die TikTok-Kanaele
// in Buffer - je Kanal ein ANDERES Video. Reine Funktionen, damit sie ohne Netz testbar sind.
export const API = 'https://api.buffer.com';

// Videos (Manifest-Eintraege) auf Kanaele verteilen: Video i -> Kanal (i + versatz) % n, nie zwei Videos pro Kanal.
export function verteilen(videos, kanaele, versatz = 0) {
  const n = Math.min(videos.length, kanaele.length);
  return Array.from({ length: n }, (_, i) => ({ video: videos[i], kanal: kanaele[(i + versatz) % kanaele.length] }));
}

// TikTok-Taktik "Suche": TikTok ist auch eine Suchmaschine. Die erste Zeile ist die Frage/Aussage des Videos
// (danach suchen Leute), dazu wenige, passende Hashtags: Thema + #wusstestdu + #lernenmittiktok, hoechstens 6.
const FESTE_TAGS = ['#wusstestdu', '#lernenmittiktok'];
export function hashtagsAus(text, max = 6, feste = FESTE_TAGS) {
  const tags = [...new Set([...(String(text).match(/#[\p{L}\p{N}_]+/gu) || []), ...feste].map((t) => t.toLowerCase()))]
    .filter((t) => !/^#(kigeneriert|ki)$/.test(t));
  // Thema-Tags zuerst, die festen Tags hinten garantiert dabei.
  const thema = tags.filter((t) => !feste.includes(t)).slice(0, max - feste.length);
  return [...thema, ...feste];
}

// Post-Text: Caption ohne alte Hashtags + kuratierte Hashtags + KI-Kennzeichnung, hoechstens 2200 Zeichen.
export function postText(v, hinweis = '#KIgeneriert') {
  const basis = String(v.caption || v.titel || '').trim();
  const ohneTags = basis.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[ \t]+/g, ' ').replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const text = `${ohneTags}\n\n${hashtagsAus(basis, 6, v.festeTags || FESTE_TAGS).join(' ')} ${hinweis}`;
  return text.length <= 2200 ? text : `${text.slice(0, 2190).trimEnd()}…`;
}

// TikTok-Titel (Suchbegriff): Videotitel ohne Serien-Nummer, hoechstens 90 Zeichen.
export const tiktokTitel = (v) => String(v.titel || '').replace(/^(Fakt )?#\d+:\s*/, '').slice(0, 90);

// TikTok-Taktik "gestaffelt": nicht alle Konten gleichzeitig, sondern im Abstand (Standard 40 Min.) -
// so konkurrieren die eigenen Videos nicht miteinander und decken mehr vom Abend/Mittag ab.
export function zeitplan(anzahl, start = new Date(), abstandMin = 40) {
  return Array.from({ length: anzahl }, (_, i) => (i === 0 ? null : new Date(start.getTime() + i * abstandMin * 60000).toISOString()));
}

export const POST_MUTATION = `mutation($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id status externalLink } }
    ... on MutationError { message }
  }
}`;

// TikTok-Taktik "feste Prime-Time": GitHub startet geplante Läufe oft Stunden zu spät - deshalb bestimmt nicht
// die Laufzeit den Post, sondern feste Uhrzeiten (deutsche Zeit), zu denen viele auf TikTok sind.
export const STANDARD_ZEITEN = '11:30,12:30,13:30,18:00,19:00,20:00';
const berlinOffsetMin = (d) => {
  const t = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'shortOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = t.match(/GMT([+-])(\d+)(?::(\d+))?/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
};
// "2026-10-08" + "19:00" deutsche Zeit -> Zeitpunkt (ms)
export function berlinZeitpunkt(datum, hhmm) {
  const [y, mo, d] = datum.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const geraten = Date.UTC(y, mo - 1, d, h, mi);
  return geraten - berlinOffsetMin(new Date(geraten)) * 60000;
}
// Die nächsten freien Uhrzeiten: mindestens pufferMin in der Zukunft und abstandMin weg von schon geplanten Posts.
export function naechsteZeiten(anzahl, { jetzt = Date.now(), zeiten = STANDARD_ZEITEN, belegt = [], pufferMin = 10, abstandMin = 30 } = {}) {
  const liste = String(zeiten).split(',').map((z) => z.trim()).filter((z) => /^\d{1,2}:\d{2}$/.test(z)).sort((a, b) => a.padStart(5, '0').localeCompare(b.padStart(5, '0')));
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(jetzt));
  const besetzt = belegt.map((b) => Date.parse(b)).filter((b) => !Number.isNaN(b));
  const raus = [];
  for (let tag = 0; tag < 4 && raus.length < anzahl; tag++) {
    const [y, mo, d] = heute.split('-').map(Number);
    const datum = new Date(Date.UTC(y, mo - 1, d + tag)).toISOString().slice(0, 10);
    for (const z of liste) {
      const t = berlinZeitpunkt(datum, z);
      if (t < jetzt + pufferMin * 60000) continue;
      if ([...besetzt, ...raus.map((r) => Date.parse(r))].some((b) => Math.abs(b - t) < abstandMin * 60000)) continue;
      raus.push(new Date(t).toISOString());
      if (raus.length === anzahl) break;
    }
  }
  return raus;
}

export function postInput(kanalId, text, videoUrl, { dueAt = null, titel = '' } = {}) {
  return {
    channelId: kanalId,
    text,
    schedulingType: 'automatic',
    mode: dueAt ? 'customScheduled' : 'shareNow',
    ...(dueAt ? { dueAt } : {}),
    assets: [{ video: { url: videoUrl } }],
    metadata: { tiktok: { isAiGenerated: true, ...(titel ? { title: titel } : {}) } },
  };
}
