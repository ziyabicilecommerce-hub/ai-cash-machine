// WhatsApp-Antwort-Trigger für den Lead-Jäger-Anruf-Bot.
//
// GitHub Actions kann keine eingehenden Webhooks empfangen (nur Zeitplan/manueller
// Start) - WhatsApp liefert eingehende Nachrichten aber ausschließlich per Push-
// Webhook, kein Polling. Dieser Cloudflare Worker ist die kleinstmögliche Brücke:
// er nimmt Metas Webhook entgegen, prüft ob die Nummer ein bekannter Lead aus dem
// Lead-Jäger ist (der die Nummer nach jedem Lauf öffentlich in
// automations/state/leads-warten-auf-antwort.json veröffentlicht), und löst NUR
// dann einen Anruf über Vapi aus, wenn die Firma zuerst selbst geantwortet hat -
// das ist die bewusste rechtliche Absicherung (keine automatisierten Kaltakquise-
// Anrufe ohne vorherigen Kontakt).
//
// Deploy: wrangler deploy (siehe README in diesem Ordner für Setup-Schritte)

const LEADS_URL = 'https://raw.githubusercontent.com/ziyabicilecommerce-hub/ai-cash-machine/main/automations/state/leads-warten-auf-antwort.json';
const KV_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 Tage - verhindert Doppel-Anrufe bei mehreren Antworten derselben Nummer

function normalizeTelefon(raw) {
  return String(raw || '').replace(/\D/g, '');
}

async function findLeadByTelefon(telefonNormalisiert) {
  const res = await fetch(LEADS_URL, { cf: { cacheTtl: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  const leads = data.leads || [];
  return leads.find((l) => l.telefonNormalisiert === telefonNormalisiert) || null;
}

async function placeVapiCall(lead, env) {
  const res = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assistantId: env.VAPI_ASSISTANT_ID,
      phoneNumberId: env.VAPI_PHONE_NUMBER_ID,
      customer: { number: `+${lead.telefonNormalisiert}` },
      assistantOverrides: {
        variableValues: {
          name: lead.name || '',
          branche: lead.branche || '',
          grund: lead.grund || '',
          previewUrl: lead.previewUrl || '',
        },
      },
    }),
  });
  if (!res.ok) {
    console.error('[vapi] Anruf-Fehler:', res.status, await res.text());
    return false;
  }
  return true;
}

async function notifyOwner(text, env) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_TO_NUMBER) return;
  await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: env.WHATSAPP_TO_NUMBER,
      type: 'text',
      text: { body: text },
    }),
  });
}

async function handleIncomingMessage(fromRaw, env) {
  const telefonNormalisiert = normalizeTelefon(fromRaw);
  if (!telefonNormalisiert) return;

  const bereitsAngerufen = await env.CALLED_LEADS.get(telefonNormalisiert);
  if (bereitsAngerufen) return;

  const lead = await findLeadByTelefon(telefonNormalisiert);
  if (!lead) return; // Antwort von einer unbekannten Nummer - kein Lead, kein Anruf

  const erfolgreich = await placeVapiCall(lead, env);
  if (erfolgreich) {
    await env.CALLED_LEADS.put(telefonNormalisiert, new Date().toISOString(), { expirationTtl: KV_TTL_SECONDS });
    await notifyOwner(`📞 ${lead.name} hat geantwortet - Vapi ruft jetzt an.`, env);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response('OK', { status: 200 });
      }

      const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
      for (const msg of messages) {
        if (msg?.from) await handleIncomingMessage(msg.from, env);
      }
      return new Response('OK', { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  },
};
