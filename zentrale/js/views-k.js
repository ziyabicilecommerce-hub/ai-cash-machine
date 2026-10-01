// Ansicht: Such-Radar - was Leute zu jedem Produkt wirklich in Google und YouTube suchen.
// Fragen = fertige Video-Ideen, Hashtags zum Kopieren. Daten kommen taeglich vom Such-Radar-Agenten.
(function (root) {
  const { ZUI } = root;
  const { h, kopieren } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  let daten, geladen = false, filter = '';

  async function laden(app) {
    geladen = true;
    try { const r = await fetch('daten/suchbegriffe.json', { cache: 'no-store' }); daten = r.ok ? await r.json() : null; } catch (e) { daten = null; }
    if (app.aktiv === 'suchradar') app.zeichnen();
  }

  const liste = (titel, l) => (l.length ? `<p class="klein-text"><strong>${titel}</strong></p><ul>${l.map((s) => `<li>${h(s)}</li>`).join('')}</ul>` : '');

  function karte(e) {
    const tags = e.hashtags.join(' ');
    return `<section class="box"><h2>${h(e.name)}</h2><p class="klein-text">${h(e.shop || '')} · Grundbegriff: <code>${h(e.stichwort)}</code></p>
      ${e.fragen.length ? `<div class="box betont"><p><strong>Video-Ideen - diese Fragen stellen Leute wirklich:</strong></p><ul>${e.fragen.map((f) => `<li>${h(f)}</li>`).join('')}</ul></div>` : ''}
      <details><summary>Google-Suchen (${e.google.length}) · YouTube-Suchen (${e.youtube.length})</summary>${liste('Google', e.google)}${liste('YouTube', e.youtube)}</details>
      ${tags ? `<div class="reihe" style="margin-top:8px"><code>${h(tags)}</code><button class="knopf klein" data-kopie="${h(tags)}">Hashtags kopieren</button></div>` : ''}</section>`;
  }

  V.suchradar = {
    titel: 'Such-Radar',
    unter: 'Was Leute zu deinen Produkten wirklich in Google und YouTube eintippen - jeden Morgen neu. Die Video-Fabrik beantwortet diese Fragen automatisch in den Videos (nur wenn es ehrlich passt).',
    zeichnen(el, app) {
      if (!geladen) laden(app);
      if (daten === undefined) { el.innerHTML = '<p class="klein-text">Lädt …</p>'; return; }
      if (!daten) { el.innerHTML = '<p class="klein-text">Noch keine Daten - der Such-Radar läuft jeden Morgen um 03:20 UTC (Workflow „Leistungs-Sammler + Trend-Radar“).</p>'; return; }
      const alle = Object.values(daten.produkte || {});
      const zu = alle.filter((e) => !filter || `${e.name} ${e.shop}`.toLowerCase().includes(filter.toLowerCase()));
      el.innerHTML = `<div class="reihe" style="margin-bottom:12px"><input id="such-filter" placeholder="Produkt oder Shop filtern" value="${h(filter)}">
        <span class="klein-text">Stand ${h(String(daten.stand).slice(0, 16).replace('T', ' '))} · ${alle.length} Produkte · ${alle.reduce((s, e) => s + e.fragen.length, 0)} echte Fragen</span></div>${zu.map(karte).join('')}`;
      const f = el.querySelector('#such-filter');
      f.addEventListener('change', () => { filter = f.value; this.zeichnen(el, app); });
      el.querySelectorAll('[data-kopie]').forEach((b) => b.addEventListener('click', () => kopieren(b.dataset.kopie)));
    },
  };
})(window);
