// Wöchentlicher Signal-Digest (Pendant zum Krypto-Bot): fasst die
// Ergebnisse von Auto-Backtest, Strategie-Turnier, Monte-Carlo-Simulation
// und Korrelationsmatrix - im selben Montags-Lauf schon berechnet (siehe
// autobacktest.mjs, montecarlo.mjs) - zu EINER WhatsApp/Telegram-Nachricht
// zusammen. Läuft NACH pruefeUndFuehreAutoBacktest und
// pruefeUndAktualisiereMonteCarlo im selben Cron-Tick - liest nur bereits
// geschriebene KV-Werte, KEIN zusätzlicher externer API-Call.
//
// Unmissverständlich: reine Beobachtung aus den eigenen Analysen, KEINE
// Kauf-/Verkaufsempfehlung.

import { notify } from './notify.mjs';

const KILL_SWITCH_WARN_SCHWELLE = 20; // %
const KORRELATION_WARN_SCHWELLE = 0.7;

function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

export async function pruefeUndSendeSignalDigest(env, cfg) {
  if (!cfg.autoBacktest && !cfg.monteCarlo) return;
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return;
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.STOCKS_STATE.get('digest:letzteWoche');
  if (letzte === aktuelleWoche) return;

  const killSwitchRisiko = [];
  const strategieAbweichung = [];

  for (const symbol of cfg.symbols) {
    try {
      const mcRaw = await env.STOCKS_STATE.get(`montecarlo:${symbol}`);
      if (mcRaw) {
        const mc = JSON.parse(mcRaw);
        if (mc.wahrscheinlichkeitKillSwitchProzent >= KILL_SWITCH_WARN_SCHWELLE) {
          killSwitchRisiko.push(`${symbol} (${mc.wahrscheinlichkeitKillSwitchProzent.toFixed(0)}%)`);
        }
      }
    } catch {
      // Kaputter/fehlender Eintrag - einfach überspringen.
    }
    try {
      const tRaw = await env.STOCKS_STATE.get(`turnier:${symbol}`);
      if (tRaw) {
        const t = JSON.parse(tRaw);
        const bester = t.ranking[0];
        if (bester && bester.strategie !== t.aktuelleStrategie) {
          const live = t.ranking.find((r) => r.strategie === t.aktuelleStrategie);
          strategieAbweichung.push(`${symbol}: ${bester.strategie} ${bester.gesamtReturnProzent >= 0 ? '+' : ''}${bester.gesamtReturnProzent.toFixed(1)}% vs. live ${t.aktuelleStrategie} ${live ? `${live.gesamtReturnProzent >= 0 ? '+' : ''}${live.gesamtReturnProzent.toFixed(1)}%` : '–'}`);
        }
      }
    } catch {
      // Kaputter/fehlender Eintrag - einfach überspringen.
    }
  }

  const korrelationsPaare = [];
  try {
    const kRaw = await env.STOCKS_STATE.get('korrelation:matrix');
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

  const zeilen = [];
  if (killSwitchRisiko.length) zeilen.push(`⚠️ Erhöhtes Kill-Switch-Risiko laut Monte-Carlo (≥${KILL_SWITCH_WARN_SCHWELLE}%): ${killSwitchRisiko.join(', ')}`);
  if (strategieAbweichung.length) zeilen.push(`🏆 Andere Strategie führt aktuell im Turnier: ${strategieAbweichung.join(' | ')}`);
  if (korrelationsPaare.length) zeilen.push(`🔗 Starke Korrelation (≥${KORRELATION_WARN_SCHWELLE}): ${korrelationsPaare.join(', ')}`);

  const text = zeilen.length
    ? `📋 Wöchentlicher Signal-Digest (Auto-Backtest + Strategie-Turnier + Monte-Carlo + Korrelation zusammengeführt):\n${zeilen.join('\n')}\n\nRein informativ - keine Kauf-/Verkaufsempfehlung, keine automatische Aktion.`
    : `📋 Wöchentlicher Signal-Digest: keine besonderen Auffälligkeiten diese Woche - alle Symbole innerhalb normaler Bandbreiten.`;
  await notify(env, text);

  await env.STOCKS_STATE.put('digest:letzteWoche', aktuelleWoche);
}
