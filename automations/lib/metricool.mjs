import { config, ueberspringenWerfen } from './config.mjs';

const API_BASE = 'https://app.metricool.com/api';

function pruefeMetricoolConfig() {
  if (!config.METRICOOL_API_TOKEN) {
    ueberspringenWerfen('METRICOOL_API_TOKEN-Secret ist nicht gesetzt - bitte in GitHub -> Settings -> Secrets and variables -> Actions eintragen (Token: Metricool -> Account Settings -> API-Bereich -> "REST API Access token"). Siehe automations/README.md.');
  }
  if (!config.METRICOOL_USER_ID || !config.METRICOOL_BLOG_ID) {
    ueberspringenWerfen('METRICOOL_USER_ID/METRICOOL_BLOG_ID-Secret fehlt - beide stehen in der Metricool-URL (?blogId=...&userId=...), wenn du die Marke im Browser oeffnest.');
  }
}

function headers() {
  return {
    'X-Mc-Auth': config.METRICOOL_API_TOKEN,
    'Content-Type': 'application/json',
  };
}

// Laedt eine oeffentliche Bild-/Video-URL auf Metricools eigene Server und
// gibt die dortige mediaId zurueck - Pflichtschritt VOR jedem Post mit Media,
// sonst wird die URL beim Scheduling stillschweigend ignoriert (offizielle
// Metricool-API-FAQ).
export async function medienURLNormalisieren(url) {
  pruefeMetricoolConfig();
  const endpoint = `${API_BASE}/actions/normalize/image/url?url=${encodeURIComponent(url)}&blogId=${config.METRICOOL_BLOG_ID}&userId=${config.METRICOOL_USER_ID}`;
  const res = await fetch(endpoint, { headers: headers() });
  if (!res.ok) throw new Error(`Metricool Medien-Normalisierung Fehler ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const mediaId = data.mediaId || data.id || (data.media && data.media.id);
  if (!mediaId) throw new Error(`Metricool lieferte keine mediaId zurueck: ${JSON.stringify(data)}`);
  return mediaId;
}

// providers: Array wie ['instagram','tiktok'] - text: Beitragstext - mediaId:
// von medienURLNormalisieren() - datumISO: lokale Wanduhrzeit OHNE
// Zeitzonen-Offset im String (z.B. '2026-09-27T09:00:00'), Zeitzone kommt
// separat ueber METRICOOL_TIMEZONE. draft=true (Default in diesem Projekt,
// wie bei den anderen AUTO_POST_*-Schaltern): Beitrag landet als Entwurf im
// Metricool-Planer statt sofort live zu gehen.
export async function beitragPlanen({ providers, text, mediaId, datumISO, draft = true, instagramTyp = 'POST' }) {
  pruefeMetricoolConfig();

  const networkData = {};
  for (const p of providers) {
    if (p === 'instagram') networkData.instagramData = { type: instagramTyp, isAiGenerated: true };
    if (p === 'tiktok') networkData.tiktokData = { isAigc: instagramTyp === 'REEL' };
    if (p === 'youtube') {
      networkData.youtubeData = {
        title: text.slice(0, 90),
        type: 'short',
        privacy: 'public',
        madeForKids: false,
        isAiGeneratedContent: true,
      };
    }
  }

  const body = {
    text,
    draft,
    autoPublish: !draft,
    media: mediaId ? { mediaId } : undefined,
    providers: providers.map((n) => ({ network: n })),
    publicationDate: { dateTime: datumISO, timezone: config.METRICOOL_TIMEZONE },
    ...networkData,
  };

  const endpoint = `${API_BASE}/v2/scheduler/posts?blogId=${config.METRICOOL_BLOG_ID}&userId=${config.METRICOOL_USER_ID}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Metricool Scheduling-Fehler ${res.status}: ${await res.text()}`);
  return res.json();
}
