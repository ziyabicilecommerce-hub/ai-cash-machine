// Buffer-Poster (Teil von #101): verteilt die frisch gebauten Fakten-Videos auf die TikTok-Kanaele
// in Buffer - je Kanal ein ANDERES Video. Reine Funktionen, damit sie ohne Netz testbar sind.
export const API = 'https://api.buffer.com';

// Videos (Manifest-Eintraege) auf Kanaele verteilen: Video i -> Kanal (i + versatz) % n, nie zwei Videos pro Kanal.
export function verteilen(videos, kanaele, versatz = 0) {
  const n = Math.min(videos.length, kanaele.length);
  return Array.from({ length: n }, (_, i) => ({ video: videos[i], kanal: kanaele[(i + versatz) % kanaele.length] }));
}

// Post-Text: Caption des Videos + KI-Kennzeichnung, hoechstens 2200 Zeichen (TikTok-Grenze).
export function postText(v, hinweis = '#KIgeneriert') {
  const basis = String(v.caption || v.titel || '').trim();
  const text = /#KIgeneriert/i.test(basis) ? basis : `${basis} ${hinweis}`;
  return text.length <= 2200 ? text : `${text.slice(0, 2190).trimEnd()}…`;
}

export const POST_MUTATION = `mutation($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id status externalLink } }
    ... on MutationError { message }
  }
}`;

export function postInput(kanalId, text, videoUrl) {
  return {
    channelId: kanalId,
    text,
    schedulingType: 'automatic',
    mode: 'shareNow',
    assets: [{ video: { url: videoUrl } }],
    metadata: { tiktok: { isAiGenerated: true } },
  };
}
