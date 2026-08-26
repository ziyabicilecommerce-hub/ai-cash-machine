// Feiertags-Radar - erkennt nahende Feiertage und schlägt passende Marketing-Aktion vor
// Original: n8n Workflow "33_Feiertags_Radar" · Zeitplan: täglich 07:15
import { config } from './lib/config.mjs';
import { askKI } from './lib/ki.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

async function main() {
  const vorlauf = parseInt(config.VORLAUF_TAGE || '10');
  const jahr = new Date().getFullYear();

  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${jahr}/${config.LAND_CODE}`);
  const liste = await res.json();

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const treffer = [];

  for (const h of Array.isArray(liste) ? liste : []) {
    if (!h.date) continue;
    const d = new Date(`${h.date}T00:00:00`);
    const tage = Math.round((d - heute) / 86400000);
    if (tage >= 0 && tage <= vorlauf) treffer.push({ name: h.localName || h.name, tage, datum: h.date });
  }

  if (treffer.length === 0) {
    console.log('[33-feiertags-radar] Kein Feiertag im Vorlauf-Zeitraum');
    return;
  }

  treffer.sort((a, b) => a.tage - b.tage);
  const t = treffer[0];

  const prompt = `Du bist Marketing-Stratege für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}${NL}In ${t.tage} Tagen ist "${t.name}" (${t.datum}).${NL}${NL}Gib mir eine schnelle, konkrete Marketing-Aktion dazu auf Deutsch:${NL}1. Passt dieser Anlass überhaupt zur Nische? (ehrlich - wenn nur schwach, sag wie man trotzdem einen Bezug baut)${NL}2. EINE konkrete Aktions-Idee (Angebot/Bundle/Rabatt-Code-Vorschlag) mit passendem Timing${NL}3. EIN fertiger Social-Hook + 1 E-Mail-Betreff${NL}4. Was JETZT vorbereiten (Countdown: heute noch ${t.tage} Tage)${NL}${NL}Kurz, Klartext ohne Markdown, Emojis als Trenner.`;

  const idee = await askKI(prompt, { maxTokens: 1200 });

  await notifyTelegram(
    `FEIERTAGS-RADAR - ${config.SHOP_NAME}${NL}In ${t.tage} Tagen: ${t.name}${NL}--------------------${NL}${NL}${idee}`
  );

  console.log(`[33-feiertags-radar] ${t.name} in ${t.tage} Tagen`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[33-feiertags-radar] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[33-feiertags-radar] Fehler:', err);
  process.exit(1);
});
