import { config } from './config.mjs';

const BASE = 'https://backend.composio.dev/api/v3';
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri,places.businessStatus';

// Google-Maps-Textsuche über die bereits verbundene Composio-Verbindung -
// kein eigener Google-Cloud-Billing-Account/API-Key nötig. Ein Call liefert
// alle benötigten Felder (Website, Telefon, Bewertung) direkt mit, ohne
// separaten "Place Details"-Aufruf.
export async function searchPlaces(textQuery, maxResultCount = 15) {
  const res = await fetch(`${BASE}/tools/execute/GOOGLE_MAPS_TEXT_SEARCH`, {
    method: 'POST',
    headers: {
      'x-api-key': config.COMPOSIO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      arguments: { textQuery, fieldMask: FIELD_MASK, maxResultCount },
    }),
  });
  const json = await res.json();
  if (!json.successful) {
    throw new Error(`Composio Google-Maps-Fehler: ${JSON.stringify(json.error || 'unbekannt')}`);
  }
  const places = (json.data && json.data.places) || [];
  // Dauerhaft/vorübergehend geschlossene Firmen sind keine sinnvollen Leads.
  return places.filter((p) => !p.businessStatus || p.businessStatus === 'OPERATIONAL');
}
