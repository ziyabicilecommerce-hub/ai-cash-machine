// Werbe-Check: prueft Titel und Texte JEDES Videos (in vielen Sprachen) vor dem Posten auf Aussagen, die in
// Deutschland/EU abgemahnt werden koennen - Heilversprechen (HWG), unbelegte Superlative, erfundene Knappheit
// und erfundene Kundenzahlen (UWG). "block" = wird nicht gepostet, "pruefen" = Hinweis in der Zentrale.
// Keine Rechtsberatung - ein Sicherheitsnetz gegen die haeufigsten Fehler, besonders in KI-Uebersetzungen.

export const REGELN = [
  { art: 'heilversprechen', stufe: 'block', grund: 'Heilversprechen (Heilmittelwerbegesetz)', muster: [
    // de
    /\bheil(t|en|ung|end)\b|\blinder(t|n|ung)\s+(\S+\s+)?\S*(schmerz|beschwerd)|schmerzfrei|rückenfrei|beschwerdefrei|gegen\s+\S*schmerzen|hilft\s+(bei|gegen)\s+(\S+\s+)?\S*(schmerz|arthrose|bandscheib|ischias|migräne|rheuma)|therap(ie|eut)|medizinisch\s+(wirksam|getestet|bewiesen)|wundermittel|entgifte/i,
    // en
    /\b(cures?|heals?|healing)\b|pain[- ]free|relieves?\s+(\w+\s+)?pain|pain\s+relief|\btreats?\s+(back|neck|joint|arthritis|sciatica|pain)|therap(y|eutic)|medically\s+proven|miracle\s+(cure|product)|\bdetox/i,
    // es / fr / it / pt
    /\bcura\b|\bcura\s|alivia\s+(el\s+)?dolor|sin\s+dolor|libre\s+de\s+dolor|alivio\s+del\s+dolor|terap[eé]ut|guérit|soulage\s+(la\s+|les\s+)?douleur|sans\s+douleur|anti-douleur|thérap|guarisce|allevia\s+(il\s+)?dolor|senza\s+dolore|antidolor|terapeut|alivia\s+a\s+dor|sem\s+dor|alívio\s+da\s+dor/i,
    // nl / pl / tr
    /geneest|verlicht\s+(de\s+)?pijn|pijnvrij|therapeut|\bleczy\b|uśmierza|bez\s+bólu|terapeut|tedavi\s+eder|iyileştirir|ağrısız|ağrıyı\s+(giderir|dindirir)/i,
    // ru / uk
    /лечит|исцеля|без\s+боли|от\s+боли|снимает\s+боль|свободн\S*\s+от\s+боли|терапевт|лікує|без\s+болю|від\s+болю|знімає\s+біль/i,
  ] },
  { art: 'schmerz', stufe: 'block', grund: 'Schmerz-Bezug in der Werbung (wirkt wie Heilversprechen, HWG)', muster: [
    // Jede Erwaehnung von Schmerz/Beschwerden in Werbung fuer Nicht-Medizinprodukte - auch indirekt ("Hoer auf, solche Schmerzen ...").
    /schmerz|beschwerden|\bpain\b|\baches?\b|\bdolor(es)?\b|douleur|dolore|\bdores?\b|\bból|ağrı|\bболь|боли\b|болі|\bбіль/i,
  ] },
  { art: 'klinisch', stufe: 'block', grund: 'Unbelegte Studien-/Klinik-Aussage', muster: [
    /klinisch\s+(getestet|bewiesen|belegt)|clinically\s+(tested|proven)|cliniquement|clínicamente|clinicamente|klinicznie|klinik\s+olarak|клинически|клінічно|wissenschaftlich\s+bewiesen|scientifically\s+proven/i,
  ] },
  { art: 'superlativ', stufe: 'block', grund: 'Unbelegter Superlativ / Testsieger', muster: [
    /testsieger|test\s+winner|marktführer|market\s+leader|\bnr\.?\s?1\b|\bnummer\s+1\b|\bnumber\s+one\b|(?:^|\s)#1(?:\s|$)|das\s+beste\s+\w+\s+der\s+welt|best\s+in\s+the\s+world|el\s+mejor\s+del\s+mundo|le\s+meilleur\s+au\s+monde/i,
  ] },
  { art: 'knappheit', stufe: 'block', grund: 'Erfundene Knappheit / Zeitdruck', muster: [
    /nur\s+noch\s+\d+|nur\s+heute|letzte\s+chance|only\s+\d+\s+left|today\s+only|last\s+chance|solo\s+hoy|quedan\s+\d+|última\s+oportunidad|dernière\s+chance|seulement\s+aujourd|ultima\s+occasione|solo\s+oggi|só\s+hoje|tylko\s+dziś|sadece\s+bugün|только\s+сегодня|осталось\s+\d+/i,
  ] },
  { art: 'kunden', stufe: 'block', grund: 'Erfundene Kundenzahlen / Bewertungen', muster: [
    /\d[\d.,]*\s*\+?\s*(zufriedene\s+)?kunden|tausende\s+(zufriedene\s+)?kunden|\d+\s?%\s+(zufrieden|der\s+kunden)|\d[\d.,]*\s*\+?\s*(happy\s+)?customers|thousands\s+of\s+(happy\s+)?customers|\d+\s?%\s+of\s+customers|miles\s+de\s+clientes|des\s+milliers\s+de\s+clients|5[- ]sterne|5[- ]star\s+review/i,
  ] },
  { art: 'garantie', stufe: 'pruefen', grund: 'Garantie/Bestseller - nur wenn es im Shop wirklich so ist', muster: [
    /geld[- ]zurück|money[- ]back|bestseller|best[- ]seller|garantiert|guaranteed/i,
  ] },
];

