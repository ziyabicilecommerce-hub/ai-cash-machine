// Ansicht: Community - Wochenplan des Community-Agenten, verbundene Kanaele, letzte Beitraege, Einladungs-Links.
(function (root) {
  const { ZUI } = root;
  const { h, kopieren } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  const ART = { challenge: '🏁 Challenge', tipp: '💡 Tipp', umfrage: '📊 Umfrage', frage: '💬 Frage', fortschritt: '🔥 Fortschritt', routine: '⏱️ Routine', rueckblick: '📅 Rückblick' };
  const BIO = new URL('../bio/', location.href).href;
  let daten, geladen = false;

  async function laden(app) {
    geladen = true;
    try { const r = await fetch('daten/community.json', { cache: 'no-store' }); daten = r.ok ? await r.json() : null; } catch (e) { daten = null; }
    if (app.aktiv === 'community') app.zeichnen();
  }

  V.community = {
    titel: 'Community',
    unter: 'Erst Community, dann Verkauf: Jeden Tag um 18 Uhr postet der Community-Agent in deinen Telegram-Kanal und auf Discord - Challenges, Tipps, Umfragen, Fragen. Nur 1 von 7 Beiträgen nennt ein Produkt.',
    zeichnen(el, app) {
      if (!geladen) laden(app);
      if (daten === undefined) { el.innerHTML = '<p class="klein-text">Lädt …</p>'; return; }
      if (!daten) { el.innerHTML = '<p class="klein-text">Der Community-Plan erscheint nach dem ersten Lauf des Community-Agenten (täglich 16:05 UTC).</p>'; return; }
      const verbunden = daten.verbunden || [];
      const links = Object.entries(daten.links || {}).filter(([, l]) => l);
      el.innerHTML = `<div class="kpis" style="margin-bottom:14px"><div class="kpi"><div class="l">Community</div><div class="w" style="font-size:1rem">${h(daten.name)}</div></div><div class="kpi"><div class="l">Verbunden</div><div class="w">${verbunden.length ? h(verbunden.join(' + ')) : '–'}</div></div><div class="kpi"><div class="l">Beiträge</div><div class="w">${(daten.verlauf || []).filter((v) => v.kanaele.length).length}</div></div></div>
        ${verbunden.length ? '' : `<section class="box betont" style="margin-bottom:14px"><h2>Start in 10 Minuten</h2><ol>
          <li>Telegram: Kanal anlegen, über @BotFather einen Bot erstellen und als Admin in den Kanal holen. Secret <code>TELEGRAM_BOT_TOKEN</code>, Variable <code>TELEGRAM_KANAL_ID</code> = @deinkanal.</li>
          <li>Discord (optional): eigenen Server erstellen, Kanal > Integrationen > Webhook. Secret <code>DISCORD_WEBHOOK_URL</code>.</li>
          <li>Einladungs-Links als Variablen <code>COMMUNITY_TELEGRAM_LINK</code> / <code>COMMUNITY_DISCORD_LINK</code> eintragen - dann erscheint auf deiner Bio-Seite ein „Community beitreten“-Knopf.</li></ol>
          <p class="klein-text">Dieselben Schlüssel nutzt auch der Video-Poster - einmal eintragen, beides läuft.</p></section>`}
        ${links.length ? `<section class="box"><h2>Einladen</h2><div class="reihe">${links.map(([k, l]) => `<button class="knopf klein" data-kopie="${h(l)}">${h(k)}-Link kopieren</button>`).join('')}<a class="knopf klein" href="${h(BIO)}" target="_blank" rel="noopener">Bio-Seite</a></div></section>` : ''}
        <section class="box"><h2>Wochenplan</h2>${(daten.plan || []).map((p) => `<details><summary><strong>${h(ZUI.datum(p.datum))}</strong> · ${h(ART[p.art] || p.art)}</summary><pre style="white-space:pre-wrap">${h(p.text)}</pre><button class="knopf klein" data-kopie="${h(p.text)}">Text kopieren</button></details>`).join('')}</section>
        ${(daten.verlauf || []).length ? `<section class="box"><h2>Zuletzt</h2><ul>${daten.verlauf.map((v) => `<li>${h(v.datum)} · ${h(ART[v.art] || v.art)} · ${v.kanaele.length ? h(v.kanaele.join(', ')) : 'nicht gepostet'}${v.fehler?.length ? ` <span class="klein-text">(${h(v.fehler.join('; '))})</span>` : ''}</li>`).join('')}</ul></section>` : ''}`;
      el.querySelectorAll('[data-kopie]').forEach((b) => b.addEventListener('click', () => kopieren(b.dataset.kopie)));
    },
  };
})(window);
