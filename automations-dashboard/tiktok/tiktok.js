// TikTok Viral-Zentrale: liest daten.json (alle 3 Stunden von Automation #103 erzeugt) und zeigt sie an.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const zahl = (n) => new Intl.NumberFormat('de-DE').format(Math.round(n || 0));
const uhr = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
const sicher = (u) => (/^https:\/\/(www\.)?tiktok\.com\//.test(String(u || '')) ? u : '');

function kpi(wert, name, trend) {
  const k = el('div', 'karte kpi');
  k.append(el('div', 'wert', wert), el('div', 'name', name));
  if (trend) k.append(el('div', `trend ${trend.klasse}`, trend.text));
  return k;
}

function zeigeKpis(g) {
  const diff = g.aufrufeVor7 ? Math.round(((g.aufrufe7 - g.aufrufeVor7) / g.aufrufeVor7) * 100) : null;
  const trend = diff === null ? null : { klasse: diff >= 0 ? 'hoch' : 'runter', text: `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)} % ggü. Vorwoche` };
  $('kpis').replaceChildren(
    kpi(zahl(g.aufrufe), 'Aufrufe (30 Tage)'),
    kpi(zahl(g.aufrufe7), 'Aufrufe letzte 7 Tage', trend),
    kpi(`${g.sehdauer || 0} s`, 'Ø Sehdauer'),
    kpi(zahl(g.likes), 'Likes'),
    kpi(zahl(g.kommentare), 'Kommentare'),
    kpi(zahl(g.posts), 'Posts'),
  );
}

function zeigeTipps(tipps) {
  $('tipps').replaceChildren(...(tipps.length ? tipps : [{ stufe: 'gut', text: 'Alles im grünen Bereich.' }]).map((t) => el('div', `tipp ${t.stufe}`, t.text)));
}

function zeigeKonten(konten) {
  if (!konten.length) { $('konten').replaceChildren(el('p', 'leer', 'Noch keine TikTok-Konten gefunden.')); return; }
  $('konten').replaceChildren(...konten.map((k) => {
    const c = el('div', 'karte konto');
    c.append(el('h3', '', k.name), el('div', 'nische', k.nische.length ? `Thema: ${k.nische.join(' · ')}` : 'alle Themen'));
    const z = el('div', 'zeilen');
    for (const [n, w] of [['Serie', `Teil ${k.serie}`], ['Posts', zahl(k.posts)], ['Aufrufe', zahl(k.aufrufe)], ['Ø Sehdauer', `${k.sehdauer} s`], ['Likes', zahl(k.likes)], ['Kommentare', zahl(k.kommentare)]]) z.append(el('span', '', n), el('span', '', w));
    c.append(z);
    if (k.bester) {
      const b = el('div', 'bester', 'Bestes Video: ');
      const link = sicher(k.bester.link);
      const t = link ? Object.assign(el('a', '', k.bester.text), { href: link, target: '_blank', rel: 'noopener' }) : el('span', '', k.bester.text);
      b.append(t, document.createTextNode(` (${zahl(k.bester.aufrufe)} Aufrufe)`));
      c.append(b);
    }
    return c;
  }));
}

function zeigeLernen(l) {
  if (!l || (!l.quiz?.n && !l.mythos?.n)) { $('lernen').replaceChildren(el('p', 'leer', 'Noch zu wenige Zahlen - das System lernt, sobald je 4 Posts pro Format Aufrufe haben.')); return; }
  const karte = (name, s) => { const c = el('div', 'karte kpi'); c.append(el('div', 'wert', String(s.punkte)), el('div', 'name', `${name}: ${s.n} Posts · Ø ${s.n ? Math.round((s.sehdauer / s.n) * 10) / 10 : 0} s`)); return c; };
  const fazit = el('div', 'karte kpi');
  fazit.append(el('div', 'wert', l.bevorzugt ? l.bevorzugt.toUpperCase() : 'offen'), el('div', 'name', l.bevorzugt ? 'kommt öfter dran' : 'noch kein klarer Sieger'));
  $('lernen').replaceChildren(karte('Quiz', l.quiz), karte('Mythos/Wahrheit', l.mythos), fazit);
}

function tabelle(id, zeilen, mitZahlen) {
  const t = $(id);
  if (!zeilen.length) { t.replaceChildren(Object.assign(el('caption', 'leer', 'Nichts da.'))); return; }
  const kopf = el('tr');
  for (const [h, cls] of [['Zeit', ''], ['Konto', ''], ['Video', ''], ...(mitZahlen ? [['Aufrufe', 'zahl'], ['Sehdauer', 'zahl weg'], ['Kommentare', 'zahl weg']] : [])]) kopf.append(el('th', cls, h));
  t.replaceChildren(kopf, ...zeilen.map((z) => {
    const r = el('tr');
    const link = sicher(z.link);
    const video = el('td');
    video.append(link ? Object.assign(el('a', '', z.text), { href: link, target: '_blank', rel: 'noopener' }) : el('span', '', z.text));
    r.append(el('td', '', uhr(z.zeit)), el('td', '', z.konto), video);
    if (mitZahlen) r.append(el('td', 'zahl', zahl(z.aufrufe)), el('td', 'zahl weg', `${z.sehdauer} s`), el('td', 'zahl weg', zahl(z.kommentare)));
    return r;
  }));
}

async function laden() {
  try {
    const res = await fetch(`daten.json?t=${Date.now()}`, { cache: 'no-store' });
    const d = await res.json();
    $('stand').textContent = d.stand ? `Stand: ${uhr(d.stand)} (aktualisiert alle 3 Stunden)` : 'Noch keine Daten - der erste Abruf kommt mit Automation #103.';
    zeigeKpis(d.gesamt || {});
    zeigeTipps(d.tipps || []);
    zeigeKonten(d.konten || []);
    zeigeLernen(d.lernen);
    tabelle('geplant', d.geplant || [], false);
    tabelle('letzte', d.letzte || [], true);
  } catch (err) {
    $('stand').textContent = 'Daten konnten nicht geladen werden.';
  }
}
laden();
