// Baut den tabellarischen Lebenslauf als PDF direkt aus BEWERBUNG_DATEN -
// so muss niemand ein PDF hochladen oder freigeben.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const MM = 72 / 25.4;
const BLAU = rgb(0.12, 0.31, 0.47);
const TEXT = rgb(0.11, 0.14, 0.19);
const GRAU = rgb(0.36, 0.4, 0.45);

const sauber = (font, t) => [...String(t || '')].filter((z) => { try { font.encodeText(z); return true; } catch { return false; } }).join('');

function umbrechen(font, groesse, text, breite) {
  const zeilen = []; let zeile = '';
  for (const wort of text.split(/\s+/).filter(Boolean)) {
    const probe = zeile ? `${zeile} ${wort}` : wort;
    if (font.widthOfTextAtSize(probe, groesse) > breite && zeile) { zeilen.push(zeile); zeile = wort; } else zeile = probe;
  }
  if (zeile) zeilen.push(zeile);
  return zeilen;
}

// Abschnitte, die nur für die KI gedacht sind, kommen nicht in den Lebenslauf.
const NUR_FUER_KI = /^(ziel|wunsch|notiz)/i;

export async function lebenslaufPdf({ name, kontakt, felder, abschnitte, ort }) {
  const doc = await PDFDocument.create();
  const n = await doc.embedFont(StandardFonts.Helvetica);
  const f = await doc.embedFont(StandardFonts.HelveticaBold);
  const kursiv = await doc.embedFont(StandardFonts.TimesRomanItalic);
  let seite = doc.addPage([210 * MM, 297 * MM]);
  const links = 20 * MM; const breite = 170 * MM; const spalte = 46 * MM;
  let y = 297 * MM - 20 * MM;

  const neueSeiteFalls = (bedarf) => { if (y - bedarf < 18 * MM) { seite = doc.addPage([210 * MM, 297 * MM]); y = 297 * MM - 20 * MM; } };
  const text = (t, x, font, groesse, farbe = TEXT) => seite.drawText(sauber(font, t), { x, y, size: groesse, font, color: farbe });

  text(name, links, f, 24, BLAU); y -= 18;
  text('Lebenslauf', links, n, 11.5, GRAU); y -= 16;
  for (const k of kontakt) { text(k, links, n, 10); y -= 13; }
  y -= 4;
  seite.drawRectangle({ x: links, y, width: breite, height: 2.2, color: BLAU });
  y -= 18;

  const persoenlich = [
    felder.GEBURT && ['Geburtsdatum', felder.GEBURT],
    (felder['STAATSANGEHÖRIGKEIT'] || felder.STAATSANGEHOERIGKEIT) && ['Staatsangehörigkeit', felder['STAATSANGEHÖRIGKEIT'] || felder.STAATSANGEHOERIGKEIT],
  ].filter(Boolean);
  const alle = [...(persoenlich.length ? [{ titel: 'Persönliche Daten', zeilen: persoenlich }] : []), ...abschnitte.filter((a) => !NUR_FUER_KI.test(a.titel))];

  for (const a of alle) {
    neueSeiteFalls(40);
    text(a.titel.toUpperCase(), links, f, 11, BLAU); y -= 5;
    seite.drawLine({ start: { x: links, y }, end: { x: links + breite, y }, thickness: 0.6, color: rgb(0.78, 0.83, 0.88) });
    y -= 13;
    for (const [linksTxt = '', titel = '', detail = ''] of a.zeilen) {
      const rechts = breite - spalte;
      const titelZeilen = umbrechen(f, 10, sauber(f, titel), rechts);
      const detailZeilen = detail ? umbrechen(n, 9.5, sauber(n, detail), rechts) : [];
      // Zeilen ohne "|" sind reiner Text (z. B. Hobbys) - dann normal statt fett.
      const nurText = a.zeilen.every((z) => z.length === 1);
      neueSeiteFalls((titelZeilen.length + detailZeilen.length) * 13 + 6);
      if (nurText) {
        for (const z of umbrechen(n, 10, sauber(n, linksTxt), breite)) { text(z, links, n, 10); y -= 13; }
        continue;
      }
      text(linksTxt, links, n, 9.5, GRAU);
      // Stationen (Schule/Praxis) fett, einfache "Label | Wert"-Zeilen normal.
      const fett = detail !== '' || /schul|praxis|erfahr|ausbild|beruf/i.test(a.titel);
      titelZeilen.forEach((z, i) => { text(z, links + spalte, fett ? f : n, 10); if (i < titelZeilen.length - 1) y -= 13; });
      y -= 12.5;
      for (const z of detailZeilen) { text(z, links + spalte, n, 9.5, GRAU); y -= 12; }
      y -= 4;
    }
    y -= 6;
  }

  neueSeiteFalls(50);
  y -= 6;
  const datum = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
  text(`${ort}, ${datum}`, links, n, 10); y -= 26;
  text(name, links, kursiv, 16, BLAU);

  return Buffer.from(await doc.save());
}
