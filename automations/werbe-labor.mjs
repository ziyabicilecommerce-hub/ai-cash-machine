// Werbe-Labor (täglich vor der Video-Fabrik): testet für die Shop-Produkte je 8 Hooks an einer
// simulierten Test-Jury, schärft den Gewinner gegen den häufigsten Einwand nach und speichert ihn.
// Die Video-Fabrik (#94) beginnt ihre Produkt-Videos dann mit dem getesteten Hook.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import '../zentrale/js/labor.js';
import { kiJson } from './lib/kiJson.mjs';
import { aktiveProdukte } from './lib/shopProdukte.mjs';
import { lernstandLaden } from './lib/leistung.mjs';
import { planWert } from './lib/agentenPlan.mjs';

const { ZLabor } = globalThis;
// Menge: Eingabe/Variable > Plan des Engpass-Chefs > 6.
const PRO_LAUF = Math.min(Math.max(parseInt(process.env.WERBE_LABOR_ANZAHL || String(planWert('laborAnzahl', 6)), 10) || 6, 1), 20);
const FRISCH_TAGE = 14;
export const STATE = 'automations/state/werbe-labor.json';
const SEITE = 'zentrale/daten/werbe-labor.json';
const PRODUKTE = 'zentrale/daten/produkte.json';

export const schluessel = (p) => `${p.shopUrl || ''}/products/${p.handle || p.id}`;

export function laden(pfad = STATE) {
  try { return existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')) : { produkte: {} }; } catch { return { produkte: {} }; }
}

// Produkte ohne Ergebnis zuerst, dann die ältesten.
export function auswahl(produkte, stand, n, jetzt = Date.now()) {
  const alter = (p) => { const e = stand.produkte[schluessel(p)]; return e ? jetzt - Date.parse(e.erstellt) : Infinity; };
  return produkte.filter((p) => alter(p) > FRISCH_TAGE * 864e5 / 2).sort((a, b) => alter(b) - alter(a)).slice(0, n);
}

// Öffentliche Produktdaten der Shops für die Zentrale (IDs passen zum Shopify-Anschluss: "p" + Produkt-ID).
export function produktListe(produkte) {
  return produkte.map((p) => {
    const preise = (p.variants || []).map((v) => Number(v.price)).filter((x) => x > 0);
    const v = (p.variants || [])[0] || {};
    const vergleich = Number(v.compare_at_price) || null, preis = preise.length ? Math.min(...preise) : 0;
    return {
      id: 'p' + p.id, name: p.title, preis, vergleich: vergleich && vergleich > preis ? vergleich : null, kosten: 0,
      kategorie: p.product_type || p.shopName, shop: p.shopName, url: `${p.shopUrl}/products/${p.handle}`,
      bild: (p.images && p.images[0] && p.images[0].src) || null,
      info: ZLabor.produktKurz(p).info.slice(0, 300),
    };
  });
}

function speichern(pfad, daten) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(daten, null, 1));
}

async function main() {
  const produkte = await aktiveProdukte();
  if (!produkte.length) { console.log('[werbe-labor] Keine Produkte lesbar - nichts zu tun.'); return; }
  speichern(PRODUKTE, { stand: new Date().toISOString(), produkte: produktListe(produkte) });
  const stand = laden();
  const liste = auswahl(produkte, stand, PRO_LAUF);
  console.log(`[werbe-labor] ${liste.length} von ${produkte.length} Produkten werden getestet.`);
  // Die kostenlose KI drosselt bei schnellen Folgeanfragen: zwischen zwei Anfragen kurz warten.
  const PAUSE = Number(process.env.WERBE_LABOR_PAUSE_MS ?? 15000);
  let letzte = 0;
  const ki = async (prompt, maxTokens) => {
    const warten = letzte + PAUSE - Date.now();
    if (warten > 0) await new Promise((r) => setTimeout(r, warten));
    try { return await kiJson(prompt, { maxTokens }); } finally { letzte = Date.now(); }
  };
  // Echte Zahlen aus den Posts (Leistungs-Sammler) fliessen in die Jury-Note mit ein.
  const echt = lernstandLaden();
  if (echt.posts) console.log(`[werbe-labor] Echte Zahlen aus ${echt.posts} Posts fliessen mit ein.`);
  for (const p of liste) {
    try {
      const e = await ZLabor.labor(p, ki, { echt: echt.winkel });
      stand.produkte[schluessel(p)] = { ...e, handle: p.handle, shop: p.shopName, bild: (p.images && p.images[0] && p.images[0].src) || null };
      console.log(`[werbe-labor] ${p.title}: ${e.ersatz ? 'KI nicht erreichbar - Fabrik schreibt ihr eigenes Skript' : `Gewinner "${e.final.hook}" (${e.gewinner.punkte}/10, ${e.gewinner.quelle})`}`);
    } catch (err) {
      console.log(`[werbe-labor] ${p.title}: übersprungen (${err.message})`);
    }
  }
  stand.stand = new Date().toISOString();
  speichern(STATE, stand);
  speichern(SEITE, stand);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => { console.error('[werbe-labor] Fehler:', e.message); process.exit(1); });
}
