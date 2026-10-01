// Text-Vorschlaege fuer den Shop-Doktor: fuer Produkte mit fehlender Meta-Beschreibung, zu kurzem
// Text oder riskanten Werbeaussagen schreibt die KI einen ehrlichen Ersatz (nur Fakten aus dem
// vorhandenen Text, keine Heilversprechen). Zum Kopieren in Shopify - nichts wird automatisch geaendert.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const CACHE = 'automations/state/text-vorschlaege.json';
const ANLASS = /Meta-Beschreibung|Beschreibung sehr kurz|Keine Produktbeschreibung|Riskante Werbeaussage/;
const text = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
export const fingerabdruck = (p) => createHash('sha1').update(`${p.title}|${p.body_html || ''}`).digest('hex').slice(0, 12);
export const braucht = (befunde) => befunde.some((b) => ANLASS.test(b.was));

export function vorschlagPrompt(p) {
  return `Du bist SEO-Texterin fuer einen deutschen Online-Shop. Produkt: "${p.title}" (${p.shopName || ''}). Vorhandener Text: "${text(p.body_html).slice(0, 1500) || '(leer)'}". ` +
    'Schreibe auf Deutsch, Du-Ansprache, ehrlich: NUR Eigenschaften aus dem vorhandenen Text oder dem Produktnamen, nichts erfinden (keine Masse, Materialien oder Zahlen, die nicht dastehen). ' +
    'Keine Heilversprechen und keine Krankheitsnamen mit Wirkversprechen (Heilmittelwerbegesetz) - stattdessen z. B. "kann sich entspannend anfuehlen". ' +
    'Antworte NUR mit JSON: {"meta":"Meta-Beschreibung 140-160 Zeichen mit Nutzen","beschreibung":"Produktbeschreibung 150-250 Woerter, kurze Absaetze, Stichpunkte erlaubt"}';
}

export function bereinigen(d) {
  const meta = String(d?.meta || '').replace(/\s+/g, ' ').trim().slice(0, 170);
  const beschreibung = String(d?.beschreibung || '').trim().slice(0, 3000);
  if (meta.length < 60 || beschreibung.split(/\s+/).length < 60) return null;
  return { meta, beschreibung };
}

export const cacheLaden = (pfad = CACHE) => { try { return existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')) : {}; } catch { return {}; } };
export function cacheSpeichern(c, pfad = CACHE) { mkdirSync('automations/state', { recursive: true }); writeFileSync(pfad, JSON.stringify(c, null, 1) + '\n'); }

// Fuellt fehlende Vorschlaege auf (hoechstens max je Lauf, mit Pause gegen Drosselung der Gratis-KI).
export async function vorschlaegeHolen(faelle, ki, { cache = cacheLaden(), max = 6, pauseMs = 15000 } = {}) {
  let neu = 0;
  for (const { p } of faelle) {
    const k = `${p.id}:${fingerabdruck(p)}`;
    if (cache[k] || neu >= max) continue;
    if (neu) await new Promise((r) => setTimeout(r, pauseMs));
    try {
      const v = bereinigen(await ki(vorschlagPrompt(p)));
      if (v) { cache[k] = { ...v, erstellt: new Date().toISOString() }; neu++; }
    } catch (err) {
      console.log(`[shop-doktor] Text-Vorschlag ${p.title}: ${String(err.message).slice(0, 100)}`);
      break; // KI nicht erreichbar - naechster Lauf versucht es wieder
    }
  }
  return { cache, neu };
}
