import { config } from './config.mjs';

// Optional - wenn keine Twilio-Zugangsdaten gesetzt sind, wird nur geloggt.
// Erste SMS-Fähigkeit in der Suite (bisher nur E-Mail/Telegram/WhatsApp).
export async function sendeSms(anNummer, text) {
  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM_NUMBER) {
    console.log('[sms] Twilio nicht konfiguriert - SMS nur geloggt:', anNummer, text);
    return { skipped: true };
  }

  const basicAuth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');
  const body = new URLSearchParams({ To: anNummer, From: config.TWILIO_FROM_NUMBER, Body: text });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    console.error('[sms] Fehler beim Senden:', await res.text());
    return { error: true };
  }
  return res.json();
}
