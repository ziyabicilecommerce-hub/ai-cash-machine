// Engpass-Rechnung (nach NEULAND OS "Engpasswechsel"): Kapazitaet je Schritt = verfuegbar / Bedarf je
// Auftrag (abgerundet), die kleinste Kapazitaet begrenzt den ganzen Ablauf. Verschieben aendert nur die
// Verteilung, nicht die Summe. Exakte Bruchrechnung (BigInt), damit 0,3 / 0,1 wirklich 3 ergibt.
// Laeuft im Browser (Zentrale) und in Node (Engpass-Chef auf GitHub) - gleiche Rechnung an beiden Stellen.
(function (root) {
  function zahl(wert, name, min = 0, max = 1e9, ganz = false) {
    if (typeof wert !== 'number' || !Number.isFinite(wert) || wert < min || wert > max || (ganz && !Number.isInteger(wert))) {
      throw new Error(`${name}: ${ganz ? 'ganze Zahl' : 'Zahl'} zwischen ${min} und ${max} eingeben.`);
    }
    return wert;
  }

  function bruch(wert) {
    const [mantisse, exp = '0'] = String(wert).toLowerCase().split('e');
    const [ganz, rest = ''] = mantisse.split('.');
    const ziffern = `${ganz}${rest}`;
    const skala = rest.length - Number(exp);
    return skala >= 0 ? { n: BigInt(ziffern), d: 10n ** BigInt(skala) } : { n: BigInt(ziffern) * 10n ** BigInt(-skala), d: 1n };
  }
  const plus = (a, b) => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
  const minus = (a, b) => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
  const alsZahl = (a) => Number(a.n) / Number(a.d);
  const abgerundet = (a, b) => Number((a.n * b.d) / (a.d * b.n));

  // ablauf: {auftraege, schritte: [{id, name, verfuegbar, jeAuftrag}], verschiebung?: {von, nach, menge}}
  function analyse(ablauf) {
    if (!ablauf || typeof ablauf !== 'object') throw new Error('Ein Ablauf ist erforderlich.');
    zahl(ablauf.auftraege, 'Erwartete Aufträge', 0, 1e9, true);
    if (!Array.isArray(ablauf.schritte) || ablauf.schritte.length < 2 || ablauf.schritte.length > 12) throw new Error('Der Ablauf braucht 2 bis 12 Schritte.');
    const ids = new Set();
    for (const s of ablauf.schritte) {
      if (!s || typeof s.id !== 'string' || !s.id.trim() || ids.has(s.id)) throw new Error('Jeder Schritt braucht eine eindeutige Kennung.');
      ids.add(s.id);
      if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 200) throw new Error('Bitte jeden Schritt benennen (maximal 200 Zeichen).');
      zahl(s.verfuegbar, `${s.name}: verfügbar`);
      zahl(s.jeAuftrag, `${s.name}: Bedarf je Auftrag`, 1e-6);
    }
    const v = ablauf.verschiebung || { von: ablauf.schritte[0].id, nach: ablauf.schritte[1].id, menge: 0 };
    if (!ids.has(v.von) || !ids.has(v.nach) || v.von === v.nach) throw new Error('Wähle zwei verschiedene Schritte für die Verschiebung.');
    zahl(v.menge, 'Verschobene Menge');
    const geber = ablauf.schritte.find((s) => s.id === v.von);
    if (v.menge > geber.verfuegbar) throw new Error(`Höchstens ${geber.verfuegbar} aus ${geber.name} verschiebbar.`);
    const menge = bruch(v.menge);
    const szenario = (geaendert) => {
      const schritte = ablauf.schritte.map((s) => {
        let h = bruch(s.verfuegbar);
        if (geaendert && s.id === v.von) h = minus(h, menge);
        if (geaendert && s.id === v.nach) h = plus(h, menge);
        return { ...s, verfuegbar: alsZahl(h), kapazitaet: abgerundet(h, bruch(s.jeAuftrag)) };
      });
      const durchsatz = Math.min(...schritte.map((s) => s.kapazitaet));
      return { durchsatz, engpaesse: schritte.filter((s) => s.kapazitaet === durchsatz).map((s) => ({ id: s.id, name: s.name })), schritte };
    };
    const vorher = szenario(false), nachher = szenario(true);
    return {
      auftraege: ablauf.auftraege, verschiebung: { ...v }, vorher, nachher,
      differenz: nachher.durchsatz - vorher.durchsatz,
      offenVorher: Math.max(0, ablauf.auftraege - vorher.durchsatz),
      offenNachher: Math.max(0, ablauf.auftraege - nachher.durchsatz),
      summe: alsZahl(ablauf.schritte.reduce((s, x) => plus(s, bruch(x.verfuegbar)), bruch(0))),
    };
  }

  // Beste Verschiebung zwischen zwei Schritten (beide Kapazitaeten gleich gross machen).
  function ausbalancieren(von, nach) {
    const m = (nach.jeAuftrag * von.verfuegbar - von.jeAuftrag * nach.verfuegbar) / (von.jeAuftrag + nach.jeAuftrag);
    return Math.max(0, Math.min(von.verfuegbar, Math.round(m * 10) / 10));
  }

  root.ZEngpass = { analyse, ausbalancieren, bruch };
})(typeof window !== 'undefined' ? window : globalThis);
