// UGC-Video-Skript-Fabrik - wöchentlich N kurze Video-Skripte (TikTok/Reels) mit Handy-Regie zum Selbstabfilmen für den aktuellen Bestseller
// Original: n8n Workflow "38_UGC_Video_Skript_Fabrik" · Zeitplan: mittwochs 07:30
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const anzahl = parseInt(config.ANZAHL_SKRIPTE || '8');
  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);
  const orders = (await getOrdersSince(vor30Tagen)).filter((o) => !o.cancelled_at);

  const produkte = {};
  for (const o of orders) {
    for (const li of o.line_items || []) produkte[li.title] = (produkte[li.title] || 0) + li.quantity;
  }
  const top = Object.entries(produkte).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const held = top.length ? top[0][0] : '(dein Bestseller / Hauptprodukt)';

  const prompt = `Du bist UGC-Video-Regisseur und schreibst am Fließband kurze Video-Skripte (TikTok/Reels/YouTube-Shorts) für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE}). Die Skripte werden mit dem Handy selbst abgefilmt (kein Kamerateam, keine KI-Avatar-Tools) - jede Anweisung muss von einer einzelnen Person allein umsetzbar sein.${NL}${NL}HELD-PRODUKT: ${held}${NL}${NL}Schreibe ${anzahl} KOMPLETT unterschiedliche 20-35-Sekunden-UGC-Skripte. Nutze verschiedene Formate: Problem/Lösung, "3 Gründe warum", Vorher/Nachher, ehrliche Review, Unboxing, "POV: du...", Storytime, Mythos-Check, Vergleich, Tutorial.${NL}${NL}Für JEDES Skript liefere:${NL}- Format/Angle${NL}- HOOK (die ersten 3 Sekunden, wörtlich gesprochen - muss den Scroll stoppen)${NL}- Skript Szene für Szene (was gesagt wird + was man im Bild sieht/macht)${NL}- HANDY-REGIE: konkrete Selbstdreh-Anweisungen pro Szene - Handyhaltung (Frontkamera selfie vs. hingestellt/angelehnt für beide Hände frei), Positionierung zum Produkt, Lichttipp (z.B. "zum Fenster drehen"), welche Hand/Bewegung was macht${NL}- Text-Overlays (was on-screen eingeblendet wird)${NL}- CTA am Ende${NL}- Caption + 5 Hashtags${NL}${NL}Klingt echt und menschlich, kein Werbe-Sprech. Antworte als sauberes HTML: jedes Skript als eigene Karte (<div> mit Rahmen, Nummer, gelabelte Felder), copy-paste-freundlich. Ohne html/body-Gerüst, kein Markdown-Codeblock.`;

  const html = await askClaude(prompt, { maxTokens: 6000 });

  const hinweis = `<div style="background:#faf5ff;border:1px solid #a855f7;padding:12px;border-radius:8px;font-family:sans-serif;font-size:13px;margin-bottom:20px;">UGC-Skript-Fabrik: ${anzahl} Video-Skripte für <b>${held}</b> - mit Handy-Regie-Anweisungen zum Selbstabfilmen. Kein Kamerateam, kein Avatar-Tool nötig. Jede Woche neue Angles zum Testen.</div>`;

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `UGC-Skript-Fabrik: ${anzahl} neue Video-Skripte - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;">${hinweis}${html}</div>`,
  });

  console.log(`[38-ugc-video-skript-fabrik] ${anzahl} Skripte für "${held}" versendet`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[38-ugc-video-skript-fabrik] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[38-ugc-video-skript-fabrik] Fehler:', err);
  process.exit(1);
});
