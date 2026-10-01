// Ansichten: Kanäle (Attribution & ROAS), Preise, Konkurrenz.
(function (root) {
  const { ZA, ZUI } = root;
  const { h, eur, eur0, zahl, pct, datum, tabelle, balken, formDaten, meldung } = ZUI;
  const V = (root.ZViews = root.ZViews || {});

  const MODELLNAME = { position: 'Positions-basiert (40/20/40)', linear: 'Linear', zeitverfall: 'Zeitverfall', erster: 'Erster Kontakt', letzter: 'Letzter Kontakt' };

  V.kanaele = {
    titel: 'Kanäle',
    unter: 'Welcher Kanal bringt wirklich den Umsatz? Jede Bestellung wird auf alle Kontakte auf dem Weg zum Kauf verteilt. Mit deinen Werbekosten ergibt sich die Rendite (ROAS).',
    zeichnen(el, app) {
      const { z } = app, modell = el.dataset.modell || 'position';
      const att = ZA.attribution(z.bestellungen, modell, z.ausgaben);
      const alleKanaele = [...new Set([...att.map((a) => a.kanal), ...Object.keys(z.ausgaben)])];
      const vergleich = Object.keys(MODELLNAME).map((m) => [m, ZA.attribution(z.bestellungen, m, {})]);
      const gesamt = ZA.summe(att.map((a) => a.umsatz)) || 1;
      el.innerHTML = `
        <div class="raster r2">
          <section class="box" style="grid-column:1/-1"><h2>Umsatz und Rendite pro Kanal</h2>
            <label class="feld" style="max-width:320px;margin-bottom:12px">Zuordnungs-Modell<select id="modell">${Object.entries(MODELLNAME).map(([k, n]) => `<option value="${k}" ${k === modell ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            ${tabelle([{ t: 'Kanal' }, { t: 'Umsatz', z: 1 }, { t: 'Anteil', z: 1 }, { t: 'Bestellungen', z: 1 }, { t: 'Werbekosten', z: 1 }, { t: 'ROAS', z: 1 }],
              att.map((a) => [h(a.kanal), eur0(a.umsatz), zahl((a.umsatz / gesamt) * 100, 0) + ' %', zahl(a.bestellungen, 0), a.kosten ? eur0(a.kosten) : '<span class="leise">–</span>',
                a.roas === null ? '<span class="leise">–</span>' : `<span class="${a.roas >= 3 ? 'plus' : a.roas < 2 ? 'minus' : ''}">${zahl(a.roas, 1)}</span>`]))}
            <p class="klein-text">ROAS = Umsatz geteilt durch Werbekosten im selben Zeitraum. Ab 3 ist ein Kanal meist profitabel, unter 2 kostet er oft mehr, als er bringt.</p></section>
          <section class="box"><h2>Werbekosten pro Monat</h2>
            <form id="ausgaben" class="formular">${alleKanaele.map((k) => `<label class="feld">${h(k)}<input name="${h(k)}" type="number" min="0" step="1" inputmode="decimal" value="${h(z.ausgaben[k] ?? '')}" placeholder="0"></label>`).join('')}
              <button class="knopf haupt">Speichern</button></form></section>
          <section class="box"><h2>So unterschiedlich sehen es die Modelle</h2>
            ${tabelle([{ t: 'Kanal' }, ...vergleich.map(([m]) => ({ t: MODELLNAME[m].split(' ')[0], z: 1 }))],
              alleKanaele.filter((k) => att.some((a) => a.kanal === k)).map((k) => [h(k), ...vergleich.map(([, r]) => { const t = ZA.summe(r.map((x) => x.umsatz)) || 1, e = r.find((x) => x.kanal === k); return zahl(((e ? e.umsatz : 0) / t) * 100, 0) + ' %'; })]))}
            <p class="klein-text">„Erster Kontakt“ belohnt Kanäle, die Kunden finden (oft TikTok). „Letzter Kontakt“ belohnt Kanäle, die den Kauf abschließen (oft E-Mail).</p></section>
        </div>`;
      el.querySelector('#modell').addEventListener('change', (e) => { el.dataset.modell = e.target.value; this.zeichnen(el, app); });
      el.querySelector('#ausgaben').addEventListener('submit', (e) => {
        e.preventDefault();
        const d = formDaten(e.target);
        app.aendern((z) => { for (const [k, v] of Object.entries(d)) { if (v === '') delete z.ausgaben[k]; else z.ausgaben[k] = Math.max(0, Number(v) || 0); } }, 'Werbekosten gespeichert');
      });
    },
  };

  V.preise = {
    titel: 'Preise',
    unter: 'Gewinnstärkster Preis pro Produkt. Hast du schon einmal den Preis geändert, misst die Zentrale die Reaktion deiner Kunden. Sonst rechnet sie mit einer vorsichtigen Annahme.',
    zeichnen(el, app) {
      const { z } = app;
      const zeilen = z.produkte.map((p) => {
        const g = ZA.elastizitaetSchaetzen(z.bestellungen, p.id), e = g ? g.wert : z.einstellungen.elastizitaet;
        const emp = ZA.preisEmpfehlung(p, e), marge = p.preis ? ((p.preis - (p.kosten || 0)) / p.preis) * 100 : 0;
        let rat;
        if (g && e > -1) rat = `<span class="chip hoch">Preis erhöhen</span><div class="klein-text">Kunden reagieren kaum auf den Preis.</div>`;
        else if (emp.optimal && Math.abs(emp.optimal - p.preis) / p.preis > 0.05) rat = `<strong>${eur(emp.optimal)}</strong><div class="klein-text">Absatz ${pct(emp.mengenAenderung)} · Gewinn ${emp.gewinnAenderung === null ? '–' : pct(emp.gewinnAenderung)}</div>`;
        else rat = emp.optimal ? '<span class="chip ok">passt</span>' : `<span class="klein-text">${h(emp.hinweis || '')}</span>`;
        return [
          h(p.name),
          `<input aria-label="Preis ${h(p.name)}" data-id="${h(p.id)}" data-feld="preis" type="number" step="0.01" min="0" value="${p.preis}" style="width:90px">`,
          `<input aria-label="Einkauf ${h(p.name)}" data-id="${h(p.id)}" data-feld="kosten" type="number" step="0.01" min="0" value="${p.kosten || 0}" style="width:90px">`,
          zahl(marge, 0) + ' %',
          g ? `<span title="aus ${g.wochen} Wochen mit ${g.stufen} Preisstufen">${zahl(e, 2)} <span class="chip ok">gemessen</span></span>` : `${zahl(e, 1)} <span class="leise">angenommen</span>`,
          rat,
        ];
      });
      el.innerHTML = `
        <section class="box" style="margin-bottom:16px"><h2>Produkte</h2>
          ${tabelle([{ t: 'Produkt' }, { t: 'Preis €' }, { t: 'Einkauf €' }, { t: 'Marge', z: 1 }, { t: 'Preis-Empfindlichkeit' }, { t: 'Empfehlung' }], zeilen)}
          <div class="reihe" style="margin-top:12px"><button class="knopf haupt" id="preise-speichern">Preise speichern</button></div></section>
        <div class="raster r2">
          <section class="box"><h2>Annahme ohne Preistest</h2>
            <form id="el-form" class="reihe"><label class="feld">Preis-Empfindlichkeit (Elastizität)<input id="elast" type="number" step="0.1" max="-0.1" min="-5" value="${z.einstellungen.elastizitaet}"></label><button class="knopf">Übernehmen</button></form>
            <p class="klein-text">-1,5 heißt: 10 % teurer bringt etwa 15 % weniger Absatz. Werte zwischen -1,2 und -2,5 sind im Onlinehandel üblich.</p></section>
          <section class="box"><h2>So machst du einen Preistest</h2>
            <p class="klein-text" style="margin-top:0">Setz den Preis für 2 Wochen um 10 bis 15 % hoch, dann 2 Wochen zurück. Wiederhole das einmal. Die Zentrale erkennt die Preisstufen in deinen Bestellungen und misst die echte Reaktion. Die Empfehlung wird automatisch genauer.</p>
            <p class="klein-text">Die Empfehlung ändert den Preis pro Schritt um höchstens 20 %, damit nichts aus dem Ruder läuft.</p></section>
        </div>`;
      el.querySelector('#preise-speichern').addEventListener('click', () => {
        const werte = [...el.querySelectorAll('input[data-id]')].map((i) => [i.dataset.id, i.dataset.feld, Number(i.value)]);
        app.aendern((z) => { for (const [id, feld, v] of werte) { const p = z.produkte.find((x) => x.id === id); if (p && v >= 0) p[feld] = v; } }, 'Preise gespeichert');
      });
      el.querySelector('#el-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = Number(el.querySelector('#elast').value);
        if (!(v < 0)) { meldung('Bitte einen negativen Wert eingeben, z. B. -1,5'); return; }
        app.aendern((z) => { z.einstellungen.elastizitaet = Math.max(-5, v); }, 'Annahme übernommen');
      });
    },
  };

  V.konkurrenz = {
    titel: 'Konkurrenz',
    unter: 'Trag die Preise deiner Konkurrenten ein, wann immer du sie siehst. Die Zentrale vergleicht sie mit deinen und schlägt Alarm, wenn jemand den Preis senkt.',
    zeichnen(el, app) {
      const { z } = app, lage = app.lauf.ctx.konkurrenz;
      const LAGE = { teurer: '<span class="chip mittel">du bist teurer</span>', 'günstiger': '<span class="chip ok">du bist günstiger</span>', ok: '<span class="chip info">auf Augenhöhe</span>' };
      el.innerHTML = `
        <section class="box" style="margin-bottom:16px"><h2>Preis-Radar</h2>
          ${lage.length ? tabelle([{ t: 'Konkurrent' }, { t: 'Vergleich mit' }, { t: 'Sein Preis', z: 1 }, { t: 'Dein Preis', z: 1 }, { t: 'Lage' }, { t: 'Letzte Änderung', z: 1 }, { t: '' }],
            lage.map((k) => [
              `${h(k.name)}${k.url ? `<div class="klein-text"><a href="${h(k.url)}" target="_blank" rel="noopener">Seite öffnen</a></div>` : ''}`,
              h(k.mein ? k.mein.name : '–'),
              k.letzter ? `${eur(k.letzter.preis)}<div class="klein-text">${datum(k.letzter.datum)}</div>` : '–',
              k.mein ? eur(k.mein.preis) : '–',
              LAGE[k.lage] + (k.alarm ? ' <span class="chip hoch">Preis gesenkt</span>' : ''),
              k.aenderung === null ? '<span class="leise">–</span>' : `<span class="${k.aenderung < 0 ? 'minus' : 'plus'}">${pct(k.aenderung)}</span>`,
              `<button class="knopf klein" data-loeschen="${h(k.id)}">Entfernen</button>`,
            ])) : '<p class="klein-text">Noch keine Konkurrenten eingetragen.</p>'}</section>
        <section class="box"><h2>Preis eintragen</h2>
          <form id="kp" class="formular">
            <label class="feld">Konkurrent<input name="name" list="k-namen" required placeholder="z. B. LumiHome"><datalist id="k-namen">${z.konkurrenten.map((k) => `<option value="${h(k.name)}"></option>`).join('')}</datalist></label>
            <label class="feld">Vergleichbar mit<select name="produktId">${z.produkte.map((p) => `<option value="${h(p.id)}">${h(p.name)}</option>`).join('')}</select></label>
            <label class="feld">Preis €<input name="preis" type="number" step="0.01" min="0" required></label>
            <label class="feld">Datum<input name="datum" type="date" value="${app.heute()}" required></label>
            <label class="feld">Link (optional)<input name="url" type="url" placeholder="https://"></label>
            <button class="knopf haupt">Eintragen</button>
          </form>
          <p class="klein-text">Automatisches Auslesen fremder Shops ist im Browser nicht möglich, weil die Shops das blockieren. Ein Eintrag dauert 10 Sekunden. Einmal pro Woche reicht.</p></section>`;
      el.querySelector('#kp').addEventListener('submit', (e) => {
        e.preventDefault();
        const d = formDaten(e.target), preis = Number(d.preis);
        if (!d.name || !(preis > 0)) { meldung('Name und Preis ausfüllen'); return; }
        app.aendern((z) => {
          let k = z.konkurrenten.find((x) => x.name.toLowerCase() === d.name.toLowerCase() && x.produktId === d.produktId);
          if (!k) { k = { id: 'k' + Date.now(), name: d.name, produktId: d.produktId, url: '', preise: [] }; z.konkurrenten.push(k); }
          if (d.url && /^https?:\/\//i.test(d.url)) k.url = d.url;
          k.preise.push({ datum: d.datum, preis });
        }, 'Preis eingetragen');
      });
      el.querySelectorAll('[data-loeschen]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.loeschen;
        app.aendern((z) => { z.konkurrenten = z.konkurrenten.filter((k) => k.id !== id); }, 'Entfernt');
      }));
    },
  };
})(window);
