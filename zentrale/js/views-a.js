// Ansichten: Übersicht, Agenten-Team, Empfehlungen & Bundles, Kunden.
(function (root) {
  const { ZA, ZUI, ZKI } = root;
  const { h, eur, eur0, zahl, pct, datum, aufgabenListe, tabelle, balken, umsatzDiagramm } = ZUI;
  const V = (root.ZViews = root.ZViews || {});

  function delta(jetzt, vorher, invers) {
    if (!vorher) return '<div class="d leise">kein Vergleich</div>';
    const d = ((jetzt - vorher) / vorher) * 100, gut = invers ? d < 0 : d > 0;
    return `<div class="d ${gut ? 'plus' : 'minus'}">${pct(d)} <span class="leise">vs. 28 T davor</span></div>`;
  }

  V.uebersicht = {
    titel: 'Übersicht',
    unter: 'Alles Wichtige der letzten 28 Tage, die Prognose und was die Agenten heute für dich erledigt haben wollen.',
    zeichnen(el, app) {
      const { z, lauf } = app, c = lauf.ctx, heute = c.heute;
      const k = ZA.kennzahlen(ZA.imZeitraum(z.bestellungen, heute, 28), z.produkte);
      const v = ZA.kennzahlen(ZA.imZeitraum(z.bestellungen, ZA.datumAus(ZA.tagZahl(heute) - 28), 28), z.produkte);
      const p = c.prognose, vier = ZA.summe(p.punkte.slice(0, 4).map((x) => x.wert));
      const umsatzProProdukt = {};
      for (const b of ZA.imZeitraum(z.bestellungen, heute, 90)) for (const a of b.artikel) umsatzProProdukt[a.p] = (umsatzProProdukt[a.p] || 0) + a.menge * a.preis;
      const pid = ZA.nachId(z.produkte);
      const top = Object.entries(umsatzProProdukt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, w]) => ({ name: (pid[id] && pid[id].name) || id, wert: w }));
      const dringend = lauf.aufgaben.filter((a) => a.prio === 'hoch');
      el.innerHTML = `
        <div class="kpis">
          <div class="kpi"><div class="l">Umsatz</div><div class="w">${eur0(k.umsatz)}</div>${delta(k.umsatz, v.umsatz)}</div>
          <div class="kpi"><div class="l">Bestellungen</div><div class="w">${zahl(k.bestellungen)}</div>${delta(k.bestellungen, v.bestellungen)}</div>
          <div class="kpi"><div class="l">Warenkorb</div><div class="w">${eur(k.warenkorb)}</div>${delta(k.warenkorb, v.warenkorb)}</div>
          ${z.produkte.some((p) => p.kosten > 0) ? `<div class="kpi"><div class="l">Rohertrag</div><div class="w">${eur0(k.rohertrag)}</div><div class="d leise">Marge ${zahl(k.margeProzent, 1)} %</div></div>` : `<div class="kpi"><div class="l">Rohertrag</div><div class="w">–</div><div class="d"><button class="knopf klein" data-gehe="preise">Einkaufspreise eintragen</button></div></div>`}
          <div class="kpi"><div class="l">Prognose 4 Wochen</div><div class="w">${eur0(vier)}</div><div class="d ${p.trendProWoche >= 0 ? 'plus' : 'minus'}">${p.trendProWoche >= 0 ? '+' : ''}${eur0(p.trendProWoche)} je Woche</div></div>
        </div>
        <div class="raster r2">
          <section class="box" style="grid-column: 1 / -1"><h2>Umsatz pro Woche und Prognose für 8 Wochen</h2>${umsatzDiagramm(c.reihe, p)}
            <p class="klein-text">Trendlinie über ${c.reihe.length} abgeschlossene Wochen, R² ${zahl(p.r2, 2)}. Die Spanne zeigt, wo der Umsatz mit 80 % Wahrscheinlichkeit landet.</p></section>
          <section class="box"><h2>Dringend (${dringend.length})</h2>${aufgabenListe(dringend.slice(0, 6))}
            <div class="reihe" style="margin-top:10px"><button class="knopf" data-gehe="agenten">Alle ${lauf.aufgaben.length} Punkte ansehen</button></div></section>
          <section class="box"><h2>Bestseller, 90 Tage</h2>${top.length ? balken(top, (w) => eur0(w)) : '<p class="klein-text">Noch keine Verkäufe.</p>'}</section>
        </div>`;
    },
  };

  V.agenten = {
    titel: 'Agenten-Team',
    unter: 'Acht Agenten prüfen bei jedem Öffnen und nach jeder Änderung deine Daten. Der Strategie-Agent macht daraus einen Wochenplan.',
    zeichnen(el, app) {
      const { lauf } = app;
      el.innerHTML = `
        <section class="box" style="margin-bottom:16px"><h2>Strategie-Agent</h2>
          <p class="klein-text" style="margin-top:0">Fasst alle ${lauf.aufgaben.length} Punkte zu einem Plan für Montag bis Freitag zusammen. Nutzt die kostenlose KI. Ist sie nicht erreichbar, plant er nach Dringlichkeit.</p>
          <div class="reihe"><button class="knopf haupt" id="plan-los">Wochenplan erstellen</button><button class="knopf" id="plan-kopie" hidden>Plan kopieren</button></div>
          <div class="ki-text" id="plan" style="margin-top:12px"></div></section>
        <div class="agenten">${lauf.berichte.map((b) => `
          <section class="box agent"><div class="kopfzeile"><span class="puls" aria-hidden="true"></span><h3>${h(b.name)}</h3></div>
            <p>${h(b.aufgabe)}</p>${aufgabenListe(b.funde, false)}</section>`).join('')}</div>`;
      const knopf = el.querySelector('#plan-los'), ziel = el.querySelector('#plan'), kopie = el.querySelector('#plan-kopie');
      knopf.addEventListener('click', async () => {
        knopf.disabled = true; knopf.textContent = 'Plant …';
        const liste = lauf.aufgaben.map((a) => `- [${a.prio}] ${a.titel}: ${a.text}`).join('\n');
        try {
          const r = await ZKI.frage('Du bist ein erfahrener E-Commerce-Stratege. Antworte auf Deutsch, knapp, ohne Markdown-Überschriften, ohne Emojis.',
            [{ role: 'user', content: `Hier sind die Ergebnisse meiner Analyse-Agenten für meinen Online-Shop:\n${liste}\n\nMach daraus einen konkreten Plan für Montag bis Freitag. Pro Tag 2 bis 3 Aufgaben, die dringendsten zuerst. Zu jeder Aufgabe ein Satz, wie genau ich sie umsetze. Am Ende eine Zeile: Was bringt das voraussichtlich.` }], 900);
          ziel.textContent = r.text + `\n\n(erstellt mit ${r.dienst})`;
        } catch (e) {
          const tage = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'], plan = lauf.aufgaben.filter((a) => a.prio !== 'info');
          ziel.textContent = tage.map((t, i) => `${t}\n` + (plan.slice(i * 2, i * 2 + 2).map((a) => `  • ${a.titel}\n    ${a.text}`).join('\n') || '  • Ergebnisse der Woche prüfen')).join('\n\n') + '\n\n(Ohne KI erstellt: kostenlose KI gerade nicht erreichbar.)';
        }
        knopf.disabled = false; knopf.textContent = 'Neu planen'; kopie.hidden = false;
      });
      kopie.addEventListener('click', () => ZUI.kopieren(ziel.textContent));
    },
  };

  V.empfehlungen = {
    titel: 'Empfehlungen & Bundles',
    unter: 'Aus deinen echten Warenkörben: was zusammen gekauft wird, was du im Warenkorb vorschlagen solltest und welche Bundles sich lohnen.',
    zeichnen(el, app) {
      const { z, lauf } = app, c = lauf.ctx, pid = ZA.nachId(z.produkte);
      const name = (id) => h((pid[id] && pid[id].name) || id);
      const wahl = el.dataset.produkt || (z.produkte[0] && z.produkte[0].id);
      const emp = wahl ? ZA.empfehlungenFuer(wahl, c.analyse, 4) : [];
      const rabatt = z.einstellungen.rabatt || 12;
      el.innerHTML = `
        <div class="raster r2">
          <section class="box"><h2>„Kunden kauften auch“</h2>
            <label class="feld">Produkt<select id="emp-produkt">${z.produkte.map((p) => `<option value="${h(p.id)}" ${p.id === wahl ? 'selected' : ''}>${h(p.name)}</option>`).join('')}</select></label>
            <div style="margin-top:12px">${emp.length ? tabelle([{ t: 'Vorschlagen' }, { t: 'Trefferquote', z: 1 }, { t: 'Lift', z: 1 }],
              emp.map((e) => [name(e.produkt), zahl(e.konfidenz * 100, 0) + ' %', zahl(e.lift, 1) + '×'])) : '<p class="klein-text">Für dieses Produkt gibt es noch keine wiederholten Kombi-Käufe.</p>'}</div>
            <p class="klein-text">Trefferquote: So viele Käufer dieses Produkts nehmen den Vorschlag mit. Lift über 1 heißt, die Kombination ist kein Zufall.</p></section>
          <section class="box"><h2>Bundle-Vorschläge</h2>
            <form id="rabatt-form" class="reihe" style="margin-bottom:10px"><label class="feld" style="flex-direction:row;align-items:center;gap:8px">Bundle-Rabatt <input id="rabatt" name="rabatt" type="number" min="0" max="50" value="${h(rabatt)}" style="width:70px"> %</label><button class="knopf klein">Neu rechnen</button></form>
            ${c.bundles.length ? tabelle([{ t: 'Bundle' }, { t: 'Preis', z: 1 }, { t: 'statt', z: 1 }, { t: 'Marge', z: 1 }],
              c.bundles.map((b) => [`${h(b.a.name)} + ${h(b.b.name)}<div class="klein-text">${b.anzahl}× zusammen gekauft · Lift ${zahl(b.lift, 1)}</div>`, eur(b.preis), `<span class="leise">${eur(b.einzeln)}</span>`, zahl(b.margeProzent, 0) + ' %'])) : '<p class="klein-text">Noch keine Paare mit mindestens 3 gemeinsamen Käufen.</p>'}</section>
          <section class="box" style="grid-column:1/-1"><h2>Alle Kauf-Paare</h2>
            ${tabelle([{ t: 'Produkt A' }, { t: 'Produkt B' }, { t: 'Zusammen', z: 1 }, { t: 'A → B', z: 1 }, { t: 'B → A', z: 1 }, { t: 'Lift', z: 1 }],
              c.analyse.paare.slice(0, 12).map((p) => [name(p.a), name(p.b), zahl(p.anzahl), zahl(p.konfAB * 100, 0) + ' %', zahl(p.konfBA * 100, 0) + ' %', zahl(p.lift, 2)]))}</section>
        </div>`;
      el.querySelector('#emp-produkt').addEventListener('change', (e) => { el.dataset.produkt = e.target.value; this.zeichnen(el, app); });
      el.querySelector('#rabatt-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const r = Math.min(50, Math.max(0, Number(el.querySelector('#rabatt').value) || 0));
        app.aendern((z) => { z.einstellungen.rabatt = r; }, 'Bundles neu berechnet');
      });
    },
  };

  const SEG_FARBE = { Champions: '#4fd68f', Treu: '#5fd8ff', Neu: '#8fb8ff', Gelegentlich: '#7d97a3', Gefährdet: '#ff6475', 'Schläft ein': '#f2b154', Verloren: '#5a6b73' };
  const SEG_TEXT = {
    Champions: 'Kaufen oft und kürzlich. Bitte um Bewertungen und Empfehlungen.',
    Treu: 'Mehrfachkäufer, noch aktiv. Mit Neuheiten und Treue-Vorteilen halten.',
    Neu: 'Erster Kauf vor Kurzem. Den zweiten Kauf anstoßen.',
    Gelegentlich: 'Ein Kauf, eine Weile her. Mit Angeboten erinnern.',
    Gefährdet: 'Waren Stammkunden, sind aber überfällig. Jetzt zurückholen.',
    'Schläft ein': 'Ein Kauf, länger her. Mit einem starken Angebot wecken.',
    Verloren: 'Lange inaktiv. Nur noch mit günstigen Kanälen ansprechen.',
  };

  V.kunden = {
    titel: 'Kunden',
    unter: 'Jeder Kunde wird nach Aktualität, Häufigkeit und Umsatz eingestuft. Daraus folgen Abwanderungsrisiko und der erwartete Wert der nächsten 12 Monate.',
    zeichnen(el, app) {
      const ka = app.lauf.ctx.kunden;
      const gef = ka.kunden.filter((k) => k.segment === 'Gefährdet').sort((a, b) => b.umsatz - a.umsatz);
      const top = [...ka.kunden].sort((a, b) => b.wert12m - a.wert12m).slice(0, 10);
      el.innerHTML = `
        <div class="raster r2">
          <section class="box"><h2>Segmente nach Umsatz</h2>${balken(ka.segmente.map((s) => ({ name: s.segment, wert: s.umsatz, farbe: SEG_FARBE[s.segment], kunden: s.kunden })), (w, e) => `${eur0(w)} · ${zahl(e.kunden)} Kunden`)}
            <p class="klein-text">Typischer Abstand zwischen zwei Käufen: ${zahl(ka.typAbstand, 0)} Tage.</p></section>
          <section class="box"><h2>Was tun pro Segment</h2>${tabelle([{ t: 'Segment' }, { t: 'Maßnahme' }], ka.segmente.map((s) => [`<span class="chip" style="color:${SEG_FARBE[s.segment]}">${h(s.segment)}</span>`, h(SEG_TEXT[s.segment] || '')]))}</section>
          <section class="box" style="grid-column:1/-1"><h2>Rückhol-Liste: ${gef.length} gefährdete Stammkunden</h2>
            <div class="reihe" style="margin-bottom:10px"><button class="knopf" id="ids-kopie">Kunden-IDs kopieren</button><button class="knopf haupt" id="mail-los">Rückhol-Mail schreiben</button></div>
            <div class="ki-text" id="mail" style="margin-bottom:12px"></div>
            ${gef.length ? tabelle([{ t: 'Kunde' }, { t: 'Käufe', z: 1 }, { t: 'Umsatz', z: 1 }, { t: 'Letzter Kauf', z: 1 }, { t: 'Überfällig', z: 1 }],
              gef.slice(0, 25).map((k) => [h(k.kunde), zahl(k.anzahl), eur(k.umsatz), datum(k.letzterKauf), `<span class="minus">${zahl(k.risiko, 1)}×</span>`])) : '<p class="klein-text">Niemand gefährdet. Stark.</p>'}
            <p class="klein-text">„Überfällig 2×“ heißt: Der Kunde wartet schon doppelt so lange wie sonst zwischen zwei Käufen.</p></section>
          <section class="box" style="grid-column:1/-1"><h2>Wertvollste Kunden, nächste 12 Monate</h2>
            ${tabelle([{ t: 'Kunde' }, { t: 'Segment' }, { t: 'Käufe', z: 1 }, { t: 'Umsatz bisher', z: 1 }, { t: 'Erwartet 12 M.', z: 1 }],
              top.map((k) => [h(k.kunde), `<span class="chip" style="color:${SEG_FARBE[k.segment]}">${h(k.segment)}</span>`, zahl(k.anzahl), eur(k.umsatz), eur(k.wert12m)]))}</section>
        </div>`;
      el.querySelector('#ids-kopie').addEventListener('click', () => ZUI.kopieren(gef.map((k) => k.kunde).join('\n')));
      const knopf = el.querySelector('#mail-los'), out = el.querySelector('#mail');
      knopf.addEventListener('click', async () => {
        knopf.disabled = true; knopf.textContent = 'Schreibt …';
        const shop = app.z.einstellungen.shopName || 'unser Shop';
        try {
          const r = await ZKI.frage('Du schreibst kurze, persönliche Marketing-Mails auf Deutsch. Duzen. Keine Emojis, kein Markdown.',
            [{ role: 'user', content: `Schreib eine Rückhol-Mail für Stammkunden von „${shop}“, die seit einiger Zeit nichts mehr gekauft haben. Mit Betreffzeile, Code COMEBACK10 für 10 % Rabatt, gültig 7 Tage. Platzhalter {Vorname}. Maximal 90 Wörter.` }], 400);
          out.textContent = r.text;
        } catch (e) {
          out.textContent = `Betreff: {Vorname}, wir haben dich vermisst\n\nHey {Vorname},\n\nschon eine Weile her seit deiner letzten Bestellung bei ${shop}. Wir haben einiges Neues, das dir gefallen dürfte.\n\nAls Dankeschön für deine Treue bekommst du 10 % auf alles mit dem Code COMEBACK10. Gilt 7 Tage.\n\nBis gleich im Shop!\n\n(Vorlage ohne KI: kostenlose KI gerade nicht erreichbar.)`;
        }
        knopf.disabled = false; knopf.textContent = 'Neue Version';
      });
    },
  };
})(window);
