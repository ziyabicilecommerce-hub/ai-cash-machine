// Benachrichtigungen für alle Bot-Ereignisse (Käufe, Verkäufe, übersprungene
// Signale, Tages-/Wochen-/Monats-Rückblick, Rebalancing, Fehler) - über
// WhatsApp UND/ODER Telegram, je nachdem was konfiguriert ist. Beide Kanäle
// unabhängig voneinander optional: ohne konfigurierte Secrets für einen
// Kanal wird nur geloggt, nicht gesendet - kein Fehler, der Bot bleibt voll
// funktionsfähig. Ein Fehler bei einem Kanal (z.B. WhatsApp down) darf den
// anderen (Telegram) nie verhindern - deshalb einzeln try/catch statt
// nacheinander mit früher Rückkehr bei Fehler.

async function sendeWhatsapp(env, text) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_TO_NUMBER) return;
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

// Telegram-Bot als zweiter, unabhängiger Kanal - braucht einen eigenen Bot
// (@BotFather, kostenlos) und die eigene Chat-ID. Nutzt HTML statt Markdown
// als parse_mode, da unser Text keine Markdown-Sonderzeichen escaped und
// Telegrams Markdown bei unescaptem "*"/"_" sonst Fehler wirft.
async function sendeTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
  } catch (err) {
    console.error('[telegram] Fehler beim Senden:', err);
  }
}

export async function notify(env, text) {
  const whatsappKonfiguriert = env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TO_NUMBER;
  const telegramKonfiguriert = env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID;
  if (!whatsappKonfiguriert && !telegramKonfiguriert) {
    console.log('[notify] Kein Kanal konfiguriert:', text);
    return;
  }
  await Promise.all([sendeWhatsapp(env, text), sendeTelegram(env, text)]);
}
