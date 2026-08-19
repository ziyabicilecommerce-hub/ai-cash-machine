// WhatsApp-Benachrichtigungen für alle Bot-Ereignisse (Käufe, Verkäufe,
// übersprungene Signale, Tages-/Wochen-/Monats-Rückblick, Rebalancing,
// Fehler). Ohne konfigurierte Secrets wird nur geloggt, nicht gesendet -
// kein Fehler, der Bot bleibt voll funktionsfähig.

export async function notifyWhatsapp(env, text) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_TO_NUMBER) {
    console.log('[whatsapp] Nicht konfiguriert:', text);
    return;
  }
  try {
    await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: env.WHATSAPP_TO_NUMBER, type: 'text', text: { body: text, preview_url: true } }),
    });
  } catch (err) {
    console.error('[whatsapp] Fehler beim Senden:', err);
  }
}
