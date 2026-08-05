import { config } from './config.mjs';

// Optional - wenn kein WhatsApp-Token gesetzt ist, wird die Nachricht nur geloggt.
export async function notifyWhatsapp(text) {
  if (!config.WHATSAPP_ACCESS_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID || !config.WHATSAPP_TO_NUMBER) {
    console.log('[whatsapp] Nicht konfiguriert - Nachricht:', text);
    return { skipped: true };
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: config.WHATSAPP_TO_NUMBER,
      type: 'text',
      text: { body: text, preview_url: true },
    }),
  });
  if (!res.ok) {
    console.error('[whatsapp] Fehler beim Senden:', await res.text());
    return { error: true };
  }
  return res.json();
}

// Schickt ein Bild per öffentlich erreichbarer URL (WhatsApp lädt es selbst
// herunter - kein Media-Upload nötig). Optional - wenn kein WhatsApp-Token
// gesetzt ist, wird nur geloggt.
export async function notifyWhatsappBild(imageUrl, caption) {
  if (!config.WHATSAPP_ACCESS_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID || !config.WHATSAPP_TO_NUMBER) {
    console.log('[whatsapp] Nicht konfiguriert - Bild:', imageUrl, caption);
    return { skipped: true };
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: config.WHATSAPP_TO_NUMBER,
      type: 'image',
      image: { link: imageUrl, caption },
    }),
  });
  if (!res.ok) {
    console.error('[whatsapp] Fehler beim Bild-Senden:', await res.text());
    return { error: true };
  }
  return res.json();
}
