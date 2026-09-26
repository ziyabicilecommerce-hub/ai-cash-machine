// Social-Content-Autopilot - generiert echte Bilder (kostenlos ueber
// Pollinations, kein API-Key) zu einer rotierenden Themenliste, baut daraus
// per ffmpeg ein kurzes Bewegtbild-Video (Ken-Burns-Zoom, ebenfalls kostenlos
// - ffmpeg ist auf GitHub-Actions-ubuntu-Runnern vorinstalliert) und plant
// beides automatisch ueber Metricool fuer Instagram/TikTok/YouTube.
//
// Kompletter Ersatz fuer einen eigenen "Bilder+Video-Generierungs-Server":
// laeuft ausschliesslich ueber oeffentliche, kostenlose APIs + GitHub Actions
// als Motor - kein eigener Server, kein Hosting, kein Abo.
//
// WICHTIG (ehrlich): der Video-Teil ist ein animiertes Standbild (Zoom/Pan),
// kein echtes generatives KI-Video mit eigener Bewegung - das gaebe es nur
// ueber einen kostenpflichtigen Dienst. SOCIAL_AUTOPILOT_MEDIENTYP='bild'
// schaltet zurueck auf reine Standbilder.
//
// Sicherheitsdefault (wie bei den AUTO_POST_*-Schaltern in diesem Projekt):
// SOCIAL_AUTOPILOT_AUTO_PUBLISH='nein' -> Beitraege landen als ENTWURF im
// Metricool-Planer, du pruefst/bestaetigst manuell, bevor irgendwas live auf
// einen echten Kanal geht. Erst mit 'ja' postet es wirklich vollautomatisch.
import { config, ueberspringenWerfen } from './lib/config.mjs';
import { askKI } from './lib/ki.mjs';
import { bildURL, bildURLPruefen } from './lib/pollinationsMedia.mjs';
import { bildZuKenBurnsVideo } from './lib/videoAnimation.mjs';
import { commitUndOeffentlicheURL, warteBisOeffentlichErreichbar } from './lib/repoMedia.mjs';
import { medienURLNormalisieren, beitragPlanen } from './lib/metricool.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const STATE_NAME = 'social-content-autopilot-state';
const MAX_HISTORIE = 300;

