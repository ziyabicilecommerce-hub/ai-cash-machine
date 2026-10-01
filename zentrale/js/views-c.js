// Ansichten: Content (Analyse, Planer, KI-Texte), Support-Bot.
(function (root) {
  const { ZA, ZUI, ZKI } = root;
  const { h, zahl, datum, tabelle, balken, formDaten, meldung, kopieren } = ZUI;
  const V = (root.ZViews = root.ZViews || {});
  const PLATTFORMEN = ['TikTok', 'Instagram', 'YouTube Shorts', 'Facebook', 'LinkedIn', 'X', 'Pinterest', 'Threads'];
  const LIMIT = { X: 280, Threads: 500, TikTok: 2200, Instagram: 2200, 'YouTube Shorts': 100, Facebook: 2000, LinkedIn: 3000, Pinterest: 500 };

  function ideenOhneKI(z, c) {
    const hooks = [...new Set(c.top.map((p) => p.titel.split(' ').slice(0, 3).join(' ')))];
    const plattform = (c.plattformen.find((p) => p.belastbar) || { key: 'TikTok' }).key;
    const alle = ['Vorher vs. Nachher:', 'POV:', '3 Gründe für', 'Niemand redet über', 'Test nach 30 Tagen:', 'Der Fehler, den alle machen mit', 'So nutzt du', ...hooks];
    return Array.from({ length: 7 }, (_, i) => ({ plattform: i % 3 === 2 ? 'Instagram' : plattform, text: `${alle[i % alle.length]} ${(z.produkte[i % Math.max(z.produkte.length, 1)] || { name: 'dein Produkt' }).name}` }));
  }

  V.content = {
    titel: 'Content',
    unter: 'Was bei deinen Posts funktioniert, dein Plan für die nächsten Tage und KI-Texte für alle Plattformen aus einem einzigen Entwurf.',
    zeichnen(el, app) {
      const { z } = app, c = app.lauf.ctx.content, heute = app.heute();
      const plan = [...z.plan].sort((a, b) => (a.datum < b.datum ? -1 : 1)).filter((p) => p.datum >= ZA.datumAus(ZA.tagZahl(heute) - 7));
      const grp = (liste) => balken(liste.map((g) => ({ name: g.key + (g.belastbar ? '' : ' *'), wert: g.rate, posts: g.posts })), (w, e) => `${zahl(w, 1)} % · ${e.posts} Posts`);
      el.innerHTML = `
        <div class="raster r3" style="margin-bottom:16px">
          <section class="box"><h2>Interaktionsrate pro Plattform</h2>${c.plattformen.length ? grp(c.plattformen) : '<p class="klein-text">Noch keine Posts erfasst.</p>'}</section>
          <section class="box"><h2>Beste Uhrzeit</h2>${c.uhrzeiten.length ? grp(c.uhrzeiten) : ''}</section>
          <section class="box"><h2>Bester Wochentag</h2>${c.wochentage.length ? grp(c.wochentage) : ''}</section>
        </div>
        <p class="klein-text" style="margin-top:-6px">Interaktionsrate = (Likes + Kommentare + Shares) / Aufrufe. Mit * markiert: weniger als 3 Posts, noch nicht aussagekräftig.</p>
        <div class="raster r2">
          <section class="box"><h2>Wörter, die ziehen</h2>
            ${c.starkeWoerter.length ? tabelle([{ t: 'Wort' }, { t: 'In Top-Posts', z: 1 }, { t: 'Im Rest', z: 1 }, { t: 'Stärke', z: 1 }], c.starkeWoerter.map((w) => [h(w.wort), w.top, w.rest, zahl(w.staerke, 1) + '×'])) : '<p class="klein-text">Ab etwa 8 Posts erkennbar.</p>'}
            <h2 style="margin-top:16px">Top-Posts</h2>
            ${tabelle([{ t: 'Post' }, { t: 'Aufrufe', z: 1 }, { t: 'Rate', z: 1 }], c.top.map((p) => [`${h(p.titel)}<div class="klein-text">${h(p.plattform)} · ${datum(p.datum)} · ${p.stunde} Uhr</div>`, zahl(p.views), zahl(p.rate * 100, 1) + ' %']))}</section>
          <section class="box"><h2>Plan</h2>
            ${plan.length ? `<ul class="aufgaben">${plan.map((p) => `<li class="aufgabe" data-prio="${p.status === 'gepostet' ? 'info' : p.datum < heute ? 'hoch' : 'mittel'}"><span class="t">${datum(p.datum)} · ${h(p.plattform)}</span><span class="x">${h(p.text)}</span>
              <span class="reihe"><button class="knopf klein" data-status="${h(p.id)}">${p.status === 'gepostet' ? 'Gepostet ✓' : 'Als gepostet markieren'}</button><button class="knopf klein" data-weg="${h(p.id)}">Löschen</button></span></li>`).join('')}</ul>` : '<p class="klein-text">Noch nichts geplant.</p>'}
            <form id="plan-neu" class="formular" style="margin-top:12px">
              <label class="feld">Datum<input name="datum" type="date" value="${heute}" required></label>
              <label class="feld">Plattform<select name="plattform">${PLATTFORMEN.map((p) => `<option>${p}</option>`).join('')}</select></label>
              <label class="feld" style="grid-column:1/-1">Idee / Text<input name="text" required placeholder="z. B. POV: dein Zimmer um 22 Uhr"></label>
              <button class="knopf">Einplanen</button></form>
            <div class="reihe" style="margin-top:12px"><button class="knopf haupt" id="ideen-los">7 Ideen für diese Woche</button></div>
            <div id="ideen" style="margin-top:10px"></div></section>
          <section class="box" style="grid-column:1/-1"><h2>Ein Entwurf, alle Plattformen</h2>
            <label class="feld">Dein Text oder deine Idee<textarea id="entwurf" rows="3" placeholder="z. B. Unsere LED-Leiste macht jedes Zimmer in 5 Minuten zum Gaming-Setup. Heute 20 % Rabatt."></textarea></label>
            <div class="reihe" style="margin-top:10px"><button class="knopf haupt" id="umschreiben">Für alle Plattformen umschreiben</button><button class="knopf" id="umschreiben-kopie" hidden>Alles kopieren</button></div>
            <div class="ki-text" id="varianten" style="margin-top:12px"></div></section>
          <section class="box" style="grid-column:1/-1"><h2>Post-Ergebnisse eintragen</h2>
            <form id="post-neu" class="formular">
              <label class="feld">Datum<input name="datum" type="date" value="${heute}" required></label>
              <label class="feld">Uhrzeit (Stunde)<input name="stunde" type="number" min="0" max="23" value="19"></label>
              <label class="feld">Plattform<select name="plattform">${PLATTFORMEN.map((p) => `<option>${p}</option>`).join('')}</select></label>
              <label class="feld" style="grid-column:1/-1">Titel / Hook<input name="titel" required></label>
              <label class="feld">Aufrufe<input name="views" type="number" min="0" required></label>
              <label class="feld">Likes<input name="likes" type="number" min="0" value="0"></label>
              <label class="feld">Kommentare<input name="kommentare" type="number" min="0" value="0"></label>
              <label class="feld">Shares<input name="shares" type="number" min="0" value="0"></label>
              <button class="knopf haupt">Speichern</button></form></section>
        </div>`;

      el.querySelector('#plan-neu').addEventListener('submit', (e) => {
        e.preventDefault(); const d = formDaten(e.target);
        app.aendern((z) => { z.plan.push({ id: 'pl' + Date.now(), datum: d.datum, plattform: d.plattform, text: d.text, status: 'geplant' }); }, 'Eingeplant');
      });
      el.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => app.aendern((z) => { const p = z.plan.find((x) => x.id === b.dataset.status); if (p) p.status = p.status === 'gepostet' ? 'geplant' : 'gepostet'; })));
      el.querySelectorAll('[data-weg]').forEach((b) => b.addEventListener('click', () => app.aendern((z) => { z.plan = z.plan.filter((x) => x.id !== b.dataset.weg); }, 'Gelöscht')));
      el.querySelector('#post-neu').addEventListener('submit', (e) => {
        e.preventDefault(); const d = formDaten(e.target);
        app.aendern((z) => { z.posts.unshift({ id: 'P' + Date.now(), datum: d.datum, stunde: Number(d.stunde) || 0, plattform: d.plattform, titel: d.titel, views: Number(d.views) || 0, likes: Number(d.likes) || 0, kommentare: Number(d.kommentare) || 0, shares: Number(d.shares) || 0 }); }, 'Post gespeichert');
      });

      const ideenKnopf = el.querySelector('#ideen-los'), ideenEl = el.querySelector('#ideen');
      ideenKnopf.addEventListener('click', async () => {
        ideenKnopf.disabled = true; ideenKnopf.textContent = 'Denkt nach …';
        let ideen, quelle = 'ohne KI';
        try {
          const kontext = `Produkte: ${z.produkte.map((p) => p.name).join(', ')}. Beste Plattformen: ${c.plattformen.slice(0, 3).map((p) => p.key).join(', ')}. Starke Wörter: ${c.starkeWoerter.map((w) => w.wort).join(', ')}. Beste Hooks bisher: ${c.top.map((p) => p.titel).join(' / ')}.`;
          const r = await ZKI.frage('Du bist Social-Media-Stratege für Online-Shops. Antworte nur mit den verlangten Zeilen, ohne Nummerierung, ohne Emojis.',
            [{ role: 'user', content: `${kontext}\nGib mir genau 7 Post-Ideen, je eine Zeile im Format: Plattform | Hook und Inhalt in einem Satz` }], 600);
          ideen = r.text.split('\n').map((l) => l.replace(/^[\s\-*\d.)]+/, '')).filter((l) => l.includes('|')).map((l) => { const [p, ...t] = l.split('|'); return { plattform: p.trim(), text: t.join('|').trim() }; }).filter((x) => x.text).slice(0, 7);
          quelle = r.dienst;
          if (ideen.length < 3) throw new Error('Format');
        } catch (e) { ideen = ideenOhneKI(z, c); }
        ideenEl.innerHTML = `<ul class="aufgaben">${ideen.map((i) => `<li class="aufgabe" data-prio="info"><span class="t">${h(i.plattform)}</span><span class="x">${h(i.text)}</span></li>`).join('')}</ul>
          <div class="reihe" style="margin-top:8px"><button class="knopf" id="ideen-plan">Alle 7 auf die nächsten Tage verteilen</button><span class="klein-text">Quelle: ${h(quelle)}</span></div>`;
        ideenEl.querySelector('#ideen-plan').addEventListener('click', () => app.aendern((z) => {
          ideen.forEach((i, n) => z.plan.push({ id: 'pl' + Date.now() + n, datum: ZA.datumAus(ZA.tagZahl(heute) + n + 1), plattform: PLATTFORMEN.includes(i.plattform) ? i.plattform : 'TikTok', text: i.text, status: 'geplant' }));
        }, '7 Posts eingeplant'));
        ideenKnopf.disabled = false; ideenKnopf.textContent = 'Neue Ideen';
      });

      const um = el.querySelector('#umschreiben'), out = el.querySelector('#varianten'), kopie = el.querySelector('#umschreiben-kopie');
      um.addEventListener('click', async () => {
        const text = el.querySelector('#entwurf').value.trim();
        if (!text) { meldung('Erst einen Entwurf eingeben'); return; }
        um.disabled = true; um.textContent = 'Schreibt …';
        try {
          const r = await ZKI.frage('Du passt Social-Media-Texte an Plattformen an. Deutsch. Ohne Markdown. Halte die Zeichenlimits ein.',
            [{ role: 'user', content: `Schreib diesen Text passend für ${PLATTFORMEN.join(', ')} um. Pro Plattform: Name in eigener Zeile, darunter der fertige Text mit passenden Hashtags. Limits: ${Object.entries(LIMIT).map(([k, v]) => `${k} ${v}`).join(', ')} Zeichen.\n\nText: ${text}` }], 1400);
          out.textContent = r.text + `\n\n(erstellt mit ${r.dienst})`;
        } catch (e) {
          const tags = (text.match(/[A-Za-zÄÖÜäöüß]{5,}/g) || []).slice(0, 3).map((w) => '#' + w.toLowerCase());
          out.textContent = PLATTFORMEN.map((p) => { const t = `${text} ${tags.join(' ')}`; return `${p}\n${t.length > LIMIT[p] ? t.slice(0, LIMIT[p] - 1) + '…' : t}`; }).join('\n\n') + '\n\n(Ohne KI gekürzt: kostenlose KI gerade nicht erreichbar.)';
        }
        um.disabled = false; um.textContent = 'Nochmal umschreiben'; kopie.hidden = false;
      });
      kopie.addEventListener('click', () => kopieren(out.textContent));
    },
  };

  const wortStamm = (w) => w.replace(/(ungen|ung|en|er|es|e|n|s)$/, '');
  const woerter = (t) => new Set((String(t).toLowerCase().match(/[a-zäöüß0-9]{3,}/g) || []).map(wortStamm).filter((w) => w.length >= 3));

  // Offline-Antwort: die FAQ mit der größten Wortüberschneidung, nur wenn sie deutlich passt.
  function faqTreffer(faq, frage) {
    const f = woerter(frage);
    let best = null;
    for (const e of faq) {
      const q = woerter(e.frage + ' ' + e.antwort), w = woerter(e.frage);
      let s = 0; for (const x of f) { if (w.has(x)) s += 2; else if (q.has(x)) s += 1; }
      s /= Math.sqrt(Math.max(f.size, 1));
      if (!best || s > best.s) best = { e, s };
    }
    return best && best.s >= 0.9 ? best.e : null;
  }

  V.support = {
    titel: 'Support-Bot',
    unter: 'Dein Kunden-Bot beantwortet Fragen nur mit dem, was du hier hinterlegst. Was er nicht weiß, gibt er an dich weiter, statt etwas zu erfinden.',
    zeichnen(el, app) {
      const { z } = app;
      const verlauf = (el._verlauf = el._verlauf || [{ von: 'bot', text: 'Hallo! Wie kann ich dir helfen?' }]);
      el.innerHTML = `
        <div class="raster r2">
          <section class="box"><h2>Testen wie ein Kunde</h2>
            <div class="chat" id="chat" aria-live="polite">${verlauf.map((m) => `<div class="blase ${m.von}">${h(m.text)}${m.quelle ? `<span class="quelle">${h(m.quelle)}</span>` : ''}</div>`).join('')}</div>
            <form id="frage-form" class="reihe" style="margin-top:10px"><input id="frage" style="flex:1" placeholder="z. B. Wann kommt mein Paket?" autocomplete="off"><button class="knopf haupt">Senden</button></form>
            <div class="reihe" style="margin-top:8px">${['Kann ich das zurückschicken?', 'Zahlung mit Klarna?', 'Habt ihr Gutscheine?'].map((q) => `<button class="knopf klein" data-q="${h(q)}">${h(q)}</button>`).join('')}</div></section>
          <section class="box"><h2>Wissen des Bots (${z.faq.length})</h2>
            ${z.faq.length ? `<ul class="aufgaben">${z.faq.map((f, i) => `<li class="aufgabe" data-prio="info"><span class="t">${h(f.frage)}</span><span class="x">${h(f.antwort)}</span><button class="knopf klein" data-faq-weg="${i}">Löschen</button></li>`).join('')}</ul>` : '<p class="klein-text">Noch leer.</p>'}
            <form id="faq-neu" class="stapel" style="margin-top:12px;gap:8px">
              <label class="feld">Frage<input name="frage" required placeholder="z. B. Gibt es Gutscheine?"></label>
              <label class="feld">Antwort<textarea name="antwort" rows="2" required></textarea></label>
              <div class="reihe"><button class="knopf">Hinzufügen</button></div></form></section>
        </div>`;
      const chat = el.querySelector('#chat'); chat.scrollTop = chat.scrollHeight;
      const senden = async (frage) => {
        if (!frage) return;
        verlauf.push({ von: 'kunde', text: frage }, { von: 'bot', text: '…' });
        this.zeichnen(el, app);
        const treffer = faqTreffer(z.faq, frage);
        let antwort;
        try {
          const wissen = z.faq.map((f) => `F: ${f.frage}\nA: ${f.antwort}`).join('\n\n');
          const r = await ZKI.frage(`Du bist der freundliche Kundenservice von „${z.einstellungen.shopName}“. Antworte auf Deutsch, kurz, per du. Nutze AUSSCHLIESSLICH dieses Wissen:\n\n${wissen}\n\nWenn die Antwort dort nicht steht, sag ehrlich, dass du das an das Team weitergibst und sie sich innerhalb von 24 Stunden melden. Erfinde nichts.`,
            verlauf.filter((m) => m.text !== '…').slice(-6).map((m) => ({ role: m.von === 'kunde' ? 'user' : 'assistant', content: m.text })), 300);
          antwort = { von: 'bot', text: r.text, quelle: `KI (${r.dienst}) mit deinem Wissen` };
        } catch (e) {
          antwort = treffer ? { von: 'bot', text: treffer.antwort, quelle: `Antwort aus: „${treffer.frage}“` }
            : { von: 'bot', text: 'Gute Frage! Das gebe ich an unser Team weiter. Wir melden uns innerhalb von 24 Stunden bei dir.', quelle: 'Nicht im Wissen: an dich weitergeleitet' };
        }
        verlauf[verlauf.length - 1] = antwort;
        this.zeichnen(el, app);
        el.querySelector('#frage').focus();
      };
      el.querySelector('#frage-form').addEventListener('submit', (e) => { e.preventDefault(); senden(el.querySelector('#frage').value.trim()); });
      el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => senden(b.dataset.q)));
      el.querySelector('#faq-neu').addEventListener('submit', (e) => {
        e.preventDefault(); const d = formDaten(e.target);
        app.aendern((z) => { z.faq.push({ frage: d.frage, antwort: d.antwort }); }, 'Bot weiß jetzt mehr');
      });
      el.querySelectorAll('[data-faq-weg]').forEach((b) => b.addEventListener('click', () => app.aendern((z) => { z.faq.splice(Number(b.dataset.faqWeg), 1); }, 'Gelöscht')));
    },
  };

  root.ZSupport = { faqTreffer };
  root.ZContentIdeen = ideenOhneKI;
})(window);
