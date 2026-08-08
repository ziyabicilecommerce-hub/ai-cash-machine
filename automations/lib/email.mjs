import { config, isTestMode, sindEmailsPausiert } from './config.mjs';

// Nutzt Resend (https://resend.com) statt SMTP - kostenloser Tier reicht für die meisten Shops.
export async function sendEmail({ to, subject, html }) {
  if (sindEmailsPausiert()) {
    console.log('[email] E-Mail-Versand pausiert (EMAILS_PAUSIERT=ja) - E-Mail wird nur geloggt, nicht versendet.');
    console.log('[email] An:', to, '| Betreff:', subject);
    return { skipped: true, pausiert: true };
  }
  if (!config.RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY fehlt - E-Mail wird nur geloggt, nicht versendet.');
    console.log('[email] An:', to, '| Betreff:', subject);
    return { skipped: true };
  }
  const empfaenger = isTestMode() ? config.OWNER_EMAIL : to;
  const finalSubject = isTestMode() ? `[TEST] ${subject}` : subject;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.ABSENDER_EMAIL,
      to: empfaenger,
      subject: finalSubject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API Fehler ${res.status}: ${text}`);
  }
  return res.json();
}
