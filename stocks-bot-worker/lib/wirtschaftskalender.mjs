// Wirtschaftskalender-Filter (kein API-Key nötig, öffentliche Gratis-
// Quelle): pausiert Käufe rund um marktbewegende US-Wirtschaftstermine
// (FOMC-Zinsentscheide, CPI, NFP - "High Impact" USD-Events). Sowohl Krypto
// als auch Aktien reagieren auf solche Events oft mit extremer Volatilität
// und dünner Liquidität - klassischerweise ein schlechter Moment für neue
// Positionen, unabhängig von der sonstigen Marktlage. Gleiches Modul (fast)
// unverändert auch in stocks-bot-worker - EIN gemeinsames Makro-Risiko-
// Signal für beide Bots, statt zwei unabhängige Konzepte.
//
// Datenquelle: nfs.faireconomy.media (öffentlicher ForexFactory-Kalender-
// Export, JSON, kein Key nötig, von zahllosen Trading-Bots/EAs weltweit
// genutzt). ACHTUNG Rate-Limit: laut Anbieter max. 2 Abrufe pro 5 Minuten
// INSGESAMT für diese URL - deshalb hier bewusst nur EINMAL pro Cron-Lauf
// abgerufen (nicht pro Symbol) und für alle Symbole gemeinsam verwendet.

const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// Lädt alle "High Impact"-Termine für die angegebenen Währungen aus dem
// Kalender dieser Woche. Leeres Array bei jedem Fehler/Ausfall - der Filter
// ist dann einfach unwirksam, blockiert den Bot nie dauerhaft.
export async function ladeAnstehendeHighImpactEvents(waehrungen = ['USD']) {
  try {
    const res = await fetch(CALENDAR_URL);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((e) => e.impact === 'High' && waehrungen.includes(e.country));
  } catch {
    return [];
  }
}

// Prüft, ob JETZT innerhalb von fensterMinuten VOR ODER NACH einem der
// geladenen Events liegt (symmetrisches Fenster - vor dem Event wegen der
// Erwartungshaltung/Positionierung des Marktes, danach wegen der
// tatsächlichen Kursreaktion).
export function istInEventFenster(events, fensterMinuten) {
  const jetzt = Date.now();
  const fensterMs = fensterMinuten * 60000;
  return events.some((e) => {
    const zeit = new Date(e.date).getTime();
    return Number.isFinite(zeit) && Math.abs(jetzt - zeit) <= fensterMs;
  });
}
