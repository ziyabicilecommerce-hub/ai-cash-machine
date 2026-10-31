// Videobot: virales Horror-Skript auswählen/würfeln/ändern -> "Video bauen" öffnet ein GitHub-Issue,
// der Workflow videobot.yml rendert daraus das Video und schreibt den Download-Link (oder postet auf TikTok).
(() => {
  const REPO = 'ziyabicilecommerce-hub/ai-cash-machine';
  const ORTE = { haus: '🏠 Haus', wald: '🌲 Wald', zug: '🚆 Zug', flugzeug: '✈️ Flugzeug', aufzug: '🛗 Aufzug' };
  const BOESE = { schatten: '👤 Schatten', frau: '👩 Frau mit langem Hals', gremlin: '👹 Gremlin', hirsch: '🦌 Hirsch-Wesen' };
  const KONTEN = { '': 'Nicht posten - nur Video-Link', futureflowx3: '@futureflowx3', zyx_7851: '@zyx_7851', futureflowxx: '@futureflowxx' };
  const q = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  let SK = { hooks: [], skripte: [] };

  function auswahl(id, werte) { q(id).replaceChildren(...Object.entries(werte).map(([v, t]) => new Option(t, v))); }
  function fuellen(s) {
    for (const k of ['titel', 'hook', 'absender', 'nachricht', 'monster', 'monster2', 'ende', 'weiter', 'frage']) q(`vb-${k}`).value = s[k] || '';
    q('vb-saetze').value = (s.saetze || []).join('\n');
    q('vb-wahl').value = (s.wahl || []).join(' / ');
    q('vb-ort').value = s.ort || 'haus'; q('vb-boese').value = s.boesewicht || 'schatten'; q('vb-stimme').value = s.stimme || 'mann';
    pruefen();
  }
  function skript() {
    const s = { titel: q('vb-titel').value.trim(), ort: q('vb-ort').value, boesewicht: q('vb-boese').value, stimme: q('vb-stimme').value,
      hook: q('vb-hook').value.trim(), saetze: q('vb-saetze').value.split('\n').map((x) => x.trim()).filter(Boolean), ende: q('vb-ende').value.trim(),
      frage: q('vb-frage').value.trim(), weiter: q('vb-weiter').value.trim(), posten: q('vb-posten').value };
    for (const k of ['absender', 'nachricht', 'monster', 'monster2']) if (q(`vb-${k}`).value.trim()) s[k] = q(`vb-${k}`).value.trim();
    const wahl = q('vb-wahl').value.split('/').map((x) => x.trim()).filter(Boolean);
    if (wahl.length === 2) s.wahl = wahl;
    if (q('vb-kurz').value) s.kurz = true;
    return s;
  }
  // Viral-Check nach dem, was bei unseren Zahlen funktioniert hat
  function pruefen() {
    const s = skript(), punkte = [], fehler = [];
    if (!s.hook) fehler.push('Hook fehlt');
    if (s.saetze.length < 3) fehler.push('Mindestens 3 Sätze (einer pro Zeile)');
    if (s.saetze.length > 8) fehler.push('Höchstens 8 Sätze');
    if (!s.ende) fehler.push('Ende/Twist fehlt');
    const woerter = [s.hook, ...s.saetze, s.ende, s.weiter].join(' ').split(/\s+/).filter(Boolean).length;
    const sek = Math.round((s.kurz ? Math.min(woerter, 34) / 3 : woerter / 2.6) + 6);
    const ok = (bed, gut, schlecht) => punkte.push([bed, bed ? gut : schlecht]);
    ok(s.hook.length > 0 && s.hook.length <= 90, 'Hook kurz genug (in 2 Sekunden gelesen)', 'Hook kürzer machen - max. ~90 Zeichen');
    ok(!/^teil\s*\d/i.test(s.hook), 'Hook funktioniert ohne Vorwissen', 'Hook nicht mit „Teil …“ anfangen - neue Zuschauer wischen sonst weg');
    ok(/\.|:|„|"/.test(s.hook) && /(aber|trotzdem|nicht|kein|niemand|nur|allein|\d)/i.test(s.hook), 'Hook hat einen Widerspruch (macht neugierig)', 'Hook braucht einen Widerspruch: „…, aber …“, „kein …, trotzdem …“');
    ok(sek >= 15 && sek <= 30, `Länge ca. ${sek} s - perfekt`, `Länge ca. ${sek} s - unsere Zuschauer bleiben nur kurz, am besten 15-30 s (Kurz-Modus)`);
    ok(!!s.wahl, 'Kommentar-Wahl 1/2 drin (bringt Kommentare)', 'Kommentar-Wahl eintragen, z. B. „Tür auf / Wegrennen“');
    ok(!!s.nachricht, 'Handy-Nachricht drin (bei uns die stärksten Szenen)', 'Tipp: eine Handy-Nachricht einbauen (Absender + Text)');
    ok(!!s.monster, 'Monster spricht (Gänsehaut)', 'Tipp: Monster-Satz eintragen, z. B. „Dreh dich um.“');
    ok(/\?/.test(s.frage), 'Frage an die Zuschauer (bringt Kommentare)', 'Frage am Ende für Kommentare, z. B. „Hättest du aufgemacht?“');
    q('vb-check').replaceChildren(...fehler.map((f) => mk('div', 'tipp warn', `❌ ${f}`)), ...punkte.map(([g, t]) => mk('div', `tipp ${g ? 'gut' : ''}`, `${g ? '✅' : '💡'} ${t}`)));
    const score = Math.round((punkte.filter(([g]) => g).length / punkte.length) * 100);
    q('vb-score').textContent = fehler.length ? '–' : `${score}`;
    q('vb-bauen').classList.toggle('aus', fehler.length > 0);
    return fehler.length === 0;
  }
  function bauen(e) {
    e.preventDefault();
    if (!pruefen()) return;
    const s = skript();
    const body = `Dieses Skript wird vom Videobot automatisch zu einem Horror-Video (ca. 3-6 Min.). Einfach unten auf **Create/Submit** tippen.\n\n\`\`\`json\n${JSON.stringify(s, null, 1)}\n\`\`\`\n`;
    const url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`Videobot: ${s.titel || s.hook.slice(0, 50)}`)}&body=${encodeURIComponent(body)}`;
    if (!window.open(url, '_blank')) location.href = url;
  }

  async function start() {
    auswahl('vb-ort', ORTE); auswahl('vb-boese', BOESE); auswahl('vb-stimme', { mann: '🎙️ Männerstimme', frau: '🎙️ Frauenstimme' }); auswahl('vb-posten', KONTEN);
    try { SK = await (await fetch(`skripte.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch { /* offline */ }
    q('vb-skripte').replaceChildren(...SK.skripte.map((s) => { const b = mk('button', 'chip', s.titel); b.type = 'button'; b.onclick = () => fuellen(s); return b; }));
    q('vb-hooks').replaceChildren(...SK.hooks.map((h) => { const b = mk('button', 'chip', h); b.type = 'button'; b.onclick = () => { q('vb-hook').value = h; pruefen(); }; return b; }));
    q('vb-wuerfel').onclick = () => fuellen(SK.skripte[Math.floor(Math.random() * SK.skripte.length)] || {});
    q('vb-form').addEventListener('input', pruefen);
    q('vb-form').addEventListener('submit', bauen);
    q('vb-meine').href = `https://github.com/${REPO}/issues?q=is%3Aissue+%22Videobot%3A%22`;
    if (SK.skripte[0]) fuellen(SK.skripte[0]); else pruefen();
  }
  start();
})();
