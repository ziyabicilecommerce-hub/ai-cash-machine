// Steuerung: Zustand laden, Ansichten umschalten, nach jeder Änderung speichern und neu rechnen.
(function (root) {
  const { ZS, ZAgenten, ZUI } = root;
  const BEREICHE = [
    ['heute', 'Heute'], ['studio', 'Content-Studio'], ['heutePosten', 'Heute posten'], ['community', 'Community'], ['suchradar', 'Such-Radar'], ['kanaele15', '15 Kanäle'], ['fliessband', 'Engpass & Agenten'], ['shopdoktor', 'Shop-Doktor'], ['labor', 'Werbe-Labor'], ['uebersicht', 'Übersicht'], ['agenten', 'Agenten-Team'], ['empfehlungen', 'Empfehlungen'], ['kunden', 'Kunden'],
    ['kanaele', 'Kanäle'], ['preise', 'Preise'], ['konkurrenz', 'Konkurrenz'], ['content', 'Content'],
    ['support', 'Support-Bot'], ['daten', 'Daten'], ['werkzeuge', 'Alle Werkzeuge'],
  ];

  const app = {
    z: null, lauf: null, aktiv: 'heute', speicherOk: true,
    heute() { return root.ZA.datumAus(Math.floor(Date.now() / root.ZA.TAG)); },
    neuRechnen() { this.lauf = ZAgenten.alleLaufen(this.z); },
    aendern(fn, text) {
      fn(this.z);
      this.speicherOk = ZS.speichern(this.z);
      this.neuRechnen();
      this.zeichnen();
      if (text) ZUI.meldung(this.speicherOk ? text : text + ' (nur bis zum Neuladen: Browser-Speicher ist blockiert)');
    },
    ersetzen(neu, text) { this.z = neu; this.aendern(() => {}, text); this.autopilotStarten(); },
    // Läuft einmal pro Tag von selbst; der KI-Tagesplan kommt im Hintergrund nach.
    autopilotStarten(text) {
      const heute = this.heute();
      if (root.ZAutopilot.taeglich(this.z, this.lauf, heute)) { this.speicherOk = ZS.speichern(this.z); this.neuRechnen(); }
      this.zeichnen();
      if (text) ZUI.meldung(text);
      root.ZAutopilot.kiPlan(this.z, this.lauf, heute).then((plan) => {
        if (!plan) return;
        this.speicherOk = ZS.speichern(this.z);
        if (this.aktiv === 'heute') this.zeichnen();
      });
    },
    gehe(id) {
      if (!root.ZViews[id]) return;
      this.aktiv = id;
      if (root.history && root.history.replaceState) { try { root.history.replaceState(null, '', '#' + id); } catch (e) { /* Rahmen ohne History */ } }
      this.zeichnen();
      document.querySelector('main').scrollTop = 0;
      root.scrollTo(0, 0);
    },
    zeichnen() {
      const nav = document.getElementById('nav');
      const dringend = {};
      for (const a of this.lauf.aufgaben) if (a.prio === 'hoch' && a.ziel) dringend[a.ziel] = (dringend[a.ziel] || 0) + 1;
      nav.innerHTML = BEREICHE.map(([id, name]) => `<button type="button" data-gehe="${id}" aria-current="${id === this.aktiv}">${name}${dringend[id] ? `<span class="zahl" title="dringende Punkte">${dringend[id]}</span>` : ''}</button>`).join('');
      const v = root.ZViews[this.aktiv], main = document.getElementById('inhalt');
      const hinweis = this.z.beispiel
        ? `<div class="hinweis"><span>Du siehst Beispieldaten eines erfundenen Shops. Deine echten Produkte erscheinen hier automatisch, sobald der tägliche Lauf sie geholt hat.</span><button class="knopf klein" data-gehe="daten">Eigene Daten laden</button></div>`
        : !this.z.bestellungen.length && !['daten', 'labor', 'shopdoktor', 'fliessband', 'kanaele15', 'heutePosten', 'suchradar', 'community', 'studio', 'werkzeuge'].includes(this.aktiv)
          ? `<div class="hinweis"><span>Deine ${this.z.produkte.length} Produkte sind da. Für Umsatz, Kunden und Prognose fehlen noch Bestellungen: Shopify → Bestellungen → Exportieren → hier hochladen. Dauert 1 Minute.</span><button class="knopf klein" data-gehe="daten">Bestellungen hochladen</button></div>`
          : '';
      main.innerHTML = `<header class="kopf"><div><h1>${v.titel}</h1><p class="unterzeile">${v.unter}</p></div></header>${hinweis}<div id="ansicht"></div>`;
      v.zeichnen(document.getElementById('ansicht'), this);
    },
  };

  function start() {
    app.z = ZS.laden() || ZS.beispielDaten(app.heute());
    root.ZAutopilot.standard(app.z);
    app.neuRechnen();
    const hash = (root.location.hash || '').slice(1);
    if (root.ZViews[hash]) app.aktiv = hash;
    document.addEventListener('click', (e) => {
      const ziel = e.target.closest('[data-gehe]');
      if (ziel) { e.preventDefault(); app.gehe(ziel.dataset.gehe); }
    });
    app.autopilotStarten();
    root.ZLive.produkteLaden(app).then(() => root.ZLive.pruefen(app));
  }

  root.ZApp = app;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
