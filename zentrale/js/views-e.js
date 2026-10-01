// Ansicht: Heute (Startseite des Autopiloten).
(function (root) {
  const { ZUI, ZAutopilot } = root;
  const { h, eur0, pct, chip } = ZUI;
  const V = (root.ZViews = root.ZViews || {});

  function gruss() {
    const s = new Date().getHours();
    return s < 11 ? 'Guten Morgen' : s < 18 ? 'Hallo' : 'Guten Abend';
  }

  V.heute = {
    titel: 'Heute',
    unter: 'Der Autopilot läuft bei jedem Öffnen von selbst: Er prüft alles, erledigt die Vorarbeit und sagt dir, was du heute tun solltest.',
    zeichnen(el, app) {
      const { z, lauf } = app, heute = app.heute(), ap = ZAutopilot.standard(z);
      const erledigt = new Set(ap.erledigt[heute] || []);
      const todo = lauf.aufgaben.filter((a) => a.prio !== 'info').slice(0, 6);
      const fertig = todo.filter((a) => erledigt.has(a.titel)).length;
      const v = ZAutopilot.vergleich(z, heute);
      const datumLang = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
      const plan = ap.plan && ap.plan.datum === heute ? ap.plan : null;
      const live = z.live;

      el.innerHTML = `
        <p class="gruss">${gruss()}! Heute ist ${h(datumLang)}.</p>
        <div class="raster r2">
          <section class="box betont" style="grid-column:1/-1"><h2>Was du heute tun solltest</h2>
            <div class="ki-text plan-text" id="tagesplan">${plan ? h(plan.text) : 'Dein Assistent denkt nach …'}</div>
            ${plan ? `<p class="klein-text">Quelle: ${h(plan.quelle)}</p>` : ''}</section>
          <section class="box"><h2>Heute abhaken · ${fertig} von ${todo.length}</h2>
            <div class="fortschritt" role="progressbar" aria-valuemin="0" aria-valuemax="${todo.length}" aria-valuenow="${fertig}"><span style="width:${todo.length ? (fertig / todo.length) * 100 : 0}%"></span></div>
            ${todo.length ? `<ul class="checkliste">${todo.map((a, i) => `<li><input type="checkbox" id="cb${i}" data-titel="${h(a.titel)}" ${erledigt.has(a.titel) ? 'checked' : ''}><label for="cb${i}"><span class="t">${h(a.titel)}</span><span class="klein-text">${h(a.text)}</span></label>${chip(a.prio)}</li>`).join('')}</ul>` : '<p class="klein-text">Nichts offen. Stark!</p>'}
            ${fertig && fertig === todo.length ? '<p class="plus">Alles erledigt für heute.</p>' : ''}</section>
          <section class="box"><h2>Schon erledigt vom Autopiloten</h2>
            <ul class="aufgaben">${(ap.aktionen || []).map((a) => `<li class="aufgabe" data-prio="info"><span class="t">${h(a.text)}</span><button class="knopf klein" data-gehe="${h(a.ziel)}">Ansehen</button></li>`).join('') || '<li class="klein-text">Der Autopilot läuft beim nächsten Öffnen.</li>'}</ul>
            <p class="klein-text">Letzter Lauf: ${ap.letzterLauf ? h(ZUI.datum(ap.letzterLauf)) : 'noch nie'}</p></section>
          <section class="box"><h2>Seit dem letzten Mal</h2>
            ${v ? `<div class="kpis" style="margin-bottom:12px">
                <div class="kpi"><div class="l">Umsatz 28 Tage</div><div class="w">${eur0(v.jetzt.umsatz28)}</div><div class="d ${v.jetzt.umsatz28 >= v.vorher.umsatz28 ? 'plus' : 'minus'}">${v.vorher.umsatz28 ? pct(((v.jetzt.umsatz28 - v.vorher.umsatz28) / v.vorher.umsatz28) * 100) : '–'} seit ${h(ZUI.datum(v.vorher.datum))}</div></div>
                <div class="kpi"><div class="l">Dringend</div><div class="w">${v.jetzt.dringend}</div><div class="d leise">vorher ${v.vorher.dringend}</div></div></div>
              ${v.neueDringend.length ? `<p><strong>Neu dringend:</strong></p><ul>${v.neueDringend.map((t) => `<li>${h(t)}</li>`).join('')}</ul>` : ''}
              ${v.geloest.length ? `<p class="plus"><strong>Erledigt oder gelöst:</strong></p><ul>${v.geloest.map((t) => `<li>${h(t)}</li>`).join('')}</ul>` : ''}
              ${!v.neueDringend.length && !v.geloest.length ? '<p class="klein-text">Keine neuen dringenden Punkte.</p>' : ''}`
            : '<p class="klein-text">Ab deinem nächsten Besuch an einem anderen Tag siehst du hier, was sich verändert hat.</p>'}</section>
          <section class="box"><h2>Datenquelle</h2>
            ${!live && app.livePaket ? '<p><span class="chip mittel">Bereit</span> Deine Live-Daten liegen verschlüsselt bereit. Gib unter „Daten“ einmal dein Passwort ein.</p>' : ''}
            ${live ? `<p><span class="chip ok">Live</span> Shopify-Daten vom ${h(ZUI.datum(live.stand))}, automatisch geholt.</p>`
              : z.beispiel ? '<p><span class="chip mittel">Beispiel</span> Noch keine echten Daten. Der Autopilot rechnet mit einem erfundenen Shop.</p>'
              : z.shopModus ? `<p><span class="chip ok">Shops</span> ${z.produkte.filter((p) => p.ausShop).length} echte Produkte aus DeskRebel und Purivelle, jeden Morgen automatisch aktualisiert. ${z.bestellungen.length ? `${z.bestellungen.length} Bestellungen hochgeladen.` : 'Noch keine Bestellungen.'}</p>`
              : '<p><span class="chip info">Import</span> Deine hochgeladenen Daten.</p>'}
            <p class="klein-text">Damit der Autopilot deine Bestellungen jeden Morgen selbst holt, muss dein Shop einmalig mit GitHub verbunden sein. Wie das geht, steht unter „Daten“.</p>
            <div class="reihe"><button class="knopf" data-gehe="daten">Zu den Daten</button></div></section>
          <section class="box"><h2>Autopilot-Einstellungen</h2>
            <label class="schalter"><input type="checkbox" id="ap-an" ${ap.an ? 'checked' : ''}> Autopilot beim Öffnen ausführen</label>
            <label class="schalter"><input type="checkbox" id="ap-content" ${ap.contentAuffuellen ? 'checked' : ''}> Content-Plan automatisch auf 5 Posts pro Woche auffüllen</label>
            <div class="reihe" style="margin-top:10px"><button class="knopf" id="ap-jetzt">Jetzt neu laufen lassen</button></div></section>
        </div>`;

      el.querySelectorAll('.checkliste input').forEach((cb) => cb.addEventListener('change', () => {
        app.aendern((z) => {
          const liste = new Set(z.autopilot.erledigt[heute] || []);
          if (cb.checked) liste.add(cb.dataset.titel); else liste.delete(cb.dataset.titel);
          z.autopilot.erledigt = { [heute]: [...liste] };
        }, cb.checked ? 'Abgehakt' : 'Wieder offen');
      }));
      el.querySelector('#ap-an').addEventListener('change', (e) => app.aendern((z) => { z.autopilot.an = e.target.checked; }, e.target.checked ? 'Autopilot an' : 'Autopilot aus'));
      el.querySelector('#ap-content').addEventListener('change', (e) => app.aendern((z) => { z.autopilot.contentAuffuellen = e.target.checked; }, 'Gespeichert'));
      el.querySelector('#ap-jetzt').addEventListener('click', () => { app.z.autopilot.letzterLauf = null; app.z.autopilot.plan = null; app.autopilotStarten('Autopilot ist neu gelaufen'); });
    },
  };
})(window);