function ermittleThemen() {
  return (config.SOCIAL_AUTOPILOT_THEMEN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function ermittleProviders() {
  return (config.METRICOOL_PROVIDERS || 'instagram')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function slugifizieren(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'thema'
  );
}

// Lokale Wanduhrzeit OHNE Zeitzonen-Offset im String - Metricool bekommt die
// Zeitzone separat ueber publicationDate.timezone (METRICOOL_TIMEZONE).
function naechsterSlotISO(minutenAbJetzt = 20) {
  const d = new Date(Date.now() + minutenAbJetzt * 60_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

async function main() {
  if (!config.METRICOOL_API_TOKEN || !config.METRICOOL_USER_ID || !config.METRICOOL_BLOG_ID) {
    ueberspringenWerfen('Metricool-Secrets (METRICOOL_API_TOKEN/METRICOOL_USER_ID/METRICOOL_BLOG_ID) fehlen noch - siehe automations/README.md.');
  }

  const alleThemen = ermittleThemen();
  if (!alleThemen.length) {
    console.log('[90-social-content-autopilot] Keine SOCIAL_AUTOPILOT_THEMEN konfiguriert - uebersprungen.');
    return;
  }

  const providers = ermittleProviders();
  let medienTyp = (config.SOCIAL_AUTOPILOT_MEDIENTYP || 'video').trim().toLowerCase();
  if (providers.includes('youtube') && medienTyp !== 'video') {
    console.log('[90-social-content-autopilot] METRICOOL_PROVIDERS enthaelt youtube - das verlangt zwingend ein Video, SOCIAL_AUTOPILOT_MEDIENTYP wird fuer diesen Lauf auf "video" erzwungen.');
    medienTyp = 'video';
  }

  const state = loadState(STATE_NAME);
  const bereits = new Set(state.bearbeitet || []);
  const anzahl = parseInt(config.SOCIAL_AUTOPILOT_ANZAHL_PRO_LAUF, 10) || 1;
  const neueThemen = alleThemen.filter((t) => !bereits.has(t)).slice(0, anzahl);

  if (!neueThemen.length) {
    console.log('[90-social-content-autopilot] Alle Themen bereits bearbeitet (SOCIAL_AUTOPILOT_THEMEN erweitern oder State in automations/state/ zuruecksetzen).');
    return;
  }

  const autoPublish = String(config.SOCIAL_AUTOPILOT_AUTO_PUBLISH || '').trim().toLowerCase() === 'ja';

  let verarbeitet = 0;
  const ergebnisse = [];

  for (const thema of neueThemen) {
    try {
      const bildPrompt = await askKI(
        `Erstelle EINEN einzigen, sehr detaillierten englischsprachigen Bild-Generierungs-Prompt (photorealistisch, konkrete Szene/Licht/Komposition) fuer ein Social-Media-Bild zum Thema "${thema}" fuer den Shop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}). Antworte NUR mit dem reinen Prompt-Text, ohne Anfuehrungszeichen, ohne Erklaerung.`,
        { maxTokens: 300 }
      );

      const imageUrl = bildURL(bildPrompt.trim());
      await bildURLPruefen(imageUrl);

      let finaleURL = imageUrl;
      let instagramTyp = 'POST';

      if (medienTyp === 'video') {
        const videoPfad = await bildZuKenBurnsVideo(imageUrl);
        const repoPfad = `social-poster/generated/${Date.now()}-${slugifizieren(thema)}.mp4`;
        finaleURL = commitUndOeffentlicheURL(videoPfad, repoPfad);
        await warteBisOeffentlichErreichbar(finaleURL);
        instagramTyp = 'REEL';
      }

      const caption = await askKI(
        `Schreibe eine kurze, catchy Instagram/TikTok-Caption auf Deutsch (max. 2 Saetze + 3-5 relevante Hashtags) zum Thema "${thema}" fuer den Shop "${config.SHOP_NAME}". Antworte NUR mit der Caption, kein JSON, keine Markdown-Formatierung.`,
        { maxTokens: 200 }
      );

      const mediaId = await medienURLNormalisieren(finaleURL);
      const ergebnis = await beitragPlanen({
        providers,
        text: caption.trim(),
        mediaId,
        datumISO: naechsterSlotISO(),
        draft: !autoPublish,
        instagramTyp,
      });

      bereits.add(thema);
      verarbeitet += 1;
      ergebnisse.push({ thema, plannerUrl: ergebnis?.plannerUrl || ergebnis?.data?.plannerUrl });
    } catch (fehler) {
      await notifyTelegram(`⚠️ Social-Content-Autopilot: Thema "${thema}" fehlgeschlagen - ${fehler.message}`);
      console.error(`[90-social-content-autopilot] Fehler bei "${thema}":`, fehler);
    }
  }

  state.bearbeitet = [...bereits].slice(-MAX_HISTORIE);
  saveState(STATE_NAME, state);

  if (verarbeitet > 0) {
    const modus = autoPublish ? 'live geplant' : 'als ENTWURF in Metricool angelegt (manuell bestaetigen!)';
    const zeilen = [
      `🎨 *Social-Content-Autopilot*: ${verarbeitet} Beitrag/Beitraege (${medienTyp}) ${modus}.`,
      ...ergebnisse.map((e) => `• ${e.thema}${e.plannerUrl ? ` -> ${e.plannerUrl}` : ''}`),
    ];
    await notifyTelegram(zeilen.join('\n'));
  }
}

main().catch((err) => {
  if (err.uebersprungen) {
    console.log('[90-social-content-autopilot] Uebersprungen:', err.message);
    process.exit(0);
  }
  console.error('[90-social-content-autopilot] Fehler:', err);
  process.exit(1);
});
