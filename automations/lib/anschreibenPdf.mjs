// Baut für jede Bewerbung ein eigenes Anschreiben als PDF (Briefform nach DIN 5008:
// Absender, Empfänger, Ort/Datum, fetter Betreff, Text, Grußformel).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const MM = 72 / 25.4;

// Standard-Schriften können nur WinAnsi (Umlaute/ß/„“/– gehen, Emojis nicht).
function nurDruckbar(font, text) {
  return [...String(text)].map((z) => { try { font.encodeText(z); return z; } catch { return z === '\n' ? z : z === '\t' ? ' ' : ''; } }).join('');
}

function umbrechen(font, groesse, text, breite) {
  const zeilen = [];
  for (const absatz of text.split('\n')) {
    if (!absatz.trim()) { zeilen.push(''); continue; }
    let zeile = '';
    for (const wort of absatz.split(/\s+/)) {
      const probe = zeile ? `${zeile} ${wort}` : wort;
      if (font.widthOfTextAtSize(probe, groesse) > breite && zeile) { zeilen.push(zeile); zeile = wort; } else zeile = probe;
    }
    zeilen.push(zeile);
  }
  return zeilen;
}

export async function anschreibenPdf({ absender, empfaenger, ort, betreff, text }) {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  let seite = doc.addPage([210 * MM, 297 * MM]);
  const links = 25 * MM;
  const breite = 165 * MM;
  const farbe = rgb(0.11, 0.14, 0.19);
  let y = 297 * MM - 20 * MM;

  const schreibe = (zeile, { font = normal, groesse = 10.5, abstand = 14.5 } = {}) => {
    if (y < 22 * MM) { seite = doc.addPage([210 * MM, 297 * MM]); y = 297 * MM - 22 * MM; }
    seite.drawText(nurDruckbar(font, zeile), { x: links, y, size: groesse, font, color: farbe });
    y -= abstand;
  };

  // Absenderzeile (rechtsbündig wäre schöner, linksbündig ist DIN-konform genug)
  schreibe(absender[0], { font: fett, groesse: 13, abstand: 16 });
  for (const z of absender.slice(1)) schreibe(z, { groesse: 9.5, abstand: 12.5 });
  y -= 14 * MM;

  for (const z of empfaenger.filter(Boolean)) schreibe(z);
  y -= 10 * MM;

  const datum = `${ort}, ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })}`;
  seite.drawText(nurDruckbar(normal, datum), { x: links + breite - normal.widthOfTextAtSize(datum, 10.5), y, size: 10.5, font: normal, color: farbe });
  y -= 12 * MM;

  for (const z of umbrechen(fett, 11, nurDruckbar(fett, betreff), breite)) schreibe(z, { font: fett, groesse: 11 });
  y -= 6 * MM;

  for (const z of umbrechen(normal, 10.5, nurDruckbar(normal, text), breite)) schreibe(z);
  y -= 4 * MM;
  schreibe('Mit freundlichen Grüßen');
  y -= 10 * MM;
  schreibe(absender[0]);
  y -= 4 * MM;
  schreibe('Anlage: Lebenslauf', { groesse: 9.5 });

  return Buffer.from(await doc.save());
}
