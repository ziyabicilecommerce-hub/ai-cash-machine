// Lieferanten-Zahlungs-Wächter - meldet sich per WhatsApp GENAU dann, wenn
// eine vom Reorder-Agent (#63) ausgelöste Nachbestellung zur Zahlung fällig
// wird, statt dass der Gründer selbst Rechnungen/Fristen im Kopf behalten
// muss. Bewusst NUR ein Reminder, kein Zahlungsversand - hier geht nie Geld
// automatisch raus. Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Wichtige Einschränkung: Shopify kennt keine Lieferanten-Rechnungen, daher
// gibt es nur Fälligkeiten für Nachbestellungen, die #63 tatsächlich per
// Mail ausgelöst hat (siehe dortiger Kommentar). Manuell vereinbarte
// Lieferanten-Zahlungen außerhalb des Reorder-Flows werden NICHT erfasst -
// das bleibt bewusst ehrlich statt vorzutäuschen, alles zu wissen.
import { config } from './lib/config.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const ZAHLUNGEN_STATE_KEY = 'lieferanten-zahlungen';
const AUFBEWAHREN_NACH_FAELLIGKEIT_TAGE = 60;

async function main() {
  const erinnerungTageVorher = parseFloat(config.ZAHLUNGS_ERINNERUNG_TAGE_VORHER || '3');
  const state = loadState(ZAHLUNGEN_STATE_KEY);
  const faellig = state.faellig || [];

  if (!faellig.length) {
    console.log('[82-lieferanten-zahlungs-waechter] Keine offenen Nachbestell-Zahlungen erfasst.');
    return;
  }

  const jetzt = Date.now();
  const faelligeErinnerungen = [];
  const behalten = [];

  for (const eintrag of faellig) {
    const faelligAmTs = new Date(eintrag.faelligAm).getTime();
    const tageBisFaellig = (faelligAmTs - jetzt) / 86400000;

    // Weit überfällige Einträge (vermutlich längst bezahlt) räumen, statt
    // den State unbegrenzt wachsen zu lassen.
    if (jetzt - faelligAmTs > AUFBEWAHREN_NACH_FAELLIGKEIT_TAGE * 86400000) continue;

    if (!eintrag.benachrichtigt && tageBisFaellig <= erinnerungTageVorher) {
      faelligeErinnerungen.push(eintrag);
      behalten.push({ ...eintrag, benachrichtigt: true });
    } else {
      behalten.push(eintrag);
    }
  }

  if (behalten.length !== faellig.length || faelligeErinnerungen.length) {
    saveState(ZAHLUNGEN_STATE_KEY, { faellig: behalten });
  }

  if (!faelligeErinnerungen.length) {
    console.log('[82-lieferanten-zahlungs-waechter] Keine fällige Erinnerung heute.');
    return;
  }

  for (const eintrag of faelligeErinnerungen) {
    const faelligDatum = new Date(eintrag.faelligAm).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    const text = [
      `💸 *Lieferanten-Zahlung fällig*`,
      `An: ${eintrag.lieferant || '(kein Lieferant hinterlegt)'}`,
      `Fällig: ${faelligDatum}`,
      `Bestellt: ${eintrag.artikel.join(', ')}`,
      `(Basierend auf ${config.LIEFERANTEN_ZAHLUNGSZIEL_TAGE || '30'} Tage Zahlungsziel ab Nachbestellung - Betrag steht nicht in Shopify, bitte mit der echten Rechnung des Lieferanten abgleichen.)`,
    ].join(NL);
    await Promise.all([notifyWhatsapp(text), notifyTelegram(text)]);
  }

  console.log(`[82-lieferanten-zahlungs-waechter] ${faelligeErinnerungen.length} Zahlungs-Erinnerung(en) verschickt.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[82-lieferanten-zahlungs-waechter] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[82-lieferanten-zahlungs-waechter] Fehler:', err);
  process.exit(1);
});
