// Inventory-Guardian-Agent - stoppt echten Überverkauf: wenn eine Variante
// auf Bestand 0 fällt, aber Shopify wegen inventory_policy="continue" WEITER
// Bestellungen dafür annehmen würde, schaltet der Agent das für diese
// Variante auf "deny" um - kein Kunde kann mehr etwas kaufen, das gar nicht
// da ist. Sobald wieder Bestand da ist, macht der Agent die Änderung
// rückgängig (genau die ursprüngliche Einstellung, gespeichert im State) -
// vollautomatisch in BEIDE Richtungen. Unterscheidet sich von Lager-Wächter
// (#20, nur Warnung, rührt Shopify nie an). Neu, kein n8n-Workflow ·
// Zeitplan: alle 3 Stunden.
//
// Standardmäßig AN (anders als Pricing-/Reorder-/Ads-Autopilot-Agent): das
// Verhindern von Überverkauf ist fast immer im Sinne des Shops und die
// Änderung ist jederzeit reversibel (Shopify-Standardeinstellung selbst
// wählbar) - über AUTO_UEBERVERKAUF_STOPPEN trotzdem abschaltbar.
import { config } from './lib/config.mjs';
import { getProducts, updateVariant } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '65-inventory-guardian-agent';

async function main() {
  const autoAn = config.AUTO_UEBERVERKAUF_STOPPEN === 'ja';
  const produkte = await getProducts({ limit: '250', status: 'active' });
  const state = loadState(STATE_KEY);
  state.gestoppt = state.gestoppt || {}; // variantId -> ursprüngliche inventory_policy

  const neuGestoppt = [];
  const wiederFreigegeben = [];

  for (const p of produkte) {
    for (const v of p.variants || []) {
      const bestand = parseInt(v.inventory_quantity);
      if (isNaN(bestand)) continue;
      const name = p.title + (v.title && v.title !== 'Default Title' ? ` (${v.title})` : '');

      if (bestand <= 0 && v.inventory_policy === 'continue' && !state.gestoppt[v.id]) {
        neuGestoppt.push({ variantId: v.id, name, ursprung: v.inventory_policy });
      } else if (bestand > 0 && state.gestoppt[v.id]) {
        wiederFreigegeben.push({ variantId: v.id, name, ursprung: state.gestoppt[v.id] });
      }
    }
  }

  if (!neuGestoppt.length && !wiederFreigegeben.length) {
    console.log('[65-inventory-guardian-agent] Keine Änderung nötig.');
    return;
  }

  const zeilen = [
    ...neuGestoppt.map((k) => `- STOPP Überverkauf: ${k.name} (Bestand 0)`),
    ...wiederFreigegeben.map((k) => `- Wieder freigegeben: ${k.name} (wieder auf Lager)`),
  ];
  const text = `🛡️ INVENTORY-GUARDIAN-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}${zeilen.join(NL)}${NL}${NL}${autoAn ? 'AUTO_UEBERVERKAUF_STOPPEN ist AN: wird jetzt live umgesetzt!' : 'AUTO_UEBERVERKAUF_STOPPEN steht auf nein - nur Empfehlung, ich ändere nichts.'}`;
  await notifyTelegram(text);

  if (autoAn) {
    // Nach JEDER einzelnen Änderung sofort speichern (nicht erst nach beiden
    // Schleifen) - falls ein späterer Artikel einen unerwarteten Fehler wirft,
    // gehen die bereits erfolgreich umgesetzten Änderungen dieses Laufs nicht
    // verloren.
    for (const k of neuGestoppt) {
      try {
        await updateVariant(k.variantId, { inventory_policy: 'deny' });
        state.gestoppt[k.variantId] = k.ursprung;
        saveState(STATE_KEY, state);
      } catch (err) {
        console.error(`[65-inventory-guardian-agent] Konnte "${k.name}" nicht stoppen:`, err.message);
      }
    }
    for (const k of wiederFreigegeben) {
      try {
        await updateVariant(k.variantId, { inventory_policy: k.ursprung });
        delete state.gestoppt[k.variantId];
        saveState(STATE_KEY, state);
      } catch (err) {
        console.error(`[65-inventory-guardian-agent] Konnte "${k.name}" nicht freigeben:`, err.message);
      }
    }
  }

  console.log(`[65-inventory-guardian-agent] ${neuGestoppt.length} gestoppt, ${wiederFreigegeben.length} freigegeben, autoAn=${autoAn}.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[65-inventory-guardian-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[65-inventory-guardian-agent] Fehler:', err);
  process.exit(1);
});
