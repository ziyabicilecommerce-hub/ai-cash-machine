// Quellen-Netz (27.11., Nutzer: "bau ein Netzwerk" -> "alle Gratis-Quellen verbunden"): alle kostenlosen KI-Dienste in
// einer festen Reihenfolge. Ist eine Quelle nicht eingerichtet oder ihr Gratis-Kontingent leer, übernimmt die nächste.
// Jede Quelle wird nur mit dem eigenen Konto und innerhalb ihres Gratis-Kontingents genutzt (keine Zweit-Konten).
// Kaggle ist auf Nutzer-Wunsch (27.11.) nicht im Netz.
const hat = (env, ...keys) => keys.every((k) => String(env[k] || '').trim());

export const QUELLEN = [
  // Bilder (Szenen mit gleichen Figuren)
  { id: 'agnes-bild', art: 'bild', name: 'Agnes Image 2.1 (mit Figuren-Vorlage)', gratis: 'ohne Tageslimit, 20 Bilder/Minute', bereit: (e) => hat(e, 'AGNES_API_KEY'), fehlt: 'AGNES_API_KEY' },
  { id: 'cloudflare', art: 'bild', name: 'Cloudflare FLUX.2 (mit Figuren-Vorlage)', gratis: 'Tageskontingent', bereit: (e) => hat(e, 'CF_ACCOUNT_ID', 'CF_API_TOKEN'), fehlt: 'CF_ACCOUNT_ID + CF_API_TOKEN' },
  { id: 'pollinations', art: 'bild', name: 'Pollinations (ohne Vorlage)', gratis: 'ohne Schlüssel', bereit: () => true },
  // Clips (beste Qualität zuerst)
  { id: 'seedance', art: 'clip', name: 'BytePlus Seedance', gratis: 'einmaliges Startguthaben', bereit: (e) => hat(e, 'ARK_API_KEY'), fehlt: 'ARK_API_KEY' },
  { id: 'agnes', art: 'clip', name: 'Agnes Video 2.0', gratis: 'ohne Tageslimit, 1 Clip/Minute', bereit: (e) => hat(e, 'AGNES_API_KEY'), fehlt: 'AGNES_API_KEY' },
  { id: 'modal', art: 'clip', name: 'Modal (Wan 2.2, 30 $ Gratis-Guthaben im Monat)', gratis: 'monatlich neu', bereit: (e) => hat(e, 'MODAL_TOKEN_ID', 'MODAL_TOKEN_SECRET'), fehlt: 'MODAL_TOKEN_ID + MODAL_TOKEN_SECRET' },
  { id: 'zhipu', art: 'clip', name: 'Zhipu CogVideoX-Flash', gratis: 'Gratis-Modell', bereit: (e) => hat(e, 'ZHIPU_API_KEY'), fehlt: 'ZHIPU_API_KEY' },
  { id: 'freeai', art: 'clip', name: 'free.ai (Wan 2.2)', gratis: '~1 Clip am Tag', bereit: (e) => hat(e, 'FREEAI_API_KEY'), fehlt: 'FREEAI_API_KEY' },
  { id: 'huggingface', art: 'clip', name: 'Hugging Face Spaces (Wan/LTX)', gratis: 'wenige Clips pro Lauf', bereit: () => true },
  { id: 'kamerafahrt', art: 'clip', name: 'Kamerafahrt durchs Bild (immer)', gratis: 'lokal', bereit: () => true },
];

export function netzStatus(env = process.env) {
  return QUELLEN.map((q) => ({ id: q.id, art: q.art, name: q.name, gratis: q.gratis, aktiv: q.bereit(env), fehlt: q.bereit(env) ? '' : q.fehlt }));
}

export const aktiv = (id, env = process.env) => !!QUELLEN.find((q) => q.id === id)?.bereit(env);

export function netzBericht(env = process.env) {
  const z = netzStatus(env).map((q) => `  ${q.aktiv ? '✓' : '·'} ${q.art === 'bild' ? 'Bild' : 'Clip'}: ${q.name} – ${q.aktiv ? q.gratis : `nicht eingerichtet (${q.fehlt})`}`);
  return `[quellen-netz] Reihenfolge:\n${z.join('\n')}`;
}

// Wer hat welche Szene geliefert? -> kurze Zusammenfassung fürs Protokoll
export function quellenZaehlen(quelleJeSzene = {}) {
  const n = {};
  for (const q of Object.values(quelleJeSzene)) n[q] = (n[q] || 0) + 1;
  return Object.entries(n).map(([q, k]) => `${q} ${k}x`).join(', ') || 'keine';
}
