// Ansicht: Werbe-Labor (automatische Tagesergebnisse + eigener Test).
(function (root) {
  const { ZUI, ZKI, ZLabor, ZA } = root;
  const { h, zahl, eur, meldung, kopieren } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  let auto = null, autoGeladen = false, eigenes = null;

  function jsonAus(text) {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('kein JSON');
    return JSON.parse(text.slice(a, b + 1));
  }
  const kiJson = async (prompt, maxTokens) => jsonAus((await ZKI.frage('Du antwortest ausschließlich mit gültigem JSON.', [{ role: 'user', content: prompt }], maxTokens)).text);

  function ergebnisKarte(e, mitBild) {
    const g = e.gewinner, max = Math.max(...e.ergebnisse.map((x) => x.punkte), 1);
    return `<section class="box labor">
      <div class="labor-kopf">${mitBild && e.bild ? `<img src="${h(e.bild)}" alt="" loading="lazy">` : ''}<div><h3>${h(e.produkt)}</h3>
        <p class="klein-text">${e.shop ? h(e.shop) + ' · ' : ''}${e.preis ? eur(e.preis) + ' · ' : ''}getestet ${h(ZUI.datum(String(e.erstellt).slice(0, 10)))}</p></div></div>
      <p class="sieger-hook">„${h(e.final.hook)}“</p>
      <div class="reihe"><span class="chip ok">${h(g.winkel)}</span><span class="chip info">${zahl(g.punkte, 1)} / 10 Kaufabsicht</span>${g.kaeufer !== null ? `<span class="chip mittel">${g.kaeufer} von 100 würden kaufen</span>` : ''}<span class="chip">${g.quelle === 'Jury' ? 'Test-Jury' : 'Regel-Bewertung'}</span></div>
      ${e.einwand ? `<p class="klein-text"><strong>Größter Einwand</strong> (${h(e.einwand.von)}): „${h(e.einwand.text)}“${e.final.antwort ? `<br><strong>Antwort in Szene 2:</strong> „${h(e.final.antwort)}“` : ''}</p>` : ''}
      <details><summary>Alle ${e.ergebnisse.length} Hooks im Vergleich</summary>
        <div class="balken" style="margin-top:10px">${e.ergebnisse.map((x) => `<div class="zeile"><span title="${h(x.winkel)}">${h(x.winkel)}</span><span class="spur"><span class="fuell" style="width:${((x.punkte / max) * 100).toFixed(1)}%"></span></span><span class="wert">${zahl(x.punkte, 1)}</span></div><p class="klein-text" style="margin:-4px 0 4px">„${h(x.hook)}“</p>`).join('')}</div></details>
      <div class="reihe" style="margin-top:10px"><button class="knopf klein" data-kopie="${h(e.final.hook)}">Hook kopieren</button><button class="knopf klein" data-einplanen="${h(e.final.hook)}">In Content-Plan</button></div>
    </section>`;
  }

  async function autoLaden(app) {
    autoGeladen = true;
    try { const r = await fetch('daten/werbe-labor.json', { cache: 'no-store' }); auto = r.ok ? await r.json() : null; } catch (e) { auto = null; }
    if (app.aktiv === 'labor') app.zeichnen();
  }

  V.labor = {
    titel: 'Werbe-Labor',
    unter: 'Jeden Morgen testet das Labor 8 Hooks pro Produkt an einer simulierten Test-Jury aus 10 Käufer-Typen (100 Personen) und gibt den Gewinner an die Video-Fabrik. Die Jury ist ein interner Test, keine echten Kunden.',
    zeichnen(el, app) {
      if (!autoGeladen) autoLaden(app);
      const liste = auto && auto.produkte ? Object.values(auto.produkte).sort((a, b) => (a.erstellt < b.erstellt ? 1 : -1)) : [];
      el.innerHTML = `
        <section class="box" style="margin-bottom:16px"><h2>Selbst testen</h2>
          <form id="lab-form" class="formular">
            <label class="feld" style="grid-column:1/-1">Produkt<select id="lab-produkt"><option value="">Eigenes Produkt eingeben …</option>${app.z.produkte.map((p) => `<option value="${h(p.id)}">${h(p.name)}</option>`).join('')}</select></label>
            <label class="feld">Name<input id="lab-name" placeholder="z. B. LED-Lichtleiste 5 m"></label>
            <label class="feld">Preis €<input id="lab-preis" type="number" step="0.01" min="0"></label>
            <label class="feld" style="grid-column:1/-1">Was kann das Produkt? (je genauer, desto besser)<textarea id="lab-info" rows="2" placeholder="z. B. App-Steuerung, 16 Mio. Farben, kürzbar, Musik-Sync"></textarea></label>
            <button class="knopf haupt" id="lab-los">Labor starten</button>
          </form>
          <p class="klein-text">Dauert 30 bis 90 Sekunden (3 KI-Runden: Hooks, Jury, Nachschärfen). Ist die KI nicht erreichbar, bewertet das Labor nach festen Werberegeln.</p>
          <div id="lab-eigen">${eigenes ? ergebnisKarte(eigenes, false) : ''}</div></section>
        <h2>Automatisch getestet${auto && auto.stand ? ` · Stand ${h(ZUI.datum(String(auto.stand).slice(0, 10)))}` : ''}</h2>
        ${liste.length ? `<div class="raster r2">${liste.map((e) => ergebnisKarte(e, true)).join('')}</div>`
          : `<p class="klein-text">${autoGeladen && auto === null ? 'Noch keine automatischen Ergebnisse. Der Labor-Lauf startet jeden Morgen gegen 5:50 Uhr vor der Video-Fabrik.' : 'Lädt …'}</p>`}`;

      const sel = el.querySelector('#lab-produkt');
      sel.addEventListener('change', () => {
        const p = app.z.produkte.find((x) => x.id === sel.value);
        el.querySelector('#lab-name').value = p ? p.name : '';
        el.querySelector('#lab-preis').value = p ? p.preis : '';
        el.querySelector('#lab-info').value = p && p.info ? p.info : '';
      });
      el.querySelector('#lab-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = el.querySelector('#lab-name').value.trim();
        if (!name) { meldung('Erst ein Produkt wählen oder einen Namen eingeben'); return; }
        const knopf = el.querySelector('#lab-los'); knopf.disabled = true; knopf.textContent = 'Labor läuft …';
        const ziel = el.querySelector('#lab-eigen'); ziel.innerHTML = '<p class="klein-text">Runde 1: Hooks entwerfen … Runde 2: Test-Jury … Runde 3: Nachschärfen …</p>';
        const p = { title: name, preis: Number(el.querySelector('#lab-preis').value) || null, info: el.querySelector('#lab-info').value.trim() };
        try { eigenes = await ZLabor.labor(p, kiJson); } catch (err) { meldung('Labor fehlgeschlagen: ' + err.message); }
        this.zeichnen(el, app);
      });
      el.querySelectorAll('[data-kopie]').forEach((b) => b.addEventListener('click', () => kopieren(b.dataset.kopie)));
      el.querySelectorAll('[data-einplanen]').forEach((b) => b.addEventListener('click', () => app.aendern((z) => {
        z.plan.push({ id: 'lab' + Date.now(), datum: ZA.datumAus(ZA.tagZahl(app.heute()) + 1), plattform: 'TikTok', text: b.dataset.einplanen, status: 'geplant' });
      }, 'Für morgen eingeplant')));
    },
  };
})(window);
