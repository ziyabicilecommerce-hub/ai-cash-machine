// Ansicht: Engpass & Agenten - das echte Agenten-Fliessband (taeglich von GitHub gemessen) und die
// Engpass-Werkstatt nach NEULAND OS zum Durchrechnen eigener Ablaeufe (z. B. Packen, Versand, Support).
(function (root) {
  const { ZUI, ZEngpass } = root;
  const { h, zahl, meldung } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  let daten = null, geladen = false;
  const SPEICHER = 'zentrale-engpass-werkstatt';
  const BEISPIEL = { auftraege: 45, schritte: [
    { id: 'packen', name: 'Packen', verfuegbar: 60, jeAuftrag: 1 },
    { id: 'pruefen', name: 'Prüfen & Etikett', verfuegbar: 40, jeAuftrag: 2 },
    { id: 'versand', name: 'Übergabe Versand', verfuegbar: 30, jeAuftrag: 0.75 },
  ], verschiebung: { von: 'packen', nach: 'pruefen', menge: 12 } };
  const ladenLokal = () => { try { return JSON.parse(localStorage.getItem(SPEICHER)) || null; } catch (e) { return null; } };
  const speichernLokal = (a) => { try { localStorage.setItem(SPEICHER, JSON.stringify(a)); } catch (e) { /* nur dieses Fenster */ } };
  let ablauf = null;

  let system = null;
  async function laden(app) {
    geladen = true;
    try { const r = await fetch('daten/engpass.json', { cache: 'no-store' }); daten = r.ok ? await r.json() : null; } catch (e) { daten = null; }
    try { const r = await fetch('daten/system.json', { cache: 'no-store' }); system = r.ok ? await r.json() : null; } catch (e) { system = null; }
    if (app.aktiv === 'fliessband') app.zeichnen();
  }

  const FARBE = { engpass: 'hoch', wartet: 'info', laeuft: 'ok' };
  const TEXT = { engpass: 'Engpass', wartet: 'wartet', laeuft: 'läuft' };

  function fliessband() {
    if (!daten) return `<p class="klein-text">${geladen ? 'Der Engpass-Chef läuft jeden Morgen um 5:35 Uhr auf GitHub (Actions > „Engpass-Chef“ > Run workflow startet ihn sofort).' : 'Lädt …'}</p>`;
    const max = Math.max(1, daten.ziel, ...daten.agenten.map((a) => a.leistung));
    return `<section class="box betont" style="margin-bottom:16px"><h2>Engpass heute: ${h(daten.engpass.name)}</h2>
        <p>${h(daten.grund)}</p>
        <div class="reihe"><span class="chip info">Plan: Fabrik ${daten.plan.fabrikAnzahl} Videos · Labor ${daten.plan.laborAnzahl} Produkte</span><span class="chip">KI-Anfragen ${daten.kiAnfragen.vorher} → ${daten.kiAnfragen.nachher}</span><span class="chip">Ziel ${daten.ziel}/Tag · Durchsatz ${daten.durchsatz}</span></div>
        ${daten.aufgabe ? `<div class="hinweis" style="margin-top:12px"><span><strong>Deine eine Aufgabe:</strong> ${h(daten.aufgabe.titel)} – ${h(daten.aufgabe.text)}</span><button class="knopf klein" data-gehe="${h(daten.aufgabe.ziel)}">Los</button></div>` : '<p class="plus">Keine Aufgabe für dich – die Agenten laufen.</p>'}
        <p class="klein-text">Stand ${h(ZUI.datum(String(daten.stand).slice(0, 10)))} · gemessen aus den echten Läufen der letzten 7 Tage.</p></section>
      <section class="box"><h2>Agenten-Fließband (Leistung pro Tag)</h2>
        <div class="balken">${daten.agenten.map((a) => `<div class="zeile"><span title="${h(a.job)}">${h(a.name)}</span><span class="spur"><span class="fuell" style="width:${((a.leistung / max) * 100).toFixed(1)}%"></span></span><span class="wert">${zahl(a.leistung, 1)}</span></div><p class="klein-text" style="margin:-4px 0 6px">${h(a.job)} · <span class="chip ${FARBE[a.status]}">${TEXT[a.status]}</span></p>`).join('')}</div>
        <p class="klein-text">Kanäle mit Posts: ${daten.kanaele.length ? daten.kanaele.map(h).join(', ') : 'noch keiner'}${daten.laborQuote !== null ? ` · Labor-Jury-Quote ${daten.laborQuote} %` : ''}</p></section>`;
  }

  function werkstatt() {
    let r = null, fehler = '';
    try { r = ZEngpass.analyse(ablauf); } catch (e) { fehler = e.message; }
    const max = r ? Math.max(1, ...r.vorher.schritte.map((s) => s.kapazitaet), ...r.nachher.schritte.map((s) => s.kapazitaet)) : 1;
    const opt = (sel) => ablauf.schritte.map((s) => `<option value="${h(s.id)}"${s.id === sel ? ' selected' : ''}>${h(s.name)}</option>`).join('');
    return `<section class="box" style="margin-top:16px"><h2>Engpass-Werkstatt: Wo stockt dein Ablauf?</h2>
      <p class="klein-text">Nach NEULAND OS: Kapazität je Schritt = verfügbare Stunden ÷ Stunden je Auftrag (abgerundet). Der kleinste Schritt begrenzt alles. Verschieben ändert die Verteilung, nicht die Summe.</p>
      <label class="feld">Erwartete Aufträge <input id="ew-auftraege" type="number" min="0" step="1" value="${ablauf.auftraege}"></label>
      <p class="klein-text" style="margin:10px 0 4px">Schritt · verfügbare Stunden · Stunden je Auftrag</p><div id="ew-schritte">${ablauf.schritte.map((s, i) => `<div class="reihe" data-i="${i}"><input data-f="name" value="${h(s.name)}" aria-label="Schritt"><input data-f="verfuegbar" type="number" step="any" min="0" value="${s.verfuegbar}" aria-label="Verfügbare Stunden"><input data-f="jeAuftrag" type="number" step="any" min="0.000001" value="${s.jeAuftrag}" aria-label="Stunden je Auftrag"><button class="knopf klein" data-weg="${i}" aria-label="Schritt entfernen">×</button></div>`).join('')}</div>
      <div class="reihe"><button class="knopf klein" id="ew-neu">+ Schritt</button><button class="knopf klein" id="ew-beispiel">Beispiel</button></div>
      <h3>Stunden verschieben</h3>
      <div class="reihe"><label class="feld">Von <select id="ew-von">${opt(ablauf.verschiebung.von)}</select></label><label class="feld">Nach <select id="ew-nach">${opt(ablauf.verschiebung.nach)}</select></label><label class="feld">Stunden <input id="ew-menge" type="number" step="0.1" min="0" value="${ablauf.verschiebung.menge}"></label><button class="knopf klein" id="ew-balance">Ausbalancieren</button></div>
      ${fehler ? `<p class="minus">${h(fehler)}</p>` : `
      <div class="kpis"><div class="kpi"><div class="l">Vorher möglich</div><div class="w">${r.vorher.durchsatz}</div></div><div class="kpi"><div class="l">Nachher möglich</div><div class="w">${r.nachher.durchsatz}</div></div><div class="kpi"><div class="l">Veränderung</div><div class="w ${r.differenz > 0 ? 'plus' : r.differenz < 0 ? 'minus' : ''}">${r.differenz > 0 ? '+' : ''}${r.differenz}</div></div></div>
      <p>${r.differenz > 0 ? `Die neue Verteilung schafft rechnerisch ${r.differenz} zusätzliche Aufträge.` : r.differenz < 0 ? 'Diese Verschiebung verringert die Kapazität – der Engpass ist gewandert.' : 'Diese Verschiebung ändert die Gesamtkapazität nicht.'}</p>
      <div class="balken">${r.nachher.schritte.map((s, i) => `<div class="zeile"><span>${h(s.name)}${r.nachher.engpaesse.some((e) => e.id === s.id) ? ' · ENGPASS' : ''}</span><span class="spur"><span class="fuell" style="width:${((r.vorher.schritte[i].kapazitaet / max) * 100).toFixed(1)}%;opacity:.45"></span></span><span class="wert">${r.vorher.schritte[i].kapazitaet}</span></div><div class="zeile"><span></span><span class="spur"><span class="fuell" style="width:${((s.kapazitaet / max) * 100).toFixed(1)}%"></span></span><span class="wert">${s.kapazitaet}</span></div>`).join('')}</div>
      <p class="klein-text">Engpass vorher: ${h(r.vorher.engpaesse.map((e) => e.name).join(', '))} · nachher: ${h(r.nachher.engpaesse.map((e) => e.name).join(', '))} · offen: ${r.offenVorher} → ${r.offenNachher} · Stunden gesamt ${zahl(r.summe, 1)} (unverändert)</p>`}
      <p class="klein-text">Annahmen: gleichartige Aufträge, serieller Ablauf, Stunden wirklich übertragbar. Bleibt in deinem Browser.</p></section>`;
  }

  V.fliessband = {
    titel: 'Engpass & Agenten',
    unter: 'Jede Automation ist ein Agent mit Job. Der Engpass-Chef misst jeden Morgen ihre echte Leistung, findet den Schritt, der alles bremst, und verschiebt das KI-Kontingent dorthin. Unten rechnest du eigene Abläufe durch.',
    zeichnen(el, app) {
      if (!geladen) laden(app);
      if (!ablauf) ablauf = ladenLokal() || structuredClone(BEISPIEL);
      const mcp = `<section class="box" style="margin-top:16px"><h2>Per KI steuern (eigener MCP)</h2>
        <p class="klein-text">Dein MCP-Server <code>cashmachine-ultimativ</code> kennt jetzt die Zentrale: Engpass, 15 Kanäle, Shop-Doktor, neueste Videos, Feeds, Werbe-Labor, Lernstand, Kommentare, Engpass-Rechnung - und kann Agenten auf GitHub starten (Video-Fabrik, Shop-Doktor, Poster …). Frag z. B. „Wo ist heute der Engpass?“ oder „Starte die Video-Fabrik mit 3 Videos“.</p>
        <pre style="white-space:pre-wrap">claude mcp add cashmachine -e GITHUB_TOKEN=DEIN_TOKEN -- node mcp-ultimativ/server.mjs</pre>
        <p class="klein-text">Lesen geht ohne Token. Zum Starten: GitHub > Settings > Developer settings > Fine-grained token, nur dieses Repo, Berechtigung „Actions: Read and write“.</p></section>`;
      const gesund = system ? `<section class="box" style="margin-top:16px"><h2>System-Gesundheit · ${system.ok}/${system.gesamt} Workflows ok</h2>
        ${system.probleme.length ? [['Braucht dich', (p) => !p.diagnose?.selbst, 'hoch'], ['Erledigt das System selbst', (p) => p.diagnose?.selbst, 'info']].map(([titel, f, prio]) => {
          const l = system.probleme.filter(f);
          return l.length ? `<p class="klein-text"><strong>${titel} (${l.length})</strong></p><ul class="aufgaben">${l.map((p) => `<li class="aufgabe" data-prio="${p.diagnose?.selbst ? prio : p.art === 'absturz' ? 'hoch' : 'mittel'}"><span class="t">${h(p.name)}<span class="klein-text"> · ${h(p.diagnose ? p.diagnose.text : p.text)}${p.diagnose ? `<br>→ ${h(p.diagnose.loesung)}${p.diagnose.beleg ? `<br><code>${h(p.diagnose.beleg)}</code>` : ''}` : ''}</span></span>${p.url ? `<a class="knopf klein" href="${h(p.url)}" target="_blank" rel="noopener">Log</a>` : ''}</li>`).join('')}</ul>` : '';
        }).join('') : '<p class="plus">Alles läuft sauber.</p>'}
        ${system.neugestartet?.length ? `<p class="klein-text">Automatisch neu gestartet: ${system.neugestartet.map(h).join(', ')}</p>` : ''}
        <p class="klein-text">Der System-Wächter prüft alle 3 Stunden alle Workflows und startet abgestürzte Agenten einmal neu. Stand ${h(ZUI.datum(String(system.stand).slice(0, 10)))}.</p></section>` : '';
      el.innerHTML = fliessband() + gesund + mcp + werkstatt();
      const neu = () => { speichernLokal(ablauf); this.zeichnen(el, app); };
      const num = (x) => (String(x).trim() === '' ? NaN : Number(x));
      el.querySelector('#ew-auftraege').addEventListener('change', (e) => { ablauf.auftraege = num(e.target.value); neu(); });
      el.querySelectorAll('#ew-schritte [data-f]').forEach((inp) => inp.addEventListener('change', () => {
        const s = ablauf.schritte[Number(inp.closest('[data-i]').dataset.i)];
        s[inp.dataset.f] = inp.dataset.f === 'name' ? inp.value.trim() : num(inp.value); neu();
      }));
      el.querySelectorAll('[data-weg]').forEach((b) => b.addEventListener('click', () => {
        if (ablauf.schritte.length <= 2) { meldung('Mindestens zwei Schritte bleiben im Ablauf'); return; }
        const weg = ablauf.schritte.splice(Number(b.dataset.weg), 1)[0];
        if ([ablauf.verschiebung.von, ablauf.verschiebung.nach].includes(weg.id)) ablauf.verschiebung = { von: ablauf.schritte[0].id, nach: ablauf.schritte[1].id, menge: 0 };
        neu();
      }));
      el.querySelector('#ew-neu').addEventListener('click', () => { if (ablauf.schritte.length < 12) ablauf.schritte.push({ id: `s${Date.now()}`, name: 'Neuer Schritt', verfuegbar: 30, jeAuftrag: 1 }); neu(); });
      el.querySelector('#ew-beispiel').addEventListener('click', () => { ablauf = structuredClone(BEISPIEL); neu(); });
      for (const [id, feld] of [['#ew-von', 'von'], ['#ew-nach', 'nach'], ['#ew-menge', 'menge']]) el.querySelector(id).addEventListener('change', (e) => { ablauf.verschiebung[feld] = feld === 'menge' ? num(e.target.value) : e.target.value; neu(); });
      el.querySelector('#ew-balance').addEventListener('click', () => {
        const von = ablauf.schritte.find((s) => s.id === ablauf.verschiebung.von), nach = ablauf.schritte.find((s) => s.id === ablauf.verschiebung.nach);
        if (von && nach) { ablauf.verschiebung.menge = ZEngpass.ausbalancieren(von, nach); neu(); }
      });
    },
  };
})(window);
