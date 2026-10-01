// Ansicht: Daten (Import, Produkte, Backup, Zurücksetzen).
(function (root) {
  const { ZS, ZUI } = root;
  const { h, eur, zahl, datum, tabelle, formDaten, meldung, kopieren } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  const VORLAGE = 'datum;kunde;produkt;menge;preis;kanal;pfad\n2026-09-28;anna@mail.de;LED-Lichtleiste 5 m;1;29,99;email;tiktok>email\n2026-09-28;anna@mail.de;Mini-Beamer HD;1;89,99;email;tiktok>email\n2026-09-29;ben@mail.de;Kabelloses Ladepad;2;24,99;instagram;instagram';

  V.daten = {
    titel: 'Daten',
    unter: 'Alles bleibt in diesem Browser auf deinem Gerät. Nichts wird hochgeladen. Mit dem Backup nimmst du deine Daten auf ein anderes Gerät mit.',
    zeichnen(el, app) {
      const { z } = app;
      const zeitraum = z.bestellungen.length ? `${datum(z.bestellungen.reduce((m, b) => (b.datum < m ? b.datum : m), z.bestellungen[0].datum))} bis ${datum(app.lauf.ctx.heute)}` : 'keine';
      el.innerHTML = `
        <div class="kpis">
          <div class="kpi"><div class="l">Bestellungen</div><div class="w">${zahl(z.bestellungen.length)}</div><div class="d leise">${zeitraum}</div></div>
          <div class="kpi"><div class="l">Produkte</div><div class="w">${zahl(z.produkte.length)}</div></div>
          <div class="kpi"><div class="l">Posts</div><div class="w">${zahl(z.posts.length)}</div></div>
          <div class="kpi"><div class="l">Konkurrenten</div><div class="w">${zahl(z.konkurrenten.length)}</div></div>
          <div class="kpi"><div class="l">Speicher</div><div class="w" style="font-size:18px">${app.speicherOk ? 'Browser' : 'nur Sitzung'}</div><div class="d leise">${z.beispiel ? 'Beispieldaten' : 'deine Daten'}</div></div>
        </div>
        <div class="raster r2">
          ${app.livePaket && !z.live ? `<section class="box betont" style="grid-column:1/-1"><h2>Live-Daten entsperren</h2>
            <p class="klein-text" style="margin-top:0">Der tägliche Autopilot hat deine Shop-Daten verschlüsselt abgelegt. Gib das Passwort ein, das als <code>ZENTRALE_SCHLUESSEL</code> gespeichert ist. Dieser Browser merkt es sich, danach lädt alles automatisch.</p>
            <form id="entsperren" class="reihe"><input id="live-pw" type="password" autocomplete="current-password" placeholder="Passwort" style="flex:1;min-width:0"><button class="knopf haupt">Entsperren</button></form>
            <div id="entsperren-fehler" class="minus klein-text" style="margin-top:6px"></div></section>` : ''}
          ${z.live ? `<section class="box" style="grid-column:1/-1"><h2>Live-Verbindung aktiv</h2><p style="margin:0"><span class="chip ok">Live</span> Shopify-Daten vom ${datum(z.live.stand)}. Der Autopilot holt jeden Morgen neue.</p>
            <div class="reihe" style="margin-top:10px"><button class="knopf klein" id="live-vergessen">Passwort auf diesem Gerät vergessen</button></div></section>` : ''}
          <section class="box" style="grid-column:1/-1"><h2>Automatisch mit dem Shop verbinden (einmalig, ca. 10 Minuten)</h2>
            <ol class="schritte">
              <li><strong>Shopify-Zugang erstellen:</strong> Shopify-Admin → Einstellungen → Apps → App entwickeln → neue App. Unter „Admin-API“ diese Rechte anhaken: <code>read_orders</code>, <code>read_products</code>, <code>read_inventory</code>. App installieren und den Admin-API-Token kopieren.</li>
              <li><strong>In GitHub eintragen:</strong> <a href="https://github.com/ziyabicilecommerce-hub/ai-cash-machine/settings/secrets/actions" target="_blank" rel="noopener">Repo → Settings → Secrets → Actions</a> und „New repository secret“:
                <code>SHOP</code> (Shop-Name ohne .myshopify.com), <code>SHOPIFY_TOKEN</code> (der Token), <code>ZENTRALE_SCHLUESSEL</code> (ein eigenes Passwort, mindestens 10 Zeichen).</li>
              <li><strong>Optional Telegram:</strong> <code>TELEGRAM_BOT_TOKEN</code> und <code>TELEGRAM_CHAT_ID</code>. Dann kommt der Tagesbericht jeden Morgen aufs Handy.</li>
            </ol>
            <p class="klein-text">Danach läuft alles von selbst: Jeden Morgen gegen 7 Uhr holt der Autopilot deine Bestellungen, die 8 Agenten rechnen, du bekommst den Bericht und diese Seite hat die neuen Zahlen. Deine Daten liegen nur verschlüsselt im öffentlichen Repo. Ohne das Passwort kann niemand sie lesen.</p></section>
          <section class="box" style="grid-column:1/-1"><h2>Bestellungen importieren (CSV)</h2>
            <p class="klein-text" style="margin-top:0">Export aus Shopify, WooCommerce, Etsy, Digistore oder einer Tabelle. Spalten: <code>datum</code>, <code>kunde</code>, <code>produkt</code>, <code>menge</code>, <code>preis</code>, <code>kanal</code>, optional <code>pfad</code> (z. B. <code>tiktok&gt;email</code>), <code>kosten</code>, <code>bestellung</code>. Trennzeichen ; oder , und Datum als 2026-09-28 oder 28.09.2026.</p>
            <div class="reihe" style="margin-bottom:8px"><label class="knopf" for="csv-datei">CSV-Datei wählen</label><input id="csv-datei" type="file" accept=".csv,text/csv,text/plain" hidden><button class="knopf klein" id="vorlage">Beispiel-Format einfügen</button></div>
            <textarea id="csv" rows="6" placeholder="oder hier einfügen …"></textarea>
            <div class="reihe" style="margin-top:10px">
              <label class="feld" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="ersetzen" ${z.beispiel ? 'checked' : ''}> Vorhandene Bestellungen ersetzen</label>
              <button class="knopf haupt" id="import-los">Importieren</button></div>
            <div id="import-ergebnis" class="klein-text" style="margin-top:8px"></div></section>
          <section class="box"><h2>Produkt anlegen</h2>
            <form id="produkt-neu" class="formular">
              <label class="feld" style="grid-column:1/-1">Name<input name="name" required></label>
              <label class="feld">Verkaufspreis €<input name="preis" type="number" step="0.01" min="0" required></label>
              <label class="feld">Einkauf €<input name="kosten" type="number" step="0.01" min="0" value="0"></label>
              <label class="feld">Kategorie<input name="kategorie" value="Allgemein"></label>
              <button class="knopf">Anlegen</button></form>
            <label class="feld" style="margin-top:14px">Shop-Name (für Bot und Mails)<input id="shopname" value="${h(z.einstellungen.shopName)}"></label></section>
          <section class="box"><h2>Produkte (${z.produkte.length})</h2>
            ${tabelle([{ t: 'Name' }, { t: 'Preis', z: 1 }, { t: 'Einkauf', z: 1 }, { t: '' }], z.produkte.map((p) => [h(p.name), eur(p.preis), eur(p.kosten || 0), `<button class="knopf klein" data-p-weg="${h(p.id)}">Löschen</button>`]))}</section>
          <section class="box"><h2>Backup</h2>
            <div class="reihe"><button class="knopf" id="backup-zeigen">Backup erzeugen</button><button class="knopf" id="backup-kopie" hidden>Kopieren</button></div>
            <textarea id="backup" rows="4" style="margin-top:10px" placeholder="Hier ein Backup einfügen, um es wiederherzustellen"></textarea>
            <div class="reihe" style="margin-top:8px"><button class="knopf" id="backup-laden">Backup wiederherstellen</button></div></section>
          <section class="box"><h2>Neu anfangen</h2>
            <p class="klein-text" style="margin-top:0">Beispieldaten zeigen dir jede Funktion an einem erfundenen Shop. „Alles leeren“ löscht alles in diesem Browser.</p>
            <div class="reihe"><button class="knopf" id="beispiel">Beispieldaten laden</button><button class="knopf" id="leeren">Alles leeren</button></div>
            <div class="reihe" id="leeren-bestaetigen" hidden style="margin-top:10px"><span class="minus">Wirklich alles löschen?</span><button class="knopf" id="leeren-ja">Ja, löschen</button><button class="knopf" id="leeren-nein">Abbrechen</button></div></section>
        </div>`;

      const ent = el.querySelector('#entsperren');
      if (ent) ent.addEventListener('submit', async (e) => {
        e.preventDefault();
        const knopf = ent.querySelector('button'); knopf.disabled = true; knopf.textContent = 'Prüft …';
        try { await root.ZLive.entsperren(app, el.querySelector('#live-pw').value); } catch (err) {
          el.querySelector('#entsperren-fehler').textContent = 'Das Passwort passt nicht. Es muss genau dem Secret ZENTRALE_SCHLUESSEL entsprechen.';
          knopf.disabled = false; knopf.textContent = 'Entsperren';
        }
      });
      const vergessen = el.querySelector('#live-vergessen');
      if (vergessen) vergessen.addEventListener('click', () => { root.ZLive.vergessen(); meldung('Passwort vergessen. Beim nächsten Öffnen wird es wieder abgefragt.'); });
      const csv = el.querySelector('#csv');
      el.querySelector('#vorlage').addEventListener('click', () => { csv.value = VORLAGE; });
      el.querySelector('#csv-datei').addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        const r = new FileReader(); r.onload = () => { csv.value = String(r.result); meldung(`${f.name} geladen`); }; r.readAsText(f);
      });
      el.querySelector('#import-los').addEventListener('click', () => {
        const text = csv.value.trim(); if (!text) { meldung('Erst CSV einfügen oder Datei wählen'); return; }
        const ersetzen = el.querySelector('#ersetzen').checked;
        const basis = ersetzen ? { ...ZS.leer(), einstellungen: z.einstellungen, faq: z.beispiel ? [] : z.faq, posts: z.beispiel ? [] : z.posts, plan: z.beispiel ? [] : z.plan } : JSON.parse(JSON.stringify(z));
        basis.beispiel = false;
        const r = ZS.bestellungenImportieren(basis, text);
        if (!r.importiert) { el.querySelector('#import-ergebnis').textContent = 'Nichts importiert. ' + r.fehler.slice(0, 3).join(' · '); return; }
        app.ersetzen(basis, `${r.importiert} Bestellungen importiert${r.fehler.length ? `, ${r.fehler.length} Zeilen übersprungen` : ''}`);
      });
      el.querySelector('#produkt-neu').addEventListener('submit', (e) => {
        e.preventDefault(); const d = formDaten(e.target);
        app.aendern((z) => {
          let id = d.name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '') || 'produkt';
          while (z.produkte.some((p) => p.id === id)) id += '-2';
          z.produkte.push({ id, name: d.name, preis: Number(d.preis) || 0, kosten: Number(d.kosten) || 0, kategorie: d.kategorie || 'Allgemein' });
        }, 'Produkt angelegt');
      });
      el.querySelector('#shopname').addEventListener('change', (e) => app.aendern((z) => { z.einstellungen.shopName = e.target.value.trim() || 'Mein Shop'; }, 'Shop-Name gespeichert'));
      el.querySelectorAll('[data-p-weg]').forEach((b) => b.addEventListener('click', () => app.aendern((z) => { z.produkte = z.produkte.filter((p) => p.id !== b.dataset.pWeg); }, 'Produkt gelöscht')));
      const bt = el.querySelector('#backup'), bk = el.querySelector('#backup-kopie');
      el.querySelector('#backup-zeigen').addEventListener('click', () => { bt.value = ZS.backupText(z); bk.hidden = false; });
      bk.addEventListener('click', () => kopieren(bt.value, bt));
      el.querySelector('#backup-laden').addEventListener('click', () => {
        try { app.ersetzen(ZS.backupLaden(bt.value), 'Backup wiederhergestellt'); } catch (e) { meldung(e instanceof SyntaxError ? 'Das Backup ist unvollständig. Bitte komplett einfügen.' : e.message); }
      });
      el.querySelector('#beispiel').addEventListener('click', () => app.ersetzen(ZS.beispielDaten(app.heute()), 'Beispieldaten geladen'));
      const best = el.querySelector('#leeren-bestaetigen');
      el.querySelector('#leeren').addEventListener('click', () => { best.hidden = false; });
      el.querySelector('#leeren-nein').addEventListener('click', () => { best.hidden = true; });
      el.querySelector('#leeren-ja').addEventListener('click', () => app.ersetzen({ ...ZS.leer(), einstellungen: z.einstellungen }, 'Alles geleert'));
    },
  };
})(window);
