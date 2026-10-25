// Fehler-Radar für fertige Videos: prüft Protokoll, Bericht und Messwerte eines Studio-Laufs nach festen Regeln
// (genau die Fehler, die bisher von Hand im Log gesucht wurden) und schreibt eine kurze Diagnose ins Issue.
// Kein Raten: jede Meldung hängt an einer Logzeile oder einem Messwert.

const REGELN = [
  { test: /\[kaggle-turbo\] Hochladen fehlgeschlagen/, stufe: 'rot', text: 'Kaggle hat den Auftrag abgelehnt', tipp: 'Grund steht im Protokoll (Zeile „Hochladen fehlgeschlagen“). Ein Neustart des Laufs hilft oft.' },
  { test: /\[kaggle-turbo\] 0\/\d+ Clips von Kaggle zurück/, stufe: 'rot', text: 'Kaggle hat keinen einzigen Clip geliefert', tipp: 'Wochenkontingent (30 h) leer oder Kaggle gestört – nächste Woche läuft es wieder.' },
  { test: /Zeitlimit erreicht vor Shot/, stufe: 'gelb', text: 'Kaggle-Zeit reichte nicht für alle Szenen', tipp: 'Normal bei langen Videos – die übrigen Szenen sind bewegte Standbilder.' },
  { test: /Bild-Retter ohne Erfolg/, stufe: 'gelb', text: 'Für eine Szene gab es gar kein Startbild', tipp: 'Bilddienst und FLUX-Spaces waren beide weg – die Szene fehlt im Video.' },
  { test: /Tonspur fehlgeschlagen/, stufe: 'rot', text: 'Video hat keinen Ton', tipp: 'Ohne Ton läuft es auf TikTok schlecht – Lauf neu starten.' },
  { test: /Sprecher übersprungen/, stufe: 'gelb', text: 'Erzählerstimme fehlt', tipp: 'Die Sprach-KI (edge-tts) war nicht erreichbar.' },
  { test: /Untertitel übersprungen/, stufe: 'gelb', text: 'Untertitel fehlen', tipp: 'Video ist trotzdem fertig, nur ohne eingebrannten Text.' },
  { test: /Text übersprungen/, stufe: 'gelb', text: 'Hook/„Fortsetzung folgt“ fehlt', tipp: 'Video ist trotzdem fertig.' },
  { test: /Englische Fassung übersprungen/, stufe: 'gelb', text: 'Englische Fassung fehlt', tipp: 'Übersetzung hat nicht geklappt – nur die deutsche Fassung.' },
  { test: /3D-Parallax übersprungen/, stufe: 'gelb', text: '3D-Parallax ging nicht – flache Zoom-Fahrt genommen', tipp: 'Tiefen-KI nicht geladen; Video ist trotzdem fertig.' },
  { test: /Zeitbudget knapp/, stufe: 'gelb', text: 'Zeit wurde knapp – einige Clips ohne KI-Schärfung', tipp: 'Etwas weicher, sonst ok.' },
  { test: /\[tages-bot\] KI-Idee (fehlgeschlagen|unbrauchbar)/, stufe: 'gelb', text: 'Ideen-KI ausgefallen – Idee aus der festen Liste', tipp: 'Dadurch keine Serien-Fortsetzung und kein eigener Sprechertext.' },
];

const anteil = (n, von) => (von ? n / von : 0);

// messungen: { dauer, ton, hell (Anteil fast weißer Bilder), dunkel (Anteil fast schwarzer Bilder), cover (0-255) }
export function radarPruefen({ log = '', bericht = null, messungen = {}, issueText = '' } = {}) {
  const funde = [];
  for (const r of REGELN) if (r.test.test(log)) funde.push({ stufe: r.stufe, text: r.text, tipp: r.tipp });
  if (/\*\*Idee-Quelle:\*\*\s*liste/i.test(issueText) && !funde.some((f) => /Ideen-KI/.test(f.text))) {
    funde.push({ stufe: 'gelb', text: 'Ideen-KI ausgefallen – Idee aus der festen Liste', tipp: 'Dadurch keine Serien-Fortsetzung und kein eigener Sprechertext.' });
  }
  const shots = (bericht?.shots || []).filter((s) => s.nr !== 0);
  if (shots.length) {
    const ki = shots.filter((s) => s.modell && s.modell !== 'kamerafahrt' && s.modell !== 'parallax').length;
    const q = anteil(ki, shots.length);
    if (q < 0.25) funde.push({ stufe: 'rot', text: `Nur ${ki}/${shots.length} Szenen echt animiert`, tipp: 'Gratis-KIs und Kaggle waren fast leer – der Rest sind bewegte Standbilder.' });
    else if (q < 0.5) funde.push({ stufe: 'gelb', text: `${ki}/${shots.length} Szenen echt animiert`, tipp: 'Mehr als die Hälfte sind bewegte Standbilder.' });
  }
  const { dauer, ton, hell, dunkel, cover } = messungen;
  if (typeof dauer === 'number' && dauer < 15) funde.push({ stufe: 'rot', text: `Video nur ${Math.round(dauer)} s lang`, tipp: 'Zu kurz für eine Geschichte – meist fehlten Startbilder.' });
  if (ton === false) funde.push({ stufe: 'rot', text: 'Keine Tonspur gefunden', tipp: 'Lauf neu starten.' });
  if (hell > 0.15) funde.push({ stufe: 'gelb', text: `${Math.round(hell * 100)} % der Bilder fast weiß`, tipp: 'Zu viel Leuchten/Blitz – wirkt ausgebrannt.' });
  if (dunkel > 0.25) funde.push({ stufe: 'gelb', text: `${Math.round(dunkel * 100)} % der Bilder fast schwarz`, tipp: 'Zu dunkel für das Handy-Display.' });
  if (typeof cover === 'number' && (cover > 220 || cover < 25)) funde.push({ stufe: 'gelb', text: `Titelbild ${cover > 220 ? 'fast weiß' : 'fast schwarz'}`, tipp: 'Lieber ein Bild aus der Vorschau als Titelbild nehmen.' });
  return funde.sort((a, b) => (a.stufe === b.stufe ? 0 : a.stufe === 'rot' ? -1 : 1));
}

export function radarText(funde) {
  if (!funde.length) return '🩺 **Fehler-Radar:** 🟢 alles in Ordnung – keine Auffälligkeiten.';
  const zeichen = { rot: '🔴', gelb: '🟡' };
  return ['🩺 **Fehler-Radar:**', ...funde.map((f) => `- ${zeichen[f.stufe]} **${f.text}** – ${f.tipp}`)].join('\n');
}
