// Ansichten "Content-Studio" (alles, was der Video-Bot produziert: Produktvideos, Anime, Top-5, Social-Posts
// als Karussell, Podcast) und "Alle Werkzeuge" (die anderen Shop-, Content- und System-Apps direkt in der Zentrale).
(function (root) {
  const { ZUI, ZCaptions } = root;
  const { h, kopieren } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  let feed = null, podcast = [], gesperrt = new Set(), geladen = false, reiter = 'videos', mehr = 24;

  async function laden(app) {
    geladen = true;
    const hol = async (pfad, f) => { try { const r = await fetch(pfad, { cache: 'no-store' }); return r.ok ? await r.json() : f; } catch (e) { return f; } };
    const [f, p, w] = await Promise.all([hol('../video-feed/videos.json', {}), hol('../podcast/episoden.json', []), hol('daten/werbe-check.json', null)]);
    feed = (f.videos || []).filter((v) => (v.sprache || 'de') === 'de');
    podcast = Array.isArray(p) ? p : [];
    gesperrt = new Set(((w && w.liste) || []).map((x) => x.datei));
    if (['studio'].includes(app.aktiv)) app.zeichnen();
  }

  const datei = (v, name) => v.url.replace(/[^/]+$/, encodeURIComponent(name));
  const istAnime = (v) => v.stil === 'anime' || /anime|folge/i.test(v.datei);
  const istSpezial = (v) => /top5|highlight/i.test(v.datei);
  const REITER = {
    videos: { name: 'Produktvideos', filter: (v) => v.format === 'hoch' && !istAnime(v) && !istSpezial(v) },
    anime: { name: 'Anime', filter: istAnime },
    top: { name: 'Top-5 & Highlights', filter: istSpezial },
    social: { name: 'Social-Posts (Karussell)', filter: (v) => (v.karussell || []).length > 0 },
    podcast: { name: 'Podcast', filter: null },
  };

  function videoKarte(v) {
    const ig = ZCaptions.fuerPlattform(v, 'instagram').text;
    return `<div class="box" style="margin:0"><div class="reihe" style="align-items:flex-start;flex-wrap:nowrap">
      ${v.vorschauUrl ? `<img src="${h(v.vorschauUrl)}" alt="" loading="lazy" style="width:90px;border-radius:8px;flex:none">` : ''}
      <div style="min-width:0"><strong>${h(v.titel)}</strong><p class="klein-text">${h(v.dauer)} s · ${h(String(v.erstellt || '').slice(0, 10))}${v.formatName ? ` · ${h(v.formatName)}` : ''}${istAnime(v) ? ' · Anime' : ''}</p>
      <div class="reihe"><a class="knopf klein" href="${h(v.url)}" target="_blank" rel="noopener">Video</a><button class="knopf klein" data-kopie="${h(ig)}">Text kopieren</button></div></div></div></div>`;
  }

  function karussellKarte(v) {
    const ig = ZCaptions.fuerPlattform(v, 'instagram').text;
    return `<div class="box" style="margin:0"><strong>${h(v.titel)}</strong><p class="klein-text">Instagram-/Facebook-/LinkedIn-Karussell · 4 Bilder (4:5)</p>
      <div class="reihe" style="flex-wrap:nowrap;overflow-x:auto">${v.karussell.map((k) => `<a href="${h(datei(v, k))}" target="_blank" rel="noopener"><img src="${h(datei(v, k))}" alt="" loading="lazy" style="width:72px;border-radius:6px"></a>`).join('')}</div>
      <div class="reihe" style="margin-top:6px"><button class="knopf klein" data-kopie="${h(ig)}">Text kopieren</button></div></div>`;
  }

  const podcastKarte = (e) => `<div class="box" style="margin:0"><strong>Folge ${h(e.nr)}: ${h(e.titel)}</strong><p class="klein-text">${Math.round((e.dauer || 0) / 60)} Min · ${h(String(e.datum || '').slice(5, 16))}</p>
    <audio controls preload="none" src="${h(e.url)}" style="width:100%"></audio></div>`;

  V.studio = {
    titel: 'Content-Studio',
    unter: 'Alles, was der Video-Bot jeden Tag produziert - auf Deutsch: Produktvideos, Anime-Clips, Top-5, Social-Posts als Karussell und Podcast. Herunterladen, Text kopieren, posten. Werbe-Check-gesperrte Inhalte sind ausgeblendet.',
    zeichnen(el, app) {
      if (!geladen) laden(app);
      if (!feed) { el.innerHTML = '<p class="klein-text">Lädt …</p>'; return; }
      const sauber = feed.filter((v) => !gesperrt.has(v.datei));
      const anzahl = Object.fromEntries(Object.entries(REITER).map(([k, r]) => [k, r.filter ? sauber.filter(r.filter).length : podcast.length]));
      const r = REITER[reiter];
      const liste = r.filter ? sauber.filter(r.filter) : podcast;
      const karte = reiter === 'social' ? karussellKarte : reiter === 'podcast' ? podcastKarte : videoKarte;
      el.innerHTML = `<div class="kpis" style="margin-bottom:14px">${Object.entries(REITER).map(([k, x]) => `<div class="kpi"><div class="l">${h(x.name)}</div><div class="w">${anzahl[k]}</div></div>`).join('')}</div>
        <div class="reihe" style="margin-bottom:12px">${Object.entries(REITER).map(([k, x]) => `<button class="knopf${k === reiter ? '' : ' klein'}" data-reiter="${k}">${h(x.name)}</button>`).join('')}</div>
        ${reiter === 'anime' && !liste.length ? '<p class="klein-text">Die ersten Anime-Produktclips kommen mit den nächsten Fabrik-Läufen (etwa jedes 4. Produktvideo).</p>' : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px">${liste.slice(0, mehr).map(karte).join('')}</div>
        ${liste.length > mehr ? `<p style="text-align:center;margin-top:12px"><button class="knopf klein" data-mehr="1">Mehr anzeigen (${liste.length - mehr} weitere)</button></p>` : ''}`;
      el.querySelectorAll('[data-reiter]').forEach((b) => b.addEventListener('click', () => { reiter = b.dataset.reiter; mehr = 24; this.zeichnen(el, app); }));
      el.querySelector('[data-mehr]')?.addEventListener('click', () => { mehr += 24; this.zeichnen(el, app); });
      el.querySelectorAll('[data-kopie]').forEach((b) => b.addEventListener('click', () => kopieren(b.dataset.kopie)));
    },
  };

  // Alle anderen Apps als Bereiche der Zentrale (gleiche Seite, im Rahmen) - Trading/Finanzen bleiben eigenständig.
  const WERKZEUGE = [
    ['Content & Video', [['social-poster', 'Social Poster', 'Archiv aller täglichen Social-Media-Pakete'], ['podcast', 'Podcast-Fabrik', 'Tägliche Folge mit zwei KI-Stimmen + RSS'], ['community-studio', 'Community-Studio', 'Produkttexte und KI-Videos für beide Shops'], ['video-feed', 'Video-Feed', 'Alle Videos als öffentliche Liste']]],
    ['Kanäle verbinden', [['verbinden', 'Alles verbinden', 'Ein Klick pro Plattform'], ['tiktok-verbinden', 'TikTok verbinden', 'TikTok-Zugang einrichten']]],
    ['Shop & Verkauf', [['brand-scout', 'Brand Scout', 'Marken-DNA und passende neue Produkte'], ['brand-assassin', 'Operator Suite', 'Produkt-Research, Creative-Analyse, Markt'], ['pricing', 'Preis-Kalkulator', 'Richtiger Verkaufspreis vor dem Launch'], ['forecast', 'Forecast', 'Was-wäre-wenn-Gewinn-Simulator'], ['oracle', 'Oracle', 'Tägliches Briefing aus echten Zahlen'], ['pulse', 'Pulse', 'Chat über deine Umsatzzahlen'], ['wrapped', 'Wrapped', 'Wochen-Rückblick im Story-Format'], ['closer', 'Closer', 'KI-Verkaufstrainer']]],
    ['System & Automationen', [['command', 'Command', 'Chef-Agent, Analytics, Ketten, Autopilot'], ['automations-dashboard', 'Control Center', 'Alle Automationen im Überblick'], ['cockpit', 'Cockpit', 'Status, Kosten-Trend, was Aufmerksamkeit braucht'], ['mission-control', 'Mission Control', 'Welches Secret als Nächstes am meisten freischaltet'], ['empire', 'Empire', 'Gesamtkarte aller Apps'], ['jarvis', 'J.A.R.V.I.S.', 'Sprach- und Chat-Assistent']]],
  ];
  let offen = '';

  V.werkzeuge = {
    titel: 'Alle Werkzeuge',
    unter: 'Alle Shop-, Content- und System-Apps an einem Ort - sie öffnen sich direkt hier in der Zentrale.',
    zeichnen(el) {
      const alle = WERKZEUGE.flatMap(([, l]) => l);
      const w = alle.find(([id]) => id === offen);
      if (w) {
        el.innerHTML = `<div class="reihe" style="margin-bottom:10px"><button class="knopf klein" data-zurueck="1">← Alle Werkzeuge</button><strong>${h(w[1])}</strong><span class="klein-text">${h(w[2])}</span><a class="knopf klein" href="../${h(w[0])}/" target="_blank" rel="noopener">In neuem Tab</a></div>
          <iframe src="../${h(w[0])}/" title="${h(w[1])}" style="width:100%;height:calc(100vh - 190px);min-height:520px;border:1px solid var(--linie,#333);border-radius:12px;background:#fff"></iframe>`;
        el.querySelector('[data-zurueck]').addEventListener('click', () => { offen = ''; this.zeichnen(el); });
        return;
      }
      el.innerHTML = WERKZEUGE.map(([gruppe, l]) => `<section class="box"><h2>${h(gruppe)}</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
        ${l.map(([id, name, text]) => `<button class="knopf" data-werkzeug="${h(id)}" style="text-align:left;display:block;height:auto;padding:10px 12px"><strong>${h(name)}</strong><br><span class="klein-text">${h(text)}</span></button>`).join('')}</div></section>`).join('');
      el.querySelectorAll('[data-werkzeug]').forEach((b) => b.addEventListener('click', () => { offen = b.dataset.werkzeug; this.zeichnen(el); }));
    },
  };
})(window);
