// Agenten-Team: jeder Agent wertet einen Bereich aus und liefert priorisierte Aufgaben.
(function (root) {
  const ZA = root.ZA;
  const eur = (x) => (Math.round(x * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const pct = (x) => (x > 0 ? '+' : '') + x.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';

  function umsatzAgent(z, ctx) {
    const f = [];
    if (!z.bestellungen.length) return [{ prio: 'hoch', titel: 'Bestellungen hochladen: dann rechnen alle Agenten mit echten Zahlen', text: 'Shopify-Admin → Bestellungen → Exportieren → „Alle Bestellungen“ als CSV → hier unter „Daten“ hochladen. Dauert eine Minute, E-Mails werden dabei nicht gespeichert.', ziel: 'daten' }];
    const jetzt = ZA.kennzahlen(ZA.imZeitraum(z.bestellungen, ctx.heute, 28), z.produkte);
    const vorher = ZA.kennzahlen(ZA.imZeitraum(z.bestellungen, ZA.datumAus(ZA.tagZahl(ctx.heute) - 28), 28), z.produkte);
    if (vorher.umsatz) {
      const d = ((jetzt.umsatz - vorher.umsatz) / vorher.umsatz) * 100;
      f.push({ prio: d < -10 ? 'hoch' : 'info', titel: `Umsatz 28 Tage: ${eur(jetzt.umsatz)} (${pct(d)})`, text: `Vorher ${eur(vorher.umsatz)}. Warenkorb ${eur(jetzt.warenkorb)}${z.produkte.some((p) => p.kosten > 0) ? `, Marge ${jetzt.margeProzent} %` : ''}.`, ziel: 'uebersicht' });
    }
    if (ctx.prognose.punkte.length) {
      const vier = ZA.summe(ctx.prognose.punkte.slice(0, 4).map((p) => p.wert));
      f.push({ prio: ctx.prognose.trendProWoche < 0 ? 'hoch' : 'info', titel: `Prognose nächste 4 Wochen: ${eur(vier)}`, text: `Trend ${ctx.prognose.trendProWoche >= 0 ? '+' : ''}${eur(ctx.prognose.trendProWoche)} pro Woche. Passgenauigkeit der Trendlinie R² ${ctx.prognose.r2}.`, ziel: 'uebersicht' });
    }
    return f;
  }

  function kundenAgent(z, ctx) {
    const f = [], ka = ctx.kunden;
    const gef = ka.kunden.filter((k) => k.segment === 'Gefährdet');
    if (gef.length) {
      const wert = ZA.summe(gef.map((k) => k.umsatz));
      f.push({ prio: 'hoch', titel: `${gef.length} Stammkunden drohen abzuspringen`, text: `Sie haben zusammen ${eur(wert)} ausgegeben. Schick ihnen einen Rückhol-Gutschein (z. B. 10 %).`, aktion: 'Rückhol-Liste öffnen', ziel: 'kunden' });
    }
    const champ = ka.kunden.filter((k) => k.segment === 'Champions').length;
    if (champ) f.push({ prio: 'mittel', titel: `${champ} Champions: frag nach Bewertungen und Videos`, text: 'Deine besten Kunden kaufen oft und kürzlich. Sie sind ideal für Bewertungen, Empfehlungen und Kunden-Videos.', ziel: 'kunden' });
    const neu = ka.kunden.filter((k) => k.segment === 'Neu').length;
    if (neu) f.push({ prio: 'mittel', titel: `${neu} Neukunden zum zweiten Kauf bringen`, text: `Der übliche Abstand zwischen zwei Käufen liegt bei ${ka.typAbstand} Tagen. Plane eine Nachkauf-Mail nach etwa ${Math.round(ka.typAbstand * 0.8)} Tagen.`, ziel: 'kunden' });
    return f;
  }

  function empfehlungsAgent(z, ctx) {
    const b = ctx.bundles[0];
    if (!b) return [{ prio: 'info', titel: 'Noch keine starken Kauf-Paare', text: 'Ab etwa 3 gemeinsamen Käufen pro Paar schlage ich Bundles vor.', ziel: 'empfehlungen' }];
    return [{ prio: 'hoch', titel: `Bundle anlegen: ${b.a.name} + ${b.b.name}`, text: `${b.anzahl}× zusammen gekauft, ${b.lift}× häufiger als Zufall. Bundle-Preis ${eur(b.preis)} statt ${eur(b.einzeln)}, Marge ${b.margeProzent} %.`, ziel: 'empfehlungen' }];
  }

  function preisAgent(z, ctx) {
    const f = [];
    for (const p of z.produkte) {
      const gesch = ZA.elastizitaetSchaetzen(z.bestellungen, p.id);
      const e = gesch ? gesch.wert : z.einstellungen.elastizitaet;
      const emp = ZA.preisEmpfehlung(p, e);
      if (gesch && e > -1 && p.kosten) {
        const neu = Math.floor(p.preis * 1.15) + 0.99, menge = (neu / p.preis) ** e;
        const plus = (((neu - p.kosten) * menge) / (p.preis - p.kosten) - 1) * 100;
        f.push({ prio: 'hoch', titel: `${p.name}: Preis auf ${eur(neu)} erhöhen`, text: `Dein Preistest zeigt: Die Nachfrage reagiert kaum (Elastizität ${e}). Erwartet: Absatz ${pct((menge - 1) * 100)}, Gewinn ${pct(plus)}.`, ziel: 'preise' });
        continue;
      }
      if (emp.optimal && Math.abs(emp.optimal - p.preis) / p.preis > 0.05 && emp.gewinnAenderung > 3) {
        const quelle = gesch ? `Elastizität ${e}, gemessen an deinen Verkäufen` : `Elastizität ${e} angenommen, noch kein Preistest vorhanden`;
        f.push({ prio: gesch ? (emp.gewinnAenderung > 10 ? 'hoch' : 'mittel') : 'info', titel: `${p.name}: ${eur(emp.optimal)} ${gesch ? 'einführen' : 'testen'}`, text: `Statt ${eur(p.preis)}. Erwartet: Absatz ${pct(emp.mengenAenderung)}, Gewinn ${pct(emp.gewinnAenderung)} (${quelle}).`, ziel: 'preise' });
      }
    }
    return f.sort((a, b) => RANG[a.prio] - RANG[b.prio]).slice(0, 3);
  }

  function kanalAgent(z, ctx) {
    const f = [], att = ctx.attribution.filter((k) => k.roas !== null);
    if (!att.length) return [{ prio: 'info', titel: 'Werbeausgaben eintragen', text: 'Trag ein, was du pro Monat je Kanal ausgibst. Dann zeige ich dir, wo sich das Geld lohnt.', ziel: 'kanaele' }];
    const best = [...att].sort((a, b) => b.roas - a.roas)[0], schlecht = att.filter((k) => k.roas < 2);
    f.push({ prio: 'mittel', titel: `Stärkster Kanal: ${best.kanal} (ROAS ${best.roas})`, text: `Jeder Euro dort bringt ${eur(best.roas)} Umsatz (Positions-Modell).`, ziel: 'kanaele' });
    for (const k of schlecht) f.push({ prio: 'hoch', titel: `${k.kanal} lohnt sich kaum (ROAS ${k.roas})`, text: `Kosten ${eur(k.kosten)}, zugeordneter Umsatz ${eur(k.umsatz)}. Budget kürzen oder Anzeigen neu testen.`, ziel: 'kanaele' });
    return f;
  }

  function konkurrenzAgent(z, ctx) {
    return ctx.konkurrenz.filter((k) => k.alarm || k.lage === 'teurer').map((k) => ({
      prio: k.alarm ? 'hoch' : 'mittel',
      titel: k.alarm ? `${k.name} hat den Preis gesenkt (${pct(k.aenderung)})` : `Du bist ${pct(k.diff)} teurer als ${k.name}`,
      text: k.mein ? `${k.name}: ${eur(k.letzter.preis)}, dein ${k.mein.name}: ${eur(k.mein.preis)}. Mit Bundle oder Gratis-Versand kontern statt nur den Preis zu senken.` : '',
      ziel: 'konkurrenz',
    }));
  }

  function contentAgent(z, ctx) {
    const f = [], c = ctx.content;
    if (c.plattformen.length && c.plattformen[0].belastbar) {
      const p = c.plattformen[0], u = c.uhrzeiten[0], w = c.wochentage[0];
      f.push({ prio: 'mittel', titel: `Poste mehr auf ${p.key}, am besten ${w.key} ${u.key} Uhr`, text: `${p.key} hat ${p.rate} % Interaktionsrate. Das Zeitfenster ${u.key} Uhr bringt ${u.rate} %.`, ziel: 'content' });
    }
    if (c.starkeWoerter.length) f.push({ prio: 'info', titel: `Diese Wörter ziehen: ${c.starkeWoerter.slice(0, 3).map((w) => w.wort).join(', ')}`, text: 'Sie kommen in deinen besten Posts deutlich öfter vor als im Rest.', ziel: 'content' });
    const bald = z.plan.filter((p) => p.datum >= ctx.heute && ZA.tagZahl(p.datum) - ZA.tagZahl(ctx.heute) <= 7).length;
    if (bald < 4) f.push({ prio: 'hoch', titel: `Nur ${bald} Posts für die nächsten 7 Tage geplant`, text: 'Für Wachstum sind mindestens 4 bis 7 Posts pro Woche nötig. Lass dir im Content-Bereich Ideen machen.', ziel: 'content' });
    return f;
  }

  function supportAgent(z) {
    if (z.faq.length < 5) return [{ prio: 'mittel', titel: `Support-Bot kennt erst ${z.faq.length} Antworten`, text: 'Mit Antworten zu Versand, Rückgabe, Zahlung und Produkten erledigt der Bot die meisten Fragen allein.', ziel: 'support' }];
    return [{ prio: 'info', titel: `Support-Bot ist mit ${z.faq.length} Antworten bereit`, text: 'Teste ihn mit einer typischen Kundenfrage.', ziel: 'support' }];
  }

  const TEAM = [
    { id: 'umsatz', name: 'Umsatz-Agent', aufgabe: 'Verfolgt Umsatz, Marge und Prognose', lauf: umsatzAgent },
    { id: 'kunden', name: 'Kunden-Agent', aufgabe: 'Findet abspringende und wertvolle Kunden', lauf: kundenAgent },
    { id: 'empfehlung', name: 'Empfehlungs-Agent', aufgabe: 'Sucht Cross-Sell-Paare und Bundles', lauf: empfehlungsAgent },
    { id: 'preis', name: 'Preis-Agent', aufgabe: 'Berechnet gewinnstärkere Preise', lauf: preisAgent },
    { id: 'kanal', name: 'Kanal-Agent', aufgabe: 'Bewertet Werbekanäle nach Rendite', lauf: kanalAgent },
    { id: 'konkurrenz', name: 'Konkurrenz-Agent', aufgabe: 'Beobachtet Preise der Konkurrenz', lauf: konkurrenzAgent },
    { id: 'content', name: 'Content-Agent', aufgabe: 'Wertet Posts aus und füllt den Plan', lauf: contentAgent },
    { id: 'support', name: 'Support-Agent', aufgabe: 'Hält den Kunden-Bot aktuell', lauf: supportAgent },
  ];

  function volleWochen(reihe, heute) {
    const letzte = reihe[reihe.length - 1];
    return letzte && ZA.tagZahl(letzte.woche) + 6 > ZA.tagZahl(heute) ? reihe.slice(0, -1) : reihe;
  }

  function kontext(z) {
    const heute = ZA.heuteAus(z.bestellungen), analyse = ZA.koKaeufe(z.bestellungen);
    return {
      heute,
      reihe: volleWochen(ZA.wochenReihe(z.bestellungen), heute),
      get prognose() { return this._p || (this._p = ZA.prognose(this.reihe, 8)); },
      analyse,
      bundles: ZA.bundleVorschlaege(analyse, z.produkte, (z.einstellungen.rabatt || 12) / 100),
      kunden: ZA.kundenAnalyse(z.bestellungen, heute),
      attribution: ZA.attribution(z.bestellungen, 'position', z.ausgaben),
      konkurrenz: ZA.konkurrenzLage(z.konkurrenten, z.produkte),
      content: ZA.contentAnalyse(z.posts),
    };
  }

  const RANG = { hoch: 0, mittel: 1, info: 2 };

  function alleLaufen(z) {
    const ctx = kontext(z);
    const berichte = TEAM.map((a) => {
      let funde = [];
      try { funde = a.lauf(z, ctx); } catch (e) { funde = [{ prio: 'info', titel: 'Konnte nicht rechnen', text: String(e.message || e) }]; }
      return { ...a, funde: funde.map((x) => ({ ...x, agent: a.name })) };
    });
    const aufgaben = berichte.flatMap((b) => b.funde).sort((a, b) => RANG[a.prio] - RANG[b.prio]);
    return { ctx, berichte, aufgaben };
  }

  root.ZAgenten = { TEAM, kontext, alleLaufen, eur, pct };
})(typeof window !== 'undefined' ? window : globalThis);
