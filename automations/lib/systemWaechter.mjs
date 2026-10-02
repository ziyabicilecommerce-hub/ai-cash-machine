// System-Waechter: prueft ALLE GitHub-Workflows der Cash Machine (nicht nur die nummerierten), findet
// Abstuerze und haengende Zeitplaene und startet abgestuerzte Laeufe wichtiger Agenten EINMAL neu
// (die meisten Fehler sind kurze Netz-/Drosselungsprobleme). Meldet nur NEUE Probleme.

const STUNDE = 36e5;

// Agenten, deren Fehlschlag automatisch einmal neu versucht wird (alle sind wiederholbar/idempotent).
export const SELBSTHEILEN = new Set([
  '94 · Video-Fabrik', 'Werbe-Labor', 'Shop-Doktor + Produkt-Feeds', '99 · Direkt-Poster', 'Kommentar-Agent',
  'Leistungs-Sammler + Trend-Radar', 'Engpass-Chef (Agenten-Fließband)', 'Community-Agent', '100 · Fakten-Kanal', 'Deploy Site to GitHub Pages',
]);

// Erwarteter Rhythmus wichtiger Zeitplaene (Stunden) und ihre Datei: laenger ohne Lauf = "haengt".
export const RHYTHMUS = {
  '94 · Video-Fabrik': [26, 'automation-94-video-fabrik.yml'], 'Werbe-Labor': [26, 'werbe-labor.yml'],
  'Shop-Doktor + Produkt-Feeds': [26, 'shop-doktor.yml'], '99 · Direkt-Poster': [14, 'automation-99-direkt-poster.yml'],
  'Kommentar-Agent': [14, 'kommentar-agent.yml'], 'Leistungs-Sammler + Trend-Radar': [26, 'leistung-sammler.yml'],
  'Engpass-Chef (Agenten-Fließband)': [26, 'engpass-chef.yml'], 'Community-Agent': [26, 'community-agent.yml'],
};

// laeufe: GitHub-API workflow_runs (neueste zuerst). Ergebnis je Workflow + Problemliste.
// Nur Laeufe auf main zaehlen (Pruef-Laeufe auf Arbeits-Branches sind kein Problem des Systems).
// letzte: {Workflow-Name: letzter Lauf} fuer wichtige Agenten, die im Zeitfenster gar nicht vorkamen.
export function auswerten(laeufe, { jetzt = Date.now(), letzte = {} } = {}) {
  const je = new Map();
  for (const r of laeufe.filter((x) => !x.head_branch || x.head_branch === 'main')) {
    if (!je.has(r.name)) je.set(r.name, []);
    je.get(r.name).push(r);
  }
  const workflows = [...je.entries()].map(([name, rs]) => {
    const fertig = rs.filter((r) => r.status === 'completed');
    const letzter = fertig[0] || rs[0];
    const tag = fertig.filter((r) => jetzt - Date.parse(r.created_at) < 24 * STUNDE);
    return {
      name, url: letzter.html_url, letzterLauf: letzter.created_at, ergebnis: letzter.conclusion || letzter.status, versuch: letzter.run_attempt || 1, runId: letzter.id,
      laeufe24h: tag.length, fehler24h: tag.filter((r) => r.conclusion === 'failure').length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const probleme = [];
  for (const w of workflows) {
    if (w.ergebnis === 'failure') probleme.push({ art: 'absturz', name: w.name, text: `letzter Lauf fehlgeschlagen${w.fehler24h > 1 ? ` (${w.fehler24h}x in 24 h)` : ''}`, url: w.url });
    const r = RHYTHMUS[w.name]?.[0];
    if (r && jetzt - Date.parse(w.letzterLauf) > r * STUNDE) probleme.push({ art: 'haengt', name: w.name, text: `seit ${Math.round((jetzt - Date.parse(w.letzterLauf)) / STUNDE)} h kein Lauf`, url: w.url });
  }
  // Wichtige Agenten ohne Lauf im Fenster: haengt nur, wenn es frueher schon Laeufe gab (neue Agenten nicht).
  for (const [name, [h]] of Object.entries(RHYTHMUS)) {
    if (je.has(name) || !letzte[name]) continue;
    if (jetzt - Date.parse(letzte[name]) > h * STUNDE) probleme.push({ art: 'haengt', name, text: `seit ${Math.round((jetzt - Date.parse(letzte[name])) / STUNDE)} h kein Lauf`, url: '' });
  }
  return { workflows, probleme };
}

// Welche Laeufe neu starten? Nur Abstuerze wichtiger Agenten, nur der erste Versuch, nur juenger als 12 h.
export function neuStarten(workflows, { jetzt = Date.now() } = {}) {
  return workflows.filter((w) => w.ergebnis === 'failure' && SELBSTHEILEN.has(w.name) && w.versuch === 1 && jetzt - Date.parse(w.letzterLauf) < 12 * STUNDE);
}

export const schluessel = (p) => `${p.art}|${p.name}`;

// Verpasste Zeitplaene: GitHub laesst geplante Laeufe unter Last manchmal ausfallen - haengende wichtige
// Agenten werden per workflow_dispatch nachgeholt (Datei aus RHYTHMUS).
export const nachholen = (probleme) => [...new Set(probleme.filter((p) => p.art === 'haengt' && RHYTHMUS[p.name]).map((p) => p.name))].map((name) => ({ name, datei: RHYTHMUS[name][1] }));
