// Pricing-Agent - echter Preis-Agent mit Handlungsmacht: passt Verkaufspreise
// basierend auf Verkaufstempo an, statt wie Preis-Spion (#14) nur die
// KONKURRENZ zu beobachten oder wie Lager-Wächter (#20) nur zu warnen.
// Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Zwei Signale, je Variante einzeln:
// - Läuft ein Artikel sehr schnell (Reichweite < REICHWEITE_TAGE_WARNUNG bei
//   aktuellem Bestand) -> Preis vorsichtig ANHEBEN (Nachfrage > Angebot).
// - Verkauft sich ein Artikel seit 14 Tagen GAR NICHT (Ladenhüter-Signal) ->
//   Preis vorsichtig SENKEN, nie unter die Marge-Untergrenze.
//
// Sicherheitsgrenzen: maximale Änderung pro Lauf (PREIS_MAX_AENDERUNG_PROZENT),
// harte Preisuntergrenze über PREIS_MIN_MARGE_PROZENT (nutzt den echten
// Einkaufspreis aus Shopify falls hinterlegt, sonst PRODUKTKOSTEN_PROZENT als
// Schätzung - gleiche Konvention wie Gewinn-Radar), und wie bei den
// Meta-Ads-Automationen standardmäßig NUR EMPFEHLUNG: echte Preisänderungen
// passieren erst, wenn AUTO_PREISANPASSUNG explizit auf "ja" steht.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getProducts, getOrdersSince, getInventoryItem, updateVariant } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const WHATSAPP_MAX_CHARS = 3500;
const VERKAUFSTEMPO_TAGE = 14;
const STATE_KEY = '61-pricing-agent';
const MAX_HISTORIE = 60;
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');

async function ermittleKosten(variante, preis) {
  if (variante.inventory_item_id) {
    try {
      const item = await getInventoryItem(variante.inventory_item_id);
      const kosten = parseFloat(item?.cost);
      if (!isNaN(kosten) && kosten > 0) return kosten;
    } catch (err) {
      console.error('[61-pricing-agent] Einkaufspreis nicht abrufbar, nutze Schätzung:', err.message);
    }
  }
  const kostenquote = parseFloat(config.PRODUKTKOSTEN_PROZENT || '40') / 100;
  return preis * kostenquote;
}