// Treffer fuer einen Text (alle Regeln, alle Sprachen - billig und gruendlich).
export function pruefen(text) {
  const t = String(text || '');
  const treffer = [];
  for (const r of REGELN) {
    for (const m of r.muster) {
      const x = t.match(m);
      if (x) { treffer.push({ art: r.art, stufe: r.stufe, grund: r.grund, stelle: x[0].trim().slice(0, 60) }); break; }
    }
  }
  return treffer;
}

// Alles, was im Video gesagt/eingeblendet wird: Hook, Szenen-Saetze, Anfang-Varianten (fuer Skript und Feed).
export const werbeText = (s) => [s.hook, ...(s.szenen || []).map((x) => x?.text), ...(s.anfaenge || []).flatMap((a) => [a?.satz, a?.hook])].filter(Boolean).join('\n');

// Gesperrte Treffer fuer ein Skript (Titel, Caption, gesprochene Saetze, Anfaenge) - vor dem Rendern, spart Renderzeit.
export const skriptBlock = (s) => pruefen([s.titel, String(s.caption || '').replace(/https?:\/\/\S+/g, ' '), werbeText(s)].filter(Boolean).join('\n')).filter((t) => t.stufe === 'block');

// Ein Video aus dem Feed/Manifest: Titel + Caption (ohne Links) + der Text IM Video (werbetext).
export function videoPruefen(v) {
  const text = `${v.titel || ''}\n${String(v.caption || '').replace(/https?:\/\/\S+/g, ' ')}\n${v.werbetext || ''}`;
  const treffer = pruefen(text);
  return { ok: !treffer.some((x) => x.stufe === 'block'), treffer };
}

// Bericht ueber den Feed fuer die Zentrale.
export function bericht(videos) {
  const liste = (videos || []).map((v) => ({ v, e: videoPruefen(v) }));
  const blockiert = liste.filter((x) => !x.e.ok);
  const pruefen_ = liste.filter((x) => x.e.ok && x.e.treffer.length);
  const zeile = ({ v, e }) => ({ datei: v.datei, sprache: v.sprache || 'de', titel: String(v.titel || '').slice(0, 120), treffer: e.treffer });
  const nachArt = {};
  for (const { e } of blockiert) for (const t of e.treffer.filter((x) => x.stufe === 'block')) nachArt[t.art] = (nachArt[t.art] || 0) + 1;
  return { geprueft: liste.length, blockiert: blockiert.length, hinweise: pruefen_.length, nachArt, liste: blockiert.slice(0, 200).map(zeile), pruefliste: pruefen_.slice(0, 100).map(zeile) };
}
