import { config } from './config.mjs';

const BASE = 'https://maps.googleapis.com/maps/api/place';

// Textsuche, z.B. "Frisör in Hamburg Altona" - liefert bis zu 20 Treffer (erste Seite)
export async function searchPlaces(query) {
  const url = `${BASE}/textsearch/json?query=${encodeURIComponent(query)}&key=${config.GOOGLE_PLACES_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places Fehler (${data.status}): ${data.error_message || 'unbekannt'}`);
  }
  return data.results || [];
}

// Details zu einem Treffer - insbesondere ob eine Website hinterlegt ist
export async function getPlaceDetails(placeId) {
  const fields = 'name,formatted_phone_number,formatted_address,website,rating,user_ratings_total,url';
  const url = `${BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${config.GOOGLE_PLACES_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') {
    throw new Error(`Google Places Details Fehler (${data.status}): ${data.error_message || 'unbekannt'}`);
  }
  return data.result || {};
}
