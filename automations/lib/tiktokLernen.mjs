// TikTok-Lernen (#102): wertet die eigenen TikTok-Posts aus (Sehdauer, Kommentare, Aufrufe) und merkt sich,
// welches Format besser zieht (Quiz oder Mythos/Wahrheit). Der Fakten-Kanal nimmt dann bevorzugt dieses Format.
// Reine Funktionen - ohne Netz testbar.

// Format eines Posts aus seinem Text erkennen (Captions aus der Faktenliste).
export const typAus = (text) => (/wahr oder mythos|mythos oder wahr/i.test(String(text)) ? 'mythos' : 'quiz');

const wert = (metrics, typ) => Number((metrics || []).find((m) => m.type === typ)?.value) || 0;

// posts: [{ text, metrics: [{type, value}] }] -> Kennzahlen je Format + bevorzugtes Format (oder null).
export function auswerten(posts, { mindestens = 4, vorsprung = 0.1 } = {}) {
  const stat = { quiz: { n: 0, sehdauer: 0, kommentare: 0, aufrufe: 0 }, mythos: { n: 0, sehdauer: 0, kommentare: 0, aufrufe: 0 } };
  for (const p of posts) {
    if (!wert(p.metrics, 'views')) continue; // noch keine Zahlen
    const s = stat[typAus(p.text)];
    s.n++;
    s.sehdauer += wert(p.metrics, 'averageTimeWatched');
    s.kommentare += wert(p.metrics, 'comments');
    s.aufrufe += wert(p.metrics, 'views');
  }
  // Punkte: Sehdauer zählt am meisten (TikTok verteilt nach Watch-Time), Kommentare pro 100 Aufrufe dazu.
  const punkte = (s) => (s.n ? s.sehdauer / s.n + (s.aufrufe ? (s.kommentare / s.aufrufe) * 100 : 0) : 0);
  const q = punkte(stat.quiz);
  const m = punkte(stat.mythos);
  let bevorzugt = null;
  if (stat.quiz.n >= mindestens && stat.mythos.n >= mindestens) {
    if (q > m * (1 + vorsprung)) bevorzugt = 'quiz';
    else if (m > q * (1 + vorsprung)) bevorzugt = 'mythos';
  }
  const runden = (x) => Math.round(x * 100) / 100;
  return { quiz: { ...stat.quiz, punkte: runden(q) }, mythos: { ...stat.mythos, punkte: runden(m) }, bevorzugt };
}
