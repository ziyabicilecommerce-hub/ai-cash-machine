import { config } from './config.mjs';

// Optional - wenn kein Telegram-Bot-Token gesetzt ist, wird die Nachricht nur geloggt.
export async function notifyTelegram(text) {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    console.log('[telegram] Nicht konfiguriert - Nachricht:', text);
    return { skipped: true };
  }
  const res = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.TELEGRAM_CHAT_ID, text }),
  });
  if (!res.ok) {
    console.error('[telegram] Fehler beim Senden:', await res.text());
    return { error: true };
  }
  return res.json();
}
