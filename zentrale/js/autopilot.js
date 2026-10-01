// Autopilot: läuft einmal pro Tag beim Öffnen, ohne Klick. Hält Verlauf fest, füllt den
// Content-Plan auf, bereitet Texte vor und bestellt im Hintergrund den KI-Tagesplan.
(function (root) {
  const { ZA, ZKI } = root;

  function standard(z) {
    z.autopilot = { an: true, contentAuffuellen: true, letzterLauf: null, aktionen: [], plan: null, erledigt: {}, ...(z.autopilot || {}) };
    z.verlauf = z.verlauf || [];
    return z.autopilot;
  }

  function momentaufnahme(z, lauf) {
    const k = ZA.kennzahlen(ZA.imZeitraum(z.bestellungen, lauf.ctx.heute, 28), z.produkte);
    return { datum: null, umsatz28: k.umsatz, bestellungen28: k.bestellungen, kunden: lauf.ctx.kunden.kunden.length, dringend: lauf.aufgaben.filter((a) => a.prio === 'hoch').length, titel: lauf.aufgaben.filter((a) => a.prio === 'hoch').map((a) => a.titel) };
  }

  // Einmal pro Kalendertag. Gibt true zurück, wenn etwas geändert wurde (dann speichern + neu rechnen).
  function taeglich(z, lauf, heute) {
    const ap = standard(z);
    if (!ap.an || ap.letzterLauf === heute) return false;
    const aktionen = [];
    const snap = { ...momentaufnahme(z, lauf), datum: heute };
    z.verlauf = [...z.verlauf.filter((v) => v.datum !== heute), snap].slice(-90);

    if (ap.contentAuffuellen && root.ZContentIdeen) {
      const inSieben = z.plan.filter((p) => p.datum > heute && ZA.tagZahl(p.datum) - ZA.tagZahl(heute) <= 7);
      const fehlen = Math.max(0, 5 - inSieben.length);
      if (fehlen) {
        const belegt = new Set(inSieben.map((p) => p.datum));
        const ideen = root.ZContentIdeen(z, lauf.ctx.content);
        let tag = 1, n = 0;
        while (n < fehlen && tag <= 7) {
          const datum = ZA.datumAus(ZA.tagZahl(heute) + tag);
          if (!belegt.has(datum)) { const i = ideen[n % ideen.length]; z.plan.push({ id: `ap${heute}-${n}`, datum, plattform: i.plattform, text: i.text, status: 'Idee', vonAutopilot: true }); n++; }
          tag++;
        }
        aktionen.push({ art: 'content', text: `${n} Post-Ideen für die nächsten 7 Tage eingeplant`, ziel: 'content' });
      }
    }

    const gef = lauf.ctx.kunden.kunden.filter((k) => k.segment === 'Gefährdet');
    if (gef.length) aktionen.push({ art: 'kunden', text: `Rückhol-Liste mit ${gef.length} Stammkunden aktualisiert`, ziel: 'kunden' });
    const b = lauf.ctx.bundles[0];
    if (b) aktionen.push({ art: 'bundle', text: `Bestes Bundle berechnet: ${b.a.name} + ${b.b.name} für ${b.preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`, ziel: 'empfehlungen' });
    const alarm = lauf.ctx.konkurrenz.filter((k) => k.alarm);
    if (alarm.length) aktionen.push({ art: 'konkurrenz', text: `${alarm.length} Preissenkung${alarm.length > 1 ? 'en' : ''} bei der Konkurrenz entdeckt`, ziel: 'konkurrenz' });
    aktionen.push({ art: 'agenten', text: `8 Agenten haben ${lauf.aufgaben.length} Punkte geprüft, ${snap.dringend} davon dringend`, ziel: 'agenten' });

    ap.letzterLauf = heute;
    ap.aktionen = aktionen;
    ap.erledigt = { [heute]: (ap.erledigt && ap.erledigt[heute]) || [] };
    if (ap.plan && ap.plan.datum !== heute) ap.plan = null;
    return true;
  }

  function vergleich(z, heute) {
    const jetzt = z.verlauf.find((v) => v.datum === heute), vorher = [...z.verlauf].reverse().find((v) => v.datum < heute);
    if (!jetzt || !vorher) return null;
    const neueDringend = jetzt.titel.filter((t) => !vorher.titel.includes(t));
    const geloest = vorher.titel.filter((t) => !jetzt.titel.includes(t));
    return { vorher, jetzt, neueDringend, geloest };
  }

  function planOhneKI(lauf) {
    const top = lauf.aufgaben.filter((a) => a.prio !== 'info').slice(0, 3);
    return top.map((a, i) => `${i + 1}. ${a.titel}\n   ${a.text}`).join('\n\n') || 'Heute ist nichts Dringendes offen. Nutze die Zeit für neue Posts.';
  }

  // Holt den KI-Tagesplan im Hintergrund, höchstens einmal pro Tag.
  async function kiPlan(z, lauf, heute) {
    const ap = standard(z);
    if (ap.plan && ap.plan.datum === heute) return null;
    const liste = lauf.aufgaben.slice(0, 14).map((a) => `- [${a.prio}] ${a.titel}: ${a.text}`).join('\n');
    try {
      const r = await ZKI.frage('Du bist mein persönlicher E-Commerce-Assistent. Deutsch, per du, knapp, ohne Markdown, ohne Emojis.',
        [{ role: 'user', content: `Analyse meiner Agenten von heute:\n${liste}\n\nSag mir in maximal 6 Zeilen, welche 3 Dinge ich HEUTE tun soll, in welcher Reihenfolge und warum. Beginne direkt mit Punkt 1.` }], 450);
      ap.plan = { datum: heute, text: r.text, quelle: r.dienst };
    } catch (e) {
      ap.plan = { datum: heute, text: planOhneKI(lauf), quelle: 'ohne KI (kostenlose KI gerade nicht erreichbar)' };
    }
    return ap.plan;
  }

  root.ZAutopilot = { standard, taeglich, vergleich, kiPlan, planOhneKI };
})(window);
