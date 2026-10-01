// Live-Daten: lädt die vom täglichen GitHub-Lauf verschlüsselte Datei und entsperrt sie mit dem
// lokal gemerkten Passwort. Ohne Datei (z. B. in der Vorschau) passiert nichts.
(function (root) {
  const { ZS, ZTresor, ZUI } = root;
  const PW = 'zentrale.schluessel';

  const merke = { lesen() { try { return root.localStorage.getItem(PW); } catch (e) { return null; } }, setzen(v) { try { root.localStorage.setItem(PW, v); } catch (e) { /* nur für diese Sitzung */ } }, weg() { try { root.localStorage.removeItem(PW); } catch (e) { /* egal */ } } };

  function uebernehmen(app, d) {
    const alt = app.z, kostenAlt = {};
    for (const p of alt.beispiel ? [] : alt.produkte) kostenAlt[p.id] = p.kosten;
    const basis = alt.beispiel ? { ...ZS.leer(), einstellungen: alt.einstellungen, autopilot: { ...alt.autopilot, letzterLauf: null, plan: null, aktionen: [] } } : JSON.parse(JSON.stringify(alt));
    basis.beispiel = false;
    basis.bestellungen = d.bestellungen;
    basis.produkte = d.produkte.map((p) => ({ ...p, kosten: p.kosten || kostenAlt[p.id] || 0 }));
    basis.live = { stand: d.stand, geholt: d.geholt };
    if (alt.live && alt.live.geholt !== d.geholt && basis.autopilot) basis.autopilot.letzterLauf = null;
    app.ersetzen(basis, `Live-Daten vom ${ZUI.datum(d.stand)} geladen`);
  }

  async function pruefen(app) {
    let paket;
    try {
      const res = await fetch('daten/live.enc.json', { cache: 'no-store' });
      if (!res.ok) return;
      paket = await res.json();
    } catch (e) { return; }
    app.livePaket = paket;
    const pw = merke.lesen();
    if (!pw) { if (app.aktiv === 'daten' || app.aktiv === 'heute') app.zeichnen(); return; }
    try {
      const d = await ZTresor.entschluesseln(paket, pw);
      if (app.z.live && app.z.live.geholt === d.geholt) return;
      uebernehmen(app, d);
    } catch (e) { merke.weg(); app.zeichnen(); }
  }

  async function entsperren(app, pw) {
    const d = await ZTresor.entschluesseln(app.livePaket, pw);
    merke.setzen(pw);
    uebernehmen(app, d);
  }

  // Echte Produkte aus den Shops (vom täglichen Lauf abgelegt) ersetzen den Beispiel-Shop.
  async function produkteLaden(app) {
    let d;
    try {
      const res = await fetch('daten/produkte.json', { cache: 'no-store' });
      if (!res.ok) return;
      d = await res.json();
    } catch (e) { return; }
    const liste = Array.isArray(d && d.produkte) ? d.produkte.filter((p) => p && p.id && p.name) : [];
    if (!liste.length || !(app.z.beispiel || app.z.shopModus)) return;
    const fingerabdruck = (ps) => ps.filter((p) => p.ausShop || !app.z.shopModus).map((p) => `${p.id}:${p.preis}:${p.bild}`).sort().join('|');
    if (app.z.shopModus && fingerabdruck(app.z.produkte) === fingerabdruck(liste.map((p) => ({ ...p, ausShop: true })))) return;
    const warBeispiel = app.z.beispiel;
    app.ersetzen(ZS.shopModus(liste, app.z), warBeispiel ? `Deine ${liste.length} Shop-Produkte sind geladen` : 'Produkte aktualisiert');
  }

  root.ZLive = { pruefen, entsperren, vergessen: merke.weg, produkteLaden };
})(window);
