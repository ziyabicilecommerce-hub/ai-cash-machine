// SEO-Text-Doktor - findet Produkte mit zu dünnen Beschreibungen und schreibt sie neu (SEO-optimiert)
// Original: n8n Workflow "28_SEO_Text_Doktor" · Zeitplan: dienstags 09:00
import { config } from './lib/config.mjs';
import { getProducts } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const minLen = parseInt(config.MIN_TEXTLAENGE || '300');
  const produkte = await getProducts({ limit: '250', fields: 'id,title,body_html,product_type,tags' });

  const schwach = [];
  for (const p of produkte) {
    const roh = (p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (roh.length < minLen) {
      schwach.push({ titel: p.title, laenge: roh.length, typ: p.product_type || '', text: roh.slice(0, 300) });
    }
  }
  schwach.sort((a, b) => a.laenge - b.laenge);
  const top = schwach.slice(0, 5);

  let prompt;
  if (top.length === 0) {
    prompt = `Sage in einem kurzen Satz auf Deutsch (Du-Form), dass beim Shop "${config.SHOP_NAME}" aktuell alle Produkttexte ausreichend lang/ausführlich sind - starke SEO-Basis. Ohne Markdown.`;
  } else {
    const liste = top.map(
      (p, i) => `${i + 1}. "${p.titel}" (Typ: ${p.typ || 'k.A.'}, aktuell nur ${p.laenge} Zeichen)${NL}   Bisheriger Text: ${p.text || '(leer)'}`
    );
    prompt = `Du bist SEO-Copywriter für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Markt: DACH).${NL}${NL}Diese Produkte haben zu dünne Beschreibungen und ranken deshalb schlecht bei Google:${NL}${liste.join(`${NL}${NL}`)}${NL}${NL}Schreibe für JEDES dieser Produkte eine neue, verkaufsstarke UND SEO-optimierte Produktbeschreibung auf Deutsch:${NL}- 120-200 Wörter, Struktur: Nutzen-Einstieg, 3-4 Bullet-Vorteile, kurzer Anwendungs-/Vertrauensteil, Mini-CTA${NL}- Relevante Keywords der Nische natürlich einbauen (nicht stopfen)${NL}- Pro Produkt zusätzlich: 1 SEO-Meta-Title (max 60 Zeichen) + 1 Meta-Description (max 155 Zeichen)${NL}${NL}Antworte als sauberes HTML mit einem <h2> je Produkt und copy-paste-freundlichen Blöcken, ohne html/body-Gerüst, kein Markdown-Codeblock.`;
  }

  const html = await askClaude(prompt, { maxTokens: 4000 });

  const hinweis =
    '<div style="background:#eef2ff;border:1px solid #6366f1;padding:12px;border-radius:8px;font-family:sans-serif;font-size:13px;margin-bottom:20px;">SEO-Text-Doktor: neue Produkttexte unten. In Shopify beim jeweiligen Produkt in die Beschreibung + SEO-Felder (unten auf der Produktseite) einsetzen.</div>';

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `SEO-Text-Kur: neue Produkttexte - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">${hinweis}${html}</div>`,
  });

  console.log(`[28-seo-text-doktor] ${top.length} schwache Produkttext(e) gefunden`);
}

main().catch((err) => {
  console.error('[28-seo-text-doktor] Fehler:', err);
  process.exit(1);
});
