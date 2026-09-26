// Kostenlose Bildgenerierung ueber Pollinations (image.pollinations.ai) - der
// Legacy-Endpunkt, kein Key, kein Account, keine Anmeldung. Anders als der
// neue "gen.pollinations.ai"-Unified-API (die inzwischen Pollen-Credits
// kostet), liefert dieser hier weiterhin direkt eine oeffentliche Bild-URL -
// genau das, was Metricool als Media-Quelle braucht (siehe metricool.mjs).
const IMAGE_BASE = 'https://image.pollinations.ai/prompt';

export function bildURL(prompt, { width = 1024, height = 1024, model = 'flux', seed } = {}) {
  const encodedPrompt = encodeURIComponent(prompt);
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model,
    nologo: 'true',
    // Ohne festen Seed liefert Pollinations gecachte Antworten fuer
    // identische Prompts zurueck - ein Zufalls-Seed pro Aufruf sorgt fuer
    // ein wirklich neues Bild bei jedem Lauf.
    seed: String(seed ?? Math.floor(Math.random() * 1_000_000_000)),
  });
  return `${IMAGE_BASE}/${encodedPrompt}?${params.toString()}`;
}

// Prueft, dass die generierte URL tatsaechlich ein Bild liefert (Pollinations
// antwortet bei Ueberlastung/Fehler manchmal mit HTML/JSON statt Bildbytes) -
// bevor die URL weiterverarbeitet wird.
export async function bildURLPruefen(url) {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Pollinations-Bild-Fehler ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Pollinations lieferte kein Bild zurueck (Content-Type: ${contentType})`);
  }
  return url;
}