async function main() {
  const autoAn = config.AUTO_PREISANPASSUNG === 'ja';
  const maxAenderung = parseFloat(config.PREIS_MAX_AENDERUNG_PROZENT || '15') / 100;
  const minMarge = parseFloat(config.PREIS_MIN_MARGE_PROZENT || '20') / 100;
  const maxProLauf = parseInt(config.PRICING_AGENT_MAX_PRO_LAUF || '20', 10);
  const schnelllaeuferReichweiteTage = parseFloat(config.REICHWEITE_TAGE_WARNUNG || '14');

  const vorNTagen = new Date();
  vorNTagen.setDate(vorNTagen.getDate() - VERKAUFSTEMPO_TAGE);
  const orders = (await getOrdersSince(vorNTagen)).filter((o) => !o.cancelled_at);
  const verkauf = {};
  for (const o of orders) {
    for (const li of o.line_items || []) {
      if (!li.variant_id) continue;
      verkauf[li.variant_id] = (verkauf[li.variant_id] || 0) + li.quantity;
    }
  }

  const produkte = await getProducts({ limit: '250', status: 'active' });
  const aenderungen = [];

  for (const p of produkte) {
    if (aenderungen.length >= maxProLauf) break;
    for (const v of p.variants || []) {
      if (aenderungen.length >= maxProLauf) break;
      const bestand = parseInt(v.inventory_quantity);
      const preis = parseFloat(v.price);
      if (isNaN(bestand) || isNaN(preis) || preis <= 0) continue;

      const proTag = (verkauf[v.id] || 0) / VERKAUFSTEMPO_TAGE;
      const name = p.title + (v.title && v.title !== 'Default Title' ? ` (${v.title})` : '');

      let richtung = null;
      if (bestand > 0 && proTag > 0) {
        const reichweite = bestand / proTag;
        if (reichweite <= schnelllaeuferReichweiteTage) richtung = 'hoch';
      } else if (bestand > 0 && proTag === 0) {
        richtung = 'runter';
      }
      if (!richtung) continue;

      const kosten = await ermittleKosten(v, preis);
      const preisUntergrenze = kosten > 0 ? kosten / (1 - minMarge) : preis * (1 - maxAenderung);

      let neuerPreis;
      if (richtung === 'hoch') {
        neuerPreis = Math.round(preis * (1 + maxAenderung) * 100) / 100;
      } else {
        neuerPreis = Math.round(Math.max(preis * (1 - maxAenderung), preisUntergrenze) * 100) / 100;
        if (neuerPreis >= preis) continue; // Marge-Untergrenze lässt keine sinnvolle Senkung mehr zu
      }
      if (neuerPreis === preis) continue;

      // "Warum" transparent mitliefern statt nur "Preis geändert" - Risiko
      // und erwartete Auswirkung sind bewusst konservativ hergeleitet (aus
      // dem tatsächlichen Verkaufstempo), keine erfundene Prognose. Bei
      // Ladenhütern (0 Verkäufe) gibt es KEINE verlässliche Zahlenbasis für
      // eine Umsatz-Erwartung - dort bleibt es ehrlich qualitativ.
      const erwarteteVerkaeufe14Tage = Math.max(1, Math.round(proTag * VERKAUFSTEMPO_TAGE));
      aenderungen.push({
        variantId: v.id,
        name,
        richtung,
        alt: preis,
        neu: neuerPreis,
        grund: richtung === 'hoch' ? `verkauft sich schnell, reicht nur noch ~${(bestand / proTag).toFixed(1)} Tage` : 'seit 14 Tagen kein Verkauf',
        risiko: richtung === 'hoch' ? 'niedrig' : 'mittel',
        erwarteteAuswirkung: richtung === 'hoch'
          ? `+${((neuerPreis - preis) * erwarteteVerkaeufe14Tage).toFixed(2)} € geschätzter Mehrertrag über 14 Tage bei gleichem Verkaufstempo`
          : 'räumt liegen gebliebenen Lagerbestand ab - kein verlässlicher Umsatz-Forecast möglich, da seit 14 Tagen 0 Verkäufe',
      });
    }
  }

  const state = loadState(STATE_KEY);
  state.historie = state.historie || [];

  function veroeffentliche() {
    if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
    writeFileSync(join(COMMAND_DIR, 'pricing-agent.json'), JSON.stringify({
      updatedAt: new Date().toISOString(),
      historie: state.historie,
    }, null, 2));
  }

  if (!aenderungen.length) {
    await notifyTelegram(`PRICING-AGENT - ${config.SHOP_NAME}${NL}${NL}Keine Preisänderung heute nötig - Verkaufstempo überall im normalen Bereich.`);
    veroeffentliche();
    console.log('[61-pricing-agent] Keine Kandidaten.');
    return;
  }

  const zeilen = aenderungen.map(
    (a) => `- ${a.name} | ${a.alt.toFixed(2)} -> ${a.neu.toFixed(2)} € (${a.richtung === 'hoch' ? 'RAUF' : 'RUNTER'}) | ${a.grund}`,
  );
  const kopf = `PRICING-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}${autoAn ? 'AUTO_PREISANPASSUNG ist AN: Preise werden jetzt live geändert!' : 'AUTO_PREISANPASSUNG steht auf nein - nur Empfehlung, ich ändere nichts.'}${NL}`;

  for (const chunk of chunkZeilen(zeilen, WHATSAPP_MAX_CHARS - kopf.length)) {
    await notifyWhatsapp(`${kopf}${NL}${chunk.join(NL)}`);
  }
  await notifyTelegram(`${kopf}${NL}${zeilen.join(NL)}`);

  if (autoAn) {
    for (const a of aenderungen) {
      try {
        await updateVariant(a.variantId, { price: a.neu.toFixed(2) });
      } catch (err) {
        console.error(`[61-pricing-agent] Preisänderung fehlgeschlagen für ${a.name}:`, err.message);
      }
    }
  }

  const datum = new Date().toISOString();
  state.historie.unshift(...aenderungen.map((a) => ({ ...a, datum, ausgefuehrt: autoAn })));
  if (state.historie.length > MAX_HISTORIE) state.historie = state.historie.slice(0, MAX_HISTORIE);
  saveState(STATE_KEY, state);
  veroeffentliche();

  console.log(`[61-pricing-agent] ${aenderungen.length} Preisänderung(en) ${autoAn ? 'ausgeführt' : 'empfohlen'}.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[61-pricing-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[61-pricing-agent] Fehler:', err);
  process.exit(1);
});
