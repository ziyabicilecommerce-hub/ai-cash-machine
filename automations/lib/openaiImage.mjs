import { config } from './config.mjs';

// Optional - Bildgenerierung für Creative Studio. Ohne OPENAI_API_KEY liefert
// die Automation weiterhin die Text-Assets (Hooks/Ad-Copy/Bild-Prompts), nur
// eben kein tatsächlich generiertes Bild. response_format:'url' liefert eine
// von OpenAI gehostete, öffentlich erreichbare URL (ca. 1h gültig) - genug
// Zeit, um sie direkt an WhatsApp weiterzureichen (kein eigener Upload nötig).
export async function generiereBild(prompt) {
  if (!config.OPENAI_API_KEY) return null;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI-Bild-Fehler ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.data && data.data[0] && data.data[0].url) || null;
}
