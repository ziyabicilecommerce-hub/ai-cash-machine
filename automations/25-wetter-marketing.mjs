// Wetter-Marketing - tägliche wetterbasierte Marketing-Idee (spontane Aktionen bei passendem Wetter)
// Original: n8n Workflow "25_Wetter_Marketing" · Zeitplan: täglich 08:00
import { config } from './lib/config.mjs';
import { askClaude } from './lib/claude.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

function wetterText(code) {
  if (code === 0) return 'klarer Himmel';
  if (code <= 3) return 'leicht bewölkt';
  if (code <= 48) return 'neblig';
  if (code <= 67) return 'Regen';
  if (code <= 77) return 'Schnee';
  if (code <= 82) return 'Regenschauer';
  if (code <= 99) return 'Gewitter';
  return 'wechselhaft';
}

async function main() {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${config.LAT}&longitude=${config.LON}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=1`
  );
  const data = await res.json();
  const d = data.daily || {};
  const code = d.weather_code?.[0];
  const tmax = d.temperature_2m_max?.[0];
  const tmin = d.temperature_2m_min?.[0];
  const regen = d.precipitation_sum?.[0];
  const wind = d.wind_speed_10m_max?.[0];

  const wetter = wetterText(code);
  const daten = `Heute in ${config.REGION}: ${wetter}, ${Math.round(tmin)} bis ${Math.round(tmax)} Grad, Niederschlag ${regen} mm, Wind bis ${Math.round(wind)} km/h.`;

  const prompt = `Du bist kreativer Marketing-Stratege für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}${NL}WETTER HEUTE:${NL}${daten}${NL}${NL}Wetter beeinflusst Kauflaune. Gib mir auf Deutsch, knapp und umsetzbar:${NL}1. Passt das heutige Wetter zu einer spontanen Marketing-Aktion für diese Nische? (ehrlich - wenn nein, sag es)${NL}2. Falls ja: EINE konkrete Aktions-Idee (Angebot/Angle/Rabatt) die zum Wetter + zur Nische passt${NL}3. EIN fertiger Social-Media-Hook (1-2 Sätze) mit Wetter-Bezug${NL}4. EINE Betreffzeile für eine schnelle Wetter-Mail (falls sinnvoll)${NL}${NL}Kurz, Klartext ohne Markdown, Emojis als Trenner.`;

  const idee = await askClaude(prompt, { maxTokens: 1200 });

  await notifyTelegram(`WETTER-MARKETING - ${config.SHOP_NAME}${NL}--------------------${NL}${NL}${idee}`);

  console.log('[25-wetter-marketing] Wetter-Idee versendet');
}

main().catch((err) => {
  console.error('[25-wetter-marketing] Fehler:', err);
  process.exit(1);
});
