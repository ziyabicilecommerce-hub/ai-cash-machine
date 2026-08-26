// Übersetzungs-Entwurf-Agent - übersetzt Produkttexte (Titel, Beschreibung,
// SEO) für neue Zielmärkte (TRANSLATION_ZIELSPRACHEN, z.B. "en,fr") und
// schickt den fertigen Entwurf per E-Mail. Neu, kein n8n-Workflow ·
// Zeitplan: wöchentlich.
//
// Schreibt BEWUSST NICHT direkt in Shopifys Translate & Adapt / Markets-API
// zurück - der genaue GraphQL-Vertrag dafür wurde in dieser Session nicht
// gegen einen echten Account verifiziert (gleiches Prinzip wie bei TikTok
// Ads in #56 Ad Commander: lieber ehrlich einen Entwurf liefern als
// stillschweigend eine geratene API-Struktur zu benutzen, die im Zweifel
// falsche Felder schreibt). Ergänzt #47 Länder-Expansions-Scout (empfiehlt
// NEUE Zielmärkte) - dieser Agent liefert dafür die Text-Bausteine.
import { config } from './lib/config.mjs';
import { getProducts } from './lib/shopify.mjs';
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '75-uebersetzungs-entwurf-agent';
const MAX_HISTORIE = 5000;

const SPRACHNAMEN = {
  en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch',
  nl: 'Niederländisch', pl: 'Polnisch', pt: 'Portugiesisch', tr: 'Türkisch',
};

async function main() {
  const zielsprachen = (config.TRANSLATION_ZIELSPRACHEN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!zielsprachen.length) {
    console.log('[75-uebersetzungs-entwurf-agent] Keine TRANSLATION_ZIELSPRACHEN konfiguriert - übersprungen.');
    return;
  }

  const maxProLauf = parseInt(config.TRANSLATION_MAX_PRODUKTE || '5', 10);
  const produkte = await getProducts({ limit: '100', status: 'active', fields: 'id,title,body_html,handle' });

  const state = loadState(STATE_KEY);
  state.uebersetzt = state.uebersetzt || [];
  const bereitsUebersetzt = new Set(state.uebersetzt);

  const kandidaten = [];
  for (const p of produkte) {
    for (const sprache of zielsprachen) {
      const schluessel = `${p.id}:${sprache}`;
      if (bereitsUebersetzt.has(schluessel)) continue;
      kandidaten.push({ produkt: p, sprache, schluessel });
      if (kandidaten.length >= maxProLauf) break;
    }
    if (kandidaten.length >= maxProLauf) break;
  }

  if (!kandidaten.length) {
    console.log('[75-uebersetzungs-entwurf-agent] Keine neuen Produkt/Sprache-Kombinationen.');
    return;
  }

  let erfolgreich = 0;
  for (const k of kandidaten) {
    try {
      const sprachname = SPRACHNAMEN[k.sprache] || k.sprache;
      const prompt = `Du bist professioneller E-Commerce-Übersetzer. Übersetze die folgende Shopify-Produktseite ins ${sprachname} - nicht wörtlich, sondern wie ein Muttersprachler-Copywriter für Online-Shops schreiben würde (natürlicher Verkaufston, nicht steif).${NL}${NL}Titel: ${k.produkt.title}${NL}Beschreibung (HTML): ${(k.produkt.body_html || '').slice(0, 1500)}${NL}${NL}Antworte NUR mit validem JSON, ohne Markdown:${NL}{"titel": "...", "beschreibung_html": "...", "seo_titel": "...", "seo_beschreibung": "..."}`;

      const antwort = await askKI(prompt, { maxTokens: 2500 });
      const daten = parseJsonFromText(antwort, null);
      if (!daten || !daten.titel) {
        console.error(`[75-uebersetzungs-entwurf-agent] Ungültige Übersetzung für "${k.produkt.title}" (${k.sprache}), wird beim nächsten Lauf erneut versucht.`);
        continue;
      }

      const html = `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">
        <h2>🌍 Übersetzungs-Entwurf: ${k.produkt.title} → ${sprachname}</h2>
        <p><b>Titel:</b> ${daten.titel}</p>
        <p><b>SEO-Titel:</b> ${daten.seo_titel || '-'}</p>
        <p><b>SEO-Beschreibung:</b> ${daten.seo_beschreibung || '-'}</p>
        <hr>
        <p><b>Beschreibung:</b></p>
        ${daten.beschreibung_html || ''}
        <hr>
        <p style="color:#666;font-size:13px;">Entwurf zum manuellen Einsetzen in Shopify Translate &amp; Adapt (Produkt: /products/${k.produkt.handle}). Wird nicht automatisch veröffentlicht.</p>
      </div>`;
      await sendEmail({ to: config.OWNER_EMAIL, subject: `🌍 Übersetzungs-Entwurf (${sprachname}): ${k.produkt.title}`, html });

      // Erst NACH erfolgreichem Versand als übersetzt markieren und sofort
      // speichern - schlägt eine spätere Kombination im selben Lauf fehl,
      // geht dieser Erfolg nicht verloren.
      state.uebersetzt.push(k.schluessel);
      if (state.uebersetzt.length > MAX_HISTORIE) state.uebersetzt = state.uebersetzt.slice(-MAX_HISTORIE);
      saveState(STATE_KEY, state);
      erfolgreich++;
    } catch (err) {
      console.error(`[75-uebersetzungs-entwurf-agent] Fehler bei "${k.produkt.title}" (${k.sprache}):`, err.message || err);
    }
  }

  console.log(`[75-uebersetzungs-entwurf-agent] ${erfolgreich}/${kandidaten.length} Übersetzungs-Entwurf/Entwürfe verschickt.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[75-uebersetzungs-entwurf-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[75-uebersetzungs-entwurf-agent] Fehler:', err);
  process.exit(1);
});
