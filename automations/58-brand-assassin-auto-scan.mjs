// Brand Assassin Auto-Scan - lässt den Markt-Scan aus der Brand-Assassin-App
// automatisch für deine eigene Nische laufen (kein manueller Login/Chat
// nötig). Neu, kein n8n-Workflow · Zeitplan: wöchentlich.
//
// WICHTIG zur Einordnung: Brand Assassin selbst bleibt unverändert live und
// interaktiv (Product Scan/Creative/Brand-Audit brauchen jeweils ein
// SPEZIFISCHES Produkt/Ad/Brand als Eingabe - das kann nicht "von selbst"
// laufen, ohne dass jemand sagt WAS geprüft werden soll). Der Markt-Scan ist
// der einzige Baustein mit einem sinnvollen Fixwert (deine eigene Nische,
// SHOP_NISCHE), deshalb läuft GENAU DER hier automatisch mit demselben
// Prompt/JSON-Format wie in der App (runMarket() in brand-assassin/index.html).
// Jarvis hat keinen vergleichbaren wiederkehrenden Task (reiner Chat-Hub) -
// sein automatisches Gegenstück ist bereits die App Oracle (tägliches Briefing).
import { config } from './lib/config.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';

const JSON_RULES = `Antworte NUR mit validem JSON, kein Markdown, keine Erklärung drumherum. Alle Texte auf Deutsch, direkt und ohne Floskeln. Format:
{"score": 0, "badge": "<2-4 Wörter Urteil, z.B. LAUNCH IT / RISKANT / FINGER WEG>", "title": "<kurze knallige Überschrift>", "summary": "<2-3 Sätze ehrliches Fazit>", "metrics": [{"label":"Nachfrage","value":"...","score":0},{"label":"Konkurrenz","value":"...","score":0},{"label":"Timing","value":"...","score":0},{"label":"Monetarisierung","value":"...","score":0}], "good": ["..."], "bad": ["..."], "plan": ["..."]}`;

async function main() {
  const nische = config.SHOP_NISCHE;
  if (!nische) {
    console.log('[58-brand-assassin-auto-scan] Keine SHOP_NISCHE konfiguriert - übersprungen.');
    return;
  }

  const system = `Du bist ein Markt-Analyst für E-Commerce und digitale Produkte. Du bewertest Nischen nach Nachfrage, Konkurrenz-Dichte, Timing und Monetarisierungs-Potenzial. ${JSON_RULES} Metrics müssen sein: Nachfrage, Konkurrenz (10 = wenig Konkurrenz), Timing, Monetarisierung.`;
  const user = `Nische: ${nische}\nRegion: ${config.HEIMATMARKT || 'DACH'}`;

  const antwort = await askClaude(user, { system, maxTokens: 1600 });
  const daten = parseJsonFromText(antwort, null);
  if (!daten) {
    console.log('[58-brand-assassin-auto-scan] Ungültige Antwort, kein Report versendet.');
    return;
  }

  const metrics = (daten.metrics || []).map((m) => `${m.label}: ${m.value} (${m.score}/10)`).join(' · ');
  const text = [
    `🎯 *Brand Assassin Markt-Scan* - ${nische}`,
    `Score: ${daten.score}/100 · ${daten.badge}`,
    `*${daten.title}*`,
    daten.summary,
    metrics,
    daten.good?.length ? `*Chancen:*\n${daten.good.map((g) => `+ ${g}`).join('\n')}` : '',
    daten.bad?.length ? `*Risiken:*\n${daten.bad.map((b) => `- ${b}`).join('\n')}` : '',
    daten.plan?.length ? `*Plan:*\n${daten.plan.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  await notifyWhatsapp(text);
  console.log(`[58-brand-assassin-auto-scan] Markt-Scan für "${nische}" versendet, Score ${daten.score}/100.`);
}

main().catch((err) => {
  console.error('[58-brand-assassin-auto-scan] Fehler:', err);
  process.exit(1);
});
