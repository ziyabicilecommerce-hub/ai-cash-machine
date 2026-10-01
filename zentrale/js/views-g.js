// Ansicht: Shop-Doktor (taeglicher Live-Check beider Shops) + Produkt-Feeds fuer Google/Meta/Pinterest.
(function (root) {
  const { ZUI } = root;
  const { h, kopieren } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  let daten = null, geladen = false;
  const STUFE = { kritisch: ['hoch', 'Kritisch'], wichtig: ['mittel', 'Wichtig'], tipp: ['info', 'Tipp'] };
  const chipStufe = (s) => `<span class="chip ${STUFE[s][0]}">${STUFE[s][1]}</span>`;

  async function laden(app) {
    geladen = true;
    try { const r = await fetch('daten/shop-doktor.json', { cache: 'no-store' }); daten = r.ok ? await r.json() : null; } catch (e) { daten = null; }
    if (app.aktiv === 'shopdoktor') app.zeichnen();
  }

  function befundListe(liste) {
    return `<ul class="aufgaben">${liste.map((b) => `<li class="aufgabe" data-prio="${STUFE[b.stufe][0]}"><span class="t">${h(b.was)}${b.tipp ? `<span class="klein-text"> · ${h(b.tipp)}</span>` : ''}</span>${chipStufe(b.stufe)}</li>`).join('')}</ul>`;
  }

  function shopKarte(s, feeds) {
    const alle = [...s.befunde.map((b) => ({ ...b, wo: 'Shop' })), ...s.produkte.flatMap((p) => p.befunde.map((b) => ({ ...b, wo: p.titel })))];
    const zahl = (st) => alle.filter((b) => b.stufe === st).length;
    const f = feeds && feeds[s.name];
    const basis = location.href.replace(/[^/]*([?#].*)?$/, '');
    return `<section class="box"><h2>${h(s.name)} · ${s.punkte}/100</h2>
      <div class="kpis" style="margin-bottom:10px">
        <div class="kpi"><div class="l">Kritisch</div><div class="w">${zahl('kritisch')}</div></div>
        <div class="kpi"><div class="l">Wichtig</div><div class="w">${zahl('wichtig')}</div></div>
        <div class="kpi"><div class="l">Startseite</div><div class="w">${(s.ladezeitMs / 1000).toFixed(1)} s</div></div></div>
      <p class="klein-text">Pflichtseiten: ${Object.entries(s.pflicht || {}).map(([n, ok]) => `<span class="chip ${ok ? 'ok' : 'hoch'}">${h(n)} ${ok ? '✓' : 'fehlt'}</span>`).join(' ')}</p>
      ${s.befunde.length ? `<h3>Shop</h3>${befundListe(s.befunde)}` : ''}
      <h3>Produkte (schlechteste zuerst)</h3>
      ${s.produkte.map((p) => `<details${p.befunde.some((b) => b.stufe === 'kritisch') ? ' open' : ''}><summary>${h(p.titel)} · ${p.punkte}/100 · ${p.befunde.length} Punkte</summary>${p.befunde.length ? befundListe(p.befunde) : '<p class="plus">Alles in Ordnung.</p>'}${p.vorschlag ? `<div class="box" style="margin:8px 0"><h3>Text-Vorschlag (KI, bitte gegenlesen)</h3><p class="klein-text"><strong>Meta-Beschreibung:</strong> ${h(p.vorschlag.meta)}</p><details><summary>Produktbeschreibung anzeigen</summary><p style="white-space:pre-wrap">${h(p.vorschlag.beschreibung)}</p></details><div class="reihe"><button class="knopf klein" data-kopie="${h(p.vorschlag.meta)}">Meta kopieren</button><button class="knopf klein" data-kopie="${h(p.vorschlag.beschreibung)}">Beschreibung kopieren</button></div><p class="klein-text">In Shopify: Produkt öffnen &gt; Beschreibung bzw. „Suchmaschinen-Eintrag bearbeiten“ &gt; einfügen.</p></div>` : ''}<p class="klein-text"><a href="${h(p.url)}" target="_blank" rel="noopener">Seite öffnen</a></p></details>`).join('')}
      ${f ? `<h3>Produkt-Feeds (${f.eintraege} Einträge, täglich aktuell)</h3>
        <div class="reihe"><button class="knopf klein" data-kopie="${h(basis + f.google)}">Google-Shopping-Feed kopieren</button><button class="knopf klein" data-kopie="${h(basis + f.meta)}">Facebook/Instagram-Feed kopieren</button><button class="knopf klein" data-kopie="${h(basis + f.pinterest)}">Pinterest-Feed kopieren</button></div>` : ''}
    </section>`;
  }

  V.shopdoktor = {
    titel: 'Shop-Doktor',
    unter: 'Jeden Morgen prüft GitHub beide Live-Shops mit öffentlichen Daten: Produkte, Seiten, Ladezeit, Google-Daten, Pflichtseiten, Preisangaben und riskante Werbeaussagen. Dazu entstehen Produkt-Feeds für kostenlose Google-Shopping-Einträge, Facebook/Instagram und Pinterest.',
    zeichnen(el, app) {
      if (!geladen) laden(app);
      if (!daten || !daten.shops) {
        el.innerHTML = `<p class="klein-text">${geladen ? 'Noch kein Check gelaufen. Der Shop-Doktor läuft jeden Morgen um 6:40 Uhr (oder in GitHub unter Actions > "Shop-Doktor + Produkt-Feeds" > Run workflow).' : 'Lädt …'}</p>`;
        return;
      }
      el.innerHTML = `<p class="klein-text">Stand: ${h(ZUI.datum(String(daten.stand).slice(0, 10)))} · Punkte: 100 minus 15 je kritischem, 5 je wichtigem und 1 je Tipp-Punkt.</p>
        <section class="box" style="margin-bottom:16px"><h2>Änderungen (Preis, Bestand, neu, entfernt)</h2>
          ${(daten.aenderungen || []).length ? `<ul class="aufgaben">${daten.aenderungen.slice(0, 25).map((x) => `<li class="aufgabe" data-prio="${x.art === 'ausverkauft' || x.art === 'entfernt' ? 'hoch' : 'info'}"><span class="t">${h(x.titel)}<span class="klein-text"> · ${h(x.shop)} · ${h(x.text)} · ${h(ZUI.datum(x.datum))}</span></span></li>`).join('')}</ul>`
            : '<p class="klein-text">Noch keine Änderungen erkannt. Ab dem zweiten Lauf vergleicht der Wächter jeden Morgen mit dem Vortag.</p>'}</section>
        <div class="raster r2">${daten.shops.map((s) => shopKarte(s, daten.feeds)).join('')}</div>
        <section class="box" style="margin-top:16px"><h2>So kommst du kostenlos in Google Shopping</h2>
          <ol><li>merchants.google.com öffnen und mit deinem Google-Konto anmelden.</li><li>Shop-Domain bestätigen (Shopify: Google &amp; YouTube-App oder Meta-Tag).</li><li>Produkte &gt; Feeds &gt; Plus &gt; „Geplanter Abruf“ und den kopierten Google-Feed-Link einfügen, täglich.</li><li>Unter „Wachstum“ die kostenlosen Produkteinträge aktivieren.</li></ol>
          <p class="klein-text">Facebook/Instagram: Commerce Manager &gt; Katalog &gt; Datenquellen &gt; Datenfeed &gt; geplanter Feed. Pinterest: Business &gt; Kataloge &gt; Datenquelle hinzufügen.</p></section>`;
      el.querySelectorAll('[data-kopie]').forEach((b) => b.addEventListener('click', () => kopieren(b.dataset.kopie)));
    },
  };
})(window);
