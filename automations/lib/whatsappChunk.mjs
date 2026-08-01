// Splittet eine Liste von Textzeilen in mehrere Blöcke unter einem Zeichenlimit -
// die WhatsApp Cloud API begrenzt Text-Nachrichten auf 4096 Zeichen.
export function chunkZeilen(zeilen, maxChars) {
  const chunks = [];
  let current = [];
  let currentLength = 0;
  for (const zeile of zeilen) {
    const zusatz = zeile.length + 2;
    if (current.length && currentLength + zusatz > maxChars) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(zeile);
    currentLength += zusatz;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
