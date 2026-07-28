// Meta-Lookalike-Futter - schickt wöchentlich die besten Kunden (gehasht) als Custom-Audience-Futter an Meta
// Original: n8n Workflow "45_Meta_Lookalike_Futter" · Zeitplan: montags 06:30
import { createHash } from 'node:crypto';
import { config } from './lib/config.mjs';
import { getCustomers } from './lib/shopify.mjs';
import { sendCustomAudienceUsers } from './lib/meta.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

async function main() {
  const minUmsatz = parseFloat(config.MIN_UMSATZ || '50');
  const kunden = await getCustomers({ limit: '250', fields: 'id,email,total_spent,orders_count' });

  const data = [];
  for (const k of kunden) {
    if (!k.email) continue;
    if (parseFloat(k.total_spent || 0) < minUmsatz) continue;
    const norm = k.email.trim().toLowerCase();
    data.push([createHash('sha256').update(norm).digest('hex')]);
  }

  if (data.length === 0) {
    console.log('[45-meta-lookalike-futter] Keine Kunden über Mindestumsatz gefunden');
    return;
  }

  await sendCustomAudienceUsers(config.CUSTOM_AUDIENCE_ID, ['EMAIL_SHA256'], data);

  await notifyTelegram(
    `META LOOKALIKE-FUTTER - ${config.SHOP_NAME}: ${data.length} Top-Kunden (gehasht) an Meta gesendet. Lookalike-Zielgruppe kann jetzt aktualisiert werden.`
  );

  console.log(`[45-meta-lookalike-futter] ${data.length} Kunden gesendet`);
}

main().catch((err) => {
  console.error('[45-meta-lookalike-futter] Fehler:', err);
  process.exit(1);
});
