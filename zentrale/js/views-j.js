// Ansicht: Heute posten - die 5 besten neuen Videos mit Download und fertigen Texten je Plattform.
// Zum Posten von Hand, solange (oder wo) ein Kanal noch nicht automatisch verbunden ist.
(function (root) {
  const { ZUI, ZCaptions } = root;
  const { h, kopieren, meldung } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  const MERKEN = 'zentrale-manuell-gepostet';
  let feed = null, auto = [], geladen = false;
  const lokal = () => { try { return JSON.parse(localStorage.getItem(MERKEN)) || []; } catch (e) { return []; } };
  const merken = (liste) => { try { localStorage.setItem(MERKEN, JSON.stringify(liste.slice(-500))); } catch (e) { /* nur dieses Fenster */ } };
  const BIO = new URL('../bio/', location.href).href;

  async function laden(app) {
    geladen = true;
    try { const r = await fetch('../video-feed/videos.json', { cache: 'no-store' }); feed = r.ok ? (await r.json()).videos || [] : []; } catch (e) { feed = []; }
    try { const r = await fetch('../video-feed/gepostet.json', { cache: 'no-store' }); auto = r.ok ? await r.json() : []; } catch (e) { auto = []; }
    if (app.aktiv === 'heutePosten') app.zeichnen();
  }

  function karte(v, i) {
    const texte = Object.keys(ZCaptions.PLATTFORMEN).map((p) => ({ id: p, ...ZCaptions.fuerPlattform(v, p) }));
    return `<section class="box"><h2>${i + 1}. ${h(v.titel)}</h2>
      <div class="reihe" style="align-items:flex-start">
        ${v.vorschauUrl ? `<img src="${h(v.vorschauUrl)}" alt="Vorschau" loading="lazy" style="width:120px;border-radius:8px">` : ''}
        <div><p class="klein-text">${h(v.dauer)} s · ${h(String(v.erstellt || '').slice(0, 10))}${(v.varianten || []).length ? ` · ${v.varianten.length + 1} Anfänge zum Testen` : ''}</p>
        <div class="reihe"><a class="knopf" href="${h(v.url)}" target="_blank" rel="noopener">Video herunterladen</a>${(v.varianten || []).map((x) => `<a class="knopf klein" href="${h(v.url.replace(/[^/]+$/, encodeURIComponent(x.datei)))}" target="_blank" rel="noopener">Anfang: ${h(x.hookTyp)}</a>`).join('')}</div></div></div>
      ${texte.map((t) => `<details><summary><strong>${h(t.plattform)}</strong></summary>
        ${t.titel ? `<p class="klein-text">Titel:</p><pre style="white-space:pre-wrap">${h(t.titel)}</pre><button class="knopf klein" data-kopie="${h(t.titel)}">Titel kopieren</button>` : ''}
        <pre style="white-space:pre-wrap">${h(t.text)}</pre><button class="knopf klein" data-kopie="${h(t.text)}">Text kopieren</button>
        ${t.link ? `<button class="knopf klein" data-kopie="${h(t.link)}">Link kopieren</button>` : ''}${t.tipp ? `<p class="klein-text">${h(t.tipp)}</p>` : ''}</details>`).join('')}
      <div class="reihe" style="margin-top:8px"><button class="knopf klein" data-erledigt="${h(v.datei)}">Als gepostet markieren</button></div></section>`;
  }

  V.heutePosten = {
    titel: 'Heute posten',
    unter: 'Die 5 besten neuen Videos des Tages mit fertigen Texten für jede Plattform - Länge, Hashtags, Shop-Link und KI-Hinweis passen schon. Für Kanäle, die noch nicht automatisch verbunden sind: herunterladen, Text kopieren, posten.',
    zeichnen(el, app) {
      if (!geladen) laden(app);
      if (!feed) { el.innerHTML = '<p class="klein-text">Lädt …</p>'; return; }
      const liste = ZCaptions.heute(feed, { gepostet: [...auto, ...lokal()] });
      el.innerHTML = `<section class="box betont" style="margin-bottom:14px"><h2>Dein Link in der Bio</h2>
          <p class="klein-text">Jedes Video sagt „Link in der Bio“ - trag diese Seite in TikTok, Instagram, YouTube und Co. als Profil-Link ein. Sie zeigt alle Produkte und die neuesten Videos und aktualisiert sich jeden Tag selbst.</p>
          <div class="reihe"><code>${h(BIO)}</code><button class="knopf klein" data-kopie="${h(BIO)}">Link kopieren</button><a class="knopf klein" href="${h(BIO)}" target="_blank" rel="noopener">Ansehen</a></div></section>
        ${liste.length ? liste.map(karte).join('') : '<p class="plus">Alles gepostet - morgen kommen neue Videos.</p>'}`;
      el.querySelectorAll('[data-kopie]').forEach((b) => b.addEventListener('click', () => kopieren(b.dataset.kopie)));
      el.querySelectorAll('[data-erledigt]').forEach((b) => b.addEventListener('click', () => { merken([...lokal(), b.dataset.erledigt]); meldung('Als gepostet markiert'); this.zeichnen(el, app); }));
    },
  };
})(window);
