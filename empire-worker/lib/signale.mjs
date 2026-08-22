// On-demand Signal-Übersicht über BEIDE Bots - liest direkt aus den bereits
// vom wöchentlichen Cron der einzelnen Bots geschriebenen KV-Werten
// (montecarlo:<symbol>, turnier:<symbol>, korrelation:matrix) - kein
// zusätzlicher API-Call, kein .put() (rein lesend wie der Rest dieses
// Workers). Ergänzt den wöchentlichen Signal-Digest der einzelnen Bots
// (läuft nur montags) um eine ABRUFBARE Variante: per /signale-Befehl im
// Telegram-Bot, jederzeit statt nur einmal pro Woche.

const KILL_SWITCH_WARN_SCHWELLE = 20;
const KORRELATION_WARN_SCHWELLE = 0.7;

async function ladeSignaleAusKv(kv) {
  const killSwitchRisiko = [];
  const strategieAbweichung = [];

  try {
    const mcList = await kv.list({ prefix: 'montecarlo:' });
    for (const key of mcList.keys) {
      if (key.name === 'montecarlo:letzteWoche') continue;
      const raw = await kv.get(key.name);
      if (!raw) continue;
      try {
        const mc = JSON.parse(raw);
        if (mc.wahrscheinlichkeitKillSwitchProzent >= KILL_SWITCH_WARN_SCHWELLE) {
          killSwitchRisiko.push(`${key.name.replace('montecarlo:', '')} (${mc.wahrscheinlichkeitKillSwitchProzent.toFixed(0)}%)`);
        }
      } catch {
        // Kaputter/unerwarteter Eintrag - einfach überspringen.
      }
    }
  } catch {
    // KV-Liste fehlgeschlagen - Monte-Carlo-Teil einfach leer lassen.
  }

  try {
    const tList = await kv.list({ prefix: 'turnier:' });
    for (const key of tList.keys) {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      try {
        const t = JSON.parse(raw);
        const bester = t.ranking && t.ranking[0];
        if (bester && bester.strategie !== t.aktuelleStrategie) {
          strategieAbweichung.push(`${t.symbol}: ${bester.strategie} führt (${bester.gesamtReturnProzent >= 0 ? '+' : ''}${bester.gesamtReturnProzent.toFixed(1)}%)`);
        }
      } catch {
        // Kaputter/unerwarteter Eintrag - einfach überspringen.
      }
    }
  } catch {
    // KV-Liste fehlgeschlagen - Turnier-Teil einfach leer lassen.
  }

  const korrelationsPaare = [];
  try {
    const kRaw = await kv.get('korrelation:matrix');
    if (kRaw) {
      const k = JSON.parse(kRaw);
      const symbole = Object.keys(k.matrix || {});
      for (let i = 0; i < symbole.length; i++) {
        for (let j = i + 1; j < symbole.length; j++) {
          const wert = k.matrix[symbole[i]][symbole[j]];
          if (wert != null && Math.abs(wert) >= KORRELATION_WARN_SCHWELLE) {
            korrelationsPaare.push(`${symbole[i]}-${symbole[j]} (${wert.toFixed(2)})`);
          }
        }
      }
    }
  } catch {
    // Kaputter/fehlender Eintrag - einfach überspringen.
  }

  return { killSwitchRisiko, strategieAbweichung, korrelationsPaare };
}

export async function formatSignaleAntwort(env) {
  const [krypto, aktien] = await Promise.all([
    ladeSignaleAusKv(env.TRADING_STATE),
    ladeSignaleAusKv(env.STOCKS_STATE),
  ]);

  const killAlle = [...krypto.killSwitchRisiko.map((s) => `₿ ${s}`), ...aktien.killSwitchRisiko.map((s) => `📈 ${s}`)];
  const strategieAlle = [...krypto.strategieAbweichung.map((s) => `₿ ${s}`), ...aktien.strategieAbweichung.map((s) => `📈 ${s}`)];
  const korrAlle = [...krypto.korrelationsPaare.map((s) => `₿ ${s}`), ...aktien.korrelationsPaare.map((s) => `📈 ${s}`)];

  const zeilen = [];
  if (killAlle.length) zeilen.push(`⚠️ Erhöhtes Kill-Switch-Risiko laut Monte-Carlo (≥${KILL_SWITCH_WARN_SCHWELLE}%):\n${killAlle.join('\n')}`);
  if (strategieAlle.length) zeilen.push(`🏆 Andere Strategie führt aktuell im Turnier:\n${strategieAlle.join('\n')}`);
  if (korrAlle.length) zeilen.push(`🔗 Starke Korrelation (≥${KORRELATION_WARN_SCHWELLE}):\n${korrAlle.join('\n')}`);

  const kern = zeilen.length ? zeilen.join('\n\n') : 'Keine besonderen Auffälligkeiten gerade - alle Symbole innerhalb normaler Bandbreiten.';
  return `📋 Signal-Übersicht (beide Bots, live abgerufen):\n\n${kern}\n\nRein informativ - keine Kauf-/Verkaufsempfehlung, keine automatische Aktion.`;
}
