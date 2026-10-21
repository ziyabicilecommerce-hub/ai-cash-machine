// Ziya Studio -> NACHTWERK: baut aus den fertigen Shots eine Projektdatei (.nachtwerk.json, Version 1), die man in
// NACHTWERK (Pages: /nachtwerk/) über "Projekt öffnen" lädt und dort von Hand weiterschneidet.
// Medien stecken als data:-URLs drin (NACHTWERK erlaubt bis 90 MB pro Medium, höchstens 120 Szenen, 10 Minuten).
const KAMERA = { rein: 'push', 'rein-schnell': 'push', raus: 'pull', schwenk: 'pan', hoch: 'pan' };

export function nachtwerkProjekt({ titel, idee, shots, audio = null, format = 'portrait', genre = 'fantasy' }) {
  const szenen = shots.slice(0, 120).map((s, i) => ({
    title: String(s.titel || `Szene ${s.nr ?? i + 1}`).slice(0, 120),
    narration: String(s.satz || '').slice(0, 12000),
    prompt: String(s.bild || '').slice(0, 12000),
    duration: Math.round(Math.min(Math.max(Number(s.dauer) || 3, 2), 600) * 100) / 100,
    visual: 'corridor',
    camera: KAMERA[s.zoom] || 'push',
    action: 'none',
    media: s.daten ? { name: `shot${s.nr ?? i + 1}.mp4`, data: s.daten } : null,
  }));
  return {
    version: 1, title: String(titel || idee || 'Ziya-Film').slice(0, 120), genre: ['horror', 'thriller', 'fantasy', 'documentary'].includes(genre) ? genre : 'fantasy', format,
    input: String(idee || '').slice(0, 50000), ambient: false, audioVolume: 0.85,
    audio: audio ? { name: 'erzaehler.mp3', data: audio } : null, source: 'ziya-studio', scenes: szenen,
  };
}

export const datenUrl = (puffer, typ) => `data:${typ};base64,${Buffer.from(puffer).toString('base64')}`;
