// Plant die deutschen Videos in Metricool ein (optional, nur mit Metricool-API-Zugang) - fuer #94.
import { readFileSync } from 'node:fs';
import { config } from './config.mjs';

// Naechster Zeitpunkt HH:MM Berliner Ortszeit (Metricool bekommt die Zone separat).
function slotBerlin(stunde, minute) {
  const teile = (d) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  const jetzt = teile(new Date());
  const minutenJetzt = Number(jetzt.hour) * 60 + Number(jetzt.minute);
  const tag = stunde * 60 + minute > minutenJetzt + 15 ? teile(new Date()) : teile(new Date(Date.now() + 86400000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${tag.year}-${tag.month}-${tag.day}T${pad(stunde)}:${pad(minute)}:00`;
}

export async function metricoolPlanen(basisUrl, MANIFEST = 'out/manifest.json') {
  if (!config.METRICOOL_API_TOKEN || !config.METRICOOL_USER_ID || !config.METRICOOL_BLOG_ID) {
    console.log('[94-video-fabrik] Metricool-Secrets fehlen - Videos liegen im Video-Feed, Posten uebersprungen.');
    return;
  }
  const { medienURLNormalisieren, beitragPlanen } = await import('./metricool.mjs');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const providers = (config.METRICOOL_PROVIDERS || 'instagram,tiktok,youtube').split(',').map((s) => s.trim()).filter(Boolean);
  const autoPublish = String(config.SOCIAL_AUTOPILOT_AUTO_PUBLISH || '').trim().toLowerCase() === 'ja';
  const stunden = [9, 12, 15, 18, 21, 20];
  for (const [i, m] of manifest.filter((x) => (x.sprache || 'de') === 'de').entries()) {
    try {
      const datumISO = slotBerlin(stunden[i % stunden.length], (i * 7) % 60);
      const mediaId = await medienURLNormalisieren(`${basisUrl.replace(/\/$/, '')}/${encodeURIComponent(m.datei)}`);
      const nur = m.format === 'quer' ? providers.filter((p) => p === 'youtube') : providers;
      if (!nur.length) continue;
      await beitragPlanen({ providers: nur, text: `${m.titel}\n\n${m.caption}`, mediaId, datumISO, draft: !autoPublish, instagramTyp: 'REEL' });
      console.log(`[94-video-fabrik] Metricool: "${m.titel}" fuer ${datumISO} ${autoPublish ? 'geplant' : 'als Entwurf'}`);
    } catch (err) {
      console.log(`[94-video-fabrik] Metricool-Fehler bei "${m.titel}": ${err.message}`);
    }
  }
}
