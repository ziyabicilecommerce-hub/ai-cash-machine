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
export function hashtagsAus(text, max = 6) {
  const tags = [...new Set([...(String(text).match(/#[\p{L}\p{N}_]+/gu) || []), ...FESTE_TAGS].map((t) => t.toLowerCase()))]
    .filter((t) => !/^#(kigeneriert|ki)$/.test(t));
  // Thema-Tags zuerst, die festen Tags hinten garantiert dabei.
  const thema = tags.filter((t) => !FESTE_TAGS.includes(t)).slice(0, max - FESTE_TAGS.length);
  return [...thema, ...FESTE_TAGS];
}

// Post-Text: Caption ohne alte Hashtags + kuratierte Hashtags + KI-Kennzeichnung, hoechstens 2200 Zeichen.
export function postText(v, hinweis = '#KIgeneriert') {
  const basis = String(v.caption || v.titel || '').trim();
  const ohneTags = basis.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[ \t]+/g, ' ').replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const text = `${ohneTags}\n\n${hashtagsAus(basis).join(' ')} ${hinweis}`;
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
