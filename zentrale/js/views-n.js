// Ansicht "NEULAND-Rechner": die 19 NEULAND-Werkzeuge mit ECHTEN Daten der Cash Machine.
// Taeglich auf GitHub gerechnet: Werbeaussagen, Lizenzen der Video-Bausteine, offene Aufgaben, Post-Zahlen
// (daten/neuland.json). Live im Browser: Geld-Rechner mit deinen hochgeladenen Shopify-Bestellungen.
(function (root) {
  const { ZUI } = root;
  const { h, tabelle } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  const DATEI = { ProfitLeaks: 'Gewinnspur', RunwayRadar: 'PufferPilot', CapacityTwin: 'Kapazitaetszwilling', BreakEvenMap: 'Schwellenkarte', ConcentrationWatch: 'Abhaengigkeitslupe', FeeDetective: 'Gebuehrenspur', ReturnPatternMap: 'Rueckflusskarte', StressMatrix: 'Stresstableau', PromiseCheck: 'Belegprobe', RightsLedger: 'Rechtebuch', EvidenceDebt: 'Belegschulden', RenewalCalendar: 'Rechtekalender', LaunchCompass: 'Startkompass', ExperimentLab: 'Versuchsfeld', ValueMap: 'Vorhabenwaage', ExperimentSamplePlanner: 'Testkompass', DecisionJournal: 'Entscheidungsbuch' };
  let daten, geladen = false, offen = '';

  async function laden(app) {
    geladen = true;
    try { const r = await fetch('daten/neuland.json', { cache: 'no-store' }); daten = r.ok ? await r.json() : null; } catch (e) { daten = null; }
    if (app.aktiv === 'neuland') app.zeichnen();
  }

  const wert = (m) => (m.value === null || m.value === undefined ? '–' : `${typeof m.value === 'number' ? m.value.toLocaleString('de-DE') : h(m.value)}${m.unit && m.unit !== '' ? ` ${h(m.unit === 'EUR' ? '€' : m.unit)}` : ''}`);

  function karte(id, e, { live = false } = {}) {
    if (!e) return '';
    const spalten = e.rows?.length ? Object.keys(e.rows[0]) : [];
    return `<section class="box"><div class="reihe" style="justify-content:space-between"><h2 style="margin:0">${h(e.name)}${live ? ' <span class="klein-text">(live)</span>' : ''}</h2>
        ${DATEI[id] ? `<button class="knopf klein" data-oeffnen="${h(DATEI[id])}">Im Werkzeug öffnen</button>` : ''}</div>
      <p class="klein-text">${h(e.beschreibung || '')}${e.quelle ? ` · Daten: ${h(e.quelle)}` : ''}</p>
      ${e.fehler ? `<p class="klein-text">⚠️ ${h(e.fehler)}</p>` : `<div class="kpis">${(e.metrics || []).map((m) => `<div class="kpi"><div class="l">${h(m.label)}</div><div class="w" style="font-size:1.2rem">${wert(m)}</div></div>`).join('')}</div>
      ${spalten.length ? `<details style="margin-top:8px"><summary>Tabelle (${e.rows.length})</summary>${tabelle(spalten.map((t) => ({ t })), e.rows.slice(0, 40).map((r) => spalten.map((s) => h(r[s] ?? '–'))))}</details>` : ''}
      ${(e.notes || []).length ? `<p class="klein-text">${e.notes.map(h).join(' ')}</p>` : ''}`}</section>`;
  }

  // Geld-Rechner live: Bestellungen bleiben im Browser (nie im öffentlichen Repo).
  function geldLive(app) {
    const T = root.NeulandTools;
    const z = app.z;
    if (!T || !z.bestellungen?.length) return '<section class="box"><h2>Geld-Rechner mit deinen Bestellungen</h2><p class="klein-text">Lade unter „Daten“ deinen Shopify-Bestellexport hoch - dann rechnen Gewinnspur, Abhängigkeitslupe und Gebührenspur hier live mit deinen echten Zahlen (die Daten verlassen deinen Browser nicht).</p><button class="knopf klein" data-gehe="daten">Bestellungen hochladen</button></section>';
    const produkt = new Map(z.produkte.map((p) => [p.id, p]));
    const orders = z.bestellungen.flatMap((b) => b.artikel.map((a) => {
      const p = produkt.get(a.p) || {};
      const revenue = Math.round(a.preis * a.menge * 100) / 100;
      return { product: p.name || a.p, revenue, cost: Math.round((p.kosten || 0) * a.menge * 100) / 100, fees: Math.round((revenue * 0.021 + 0.25 / b.artikel.length) * 100) / 100, refund: 0, quantity: a.menge };
    }));
    const quelle = `${z.beispiel ? 'BEISPIELDATEN - ' : ''}${z.bestellungen.length} Bestellungen aus deinem Export`;
    const rechne = (id, eingabe, extra) => { try { return karte(id, { name: T[id].name, beschreibung: T[id].description, quelle: `${quelle}${extra || ''}`, ...T[id].run(eingabe) }, { live: true }); } catch (err) { return karte(id, { name: T[id].name, fehler: err.message }); } };
    return rechne('ProfitLeaks', { orders }, '; Gebühren geschätzt (Shopify Payments 2,1 % + 0,25 €), Erstattungen nicht im Export') + rechne('ConcentrationWatch', { orders: orders.map(({ product, revenue }) => ({ product, revenue })) }) + rechne('FeeDetective', { orders: orders.map(({ product, revenue, fees }) => ({ product, revenue, fees })) }, '; Gebühren geschätzt');
  }

  V.neuland = {
    titel: 'NEULAND-Rechner',
    unter: 'Die 19 NEULAND-Werkzeuge rechnen mit echten Daten: Werbeaussagen der Videos, Lizenzen jedes Video-Bausteins, deine nächsten Schritte, echte Post-Zahlen je Hook und Sprache (Welt-Bot) - und live mit deinen Bestellungen.',
    zeichnen(el, app) {
      if (!geladen) laden(app);
      if (offen) {
        el.innerHTML = `<div class="reihe" style="margin-bottom:10px"><button class="knopf klein" data-zurueck="1">← NEULAND-Rechner</button><strong>${h(offen)}</strong><a class="knopf klein" href="../neuland/${h(offen)}.html" target="_blank" rel="noopener">In neuem Tab</a></div>
          <iframe src="../neuland/${h(offen)}.html" title="${h(offen)}" style="width:100%;height:calc(100vh - 190px);min-height:520px;border:1px solid var(--linie,#333);border-radius:12px;background:#fff"></iframe>`;
        el.querySelector('[data-zurueck]').addEventListener('click', () => { offen = ''; this.zeichnen(el, app); });
        return;
      }
      if (daten === undefined) { el.innerHTML = '<p class="klein-text">Lädt …</p>'; return; }
      const e = (daten && daten.ergebnisse) || {};
      const naechste = (e.ValueMap?.rows || []).slice(0, 5);
      el.innerHTML = `${naechste.length ? `<section class="box betont"><h2>Deine 5 wirksamsten nächsten Schritte</h2><ol>${naechste.map((r) => `<li><strong>${h(r.Vorhaben)}</strong> <span class="klein-text">· Bewertung ${h(r.Bewertung)} (Wirkung ${h(r.Wirkung)} × Vertrauen ${h(r.Vertrauen)} ÷ Aufwand ${h(r.Aufwand)})</span></li>`).join('')}</ol><p class="klein-text">Gerechnet mit der NEULAND-Vorhabenwaage aus deinem Kanal-Status.</p></section>` : ''}
        ${!daten ? '<p class="klein-text">Die täglichen Ergebnisse erscheinen nach dem nächsten Lauf des Engpass-Chefs (03:35 UTC).</p>' : ''}
        ${['PromiseCheck', 'EvidenceDebt', 'RightsLedger', 'RenewalCalendar'].map((id) => karte(id, e[id])).join('')}
        ${daten?.wartetAufZahlen ? '<section class="box"><h2>Versuchsfeld & Testkompass</h2><p class="klein-text">Rechnen, sobald die ersten Posts echte Aufrufe haben: Hook-Varianten (Frage/Warnung/Widerspruch) und Welt-Bot-Sprachen gegeneinander - mit 95-%-Intervallen und benötigter Testgröße.</p></section>' : ['ExperimentLab', 'ExperimentSamplePlanner'].map((id) => karte(id, e[id])).join('')}
        ${geldLive(app)}
        <section class="box"><h2>Alle 19 Werkzeuge</h2><div class="reihe">${[...new Set([...Object.values(DATEI), 'Auftragsmix', 'Engpasswechsel'])].map((d) => `<button class="knopf klein" data-oeffnen="${h(d)}">${h(d)}</button>`).join('')}</div></section>`;
      el.querySelectorAll('[data-oeffnen]').forEach((b) => b.addEventListener('click', () => { offen = b.dataset.oeffnen; this.zeichnen(el, app); }));
    },
  };
})(window);
