// Suite-Übersicht (#117): sammelt Apps (aus dem Pages-Build), Workflows und deren letzten Lauf-Status.
// Reine Funktionen - das Skript 117-suite-uebersicht.mjs liest Dateien und die GitHub-API und schreibt uebersicht/daten.json.

// Apps = Ordner, die jarvis-pages.yml nach _site kopiert (cp -r <ordner> _site/...)
export function appsAusBuild(yml = '') {
  return [...new Set([...String(yml).matchAll(/cp -r ([a-zA-Z0-9_-]+) _site\//g)].map((m) => m[1]))].filter((a) => a !== 'trading-bot-worker');
}

const ent = (t) => String(t || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

// Titel und Beschreibung aus dem <head> einer App
export function appInfo(ordner, html = '') {
  const titel = ent((html.match(/<title>([^<]*)<\/title>/i) || [])[1]) || ordner;
  const text = ent((html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || [])[1]);
  return { ordner, titel, text: text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, '')} …` : text };
}

// Workflow-Name aus der YAML-Datei (erste "name:"-Zeile ganz links)
export function workflowName(datei, yml = '') {
  const m = String(yml).match(/^name:\s*["']?(.+?)["']?\s*$/m);
  return m ? m[1] : datei.replace(/\.ya?ml$/, '');
}

// Status je Workflow aus den letzten Läufen (neueste zuerst). Abgebrochene/übersprungene Läufe zählen nicht.
// rot = letzter echter Lauf gescheitert; gelb = gescheitert, aber der vorletzte war ok (vielleicht nur ein Ausrutscher);
// ruhig = in den gelieferten Läufen gar nicht dabei (selten geplant oder pausiert)
export function workflowStatus(workflows, laeufe) {
  const proDatei = {};
  for (const l of laeufe) {
    const datei = String(l.path || '').split('/').pop();
    if (!datei || ['cancelled', 'skipped', null, undefined].includes(l.conclusion)) continue;
    (proDatei[datei] ||= []).push(l);
  }
  return workflows.map((w) => {
    const l = proDatei[w.datei] || [];
    if (!l.length) return { ...w, status: 'ruhig' };
    const [a, b] = l;
    const ok = (x) => x && x.conclusion === 'success';
    const status = ok(a) ? 'gruen' : ok(b) ? 'gelb' : 'rot';
    return { ...w, status, zeit: a.created_at, link: a.html_url, rotSeit: status === 'rot' ? (l.find(ok) ? l.find(ok).created_at : null) : null };
  }).sort((x, y) => ({ rot: 0, gelb: 1, gruen: 2, ruhig: 3 }[x.status] - { rot: 0, gelb: 1, gruen: 2, ruhig: 3 }[y.status]) || x.name.localeCompare(y.name, 'de'));
}

export function zaehlen(workflows) {
  const z = { gruen: 0, gelb: 0, rot: 0, ruhig: 0 };
  for (const w of workflows) z[w.status]++;
  return z;
}
