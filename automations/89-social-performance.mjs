// Social-Performance-Radar - misst wie viel Reichweite/Aufrufe die WIRKLICH
// automatisch geposteten Facebook-/Instagram-Beiträge (#18) danach real
// hatten, statt nur "gepostet" ohne Ergebnis anzuzeigen.
// Zeitplan: wöchentlich montags 09:15
//
// Bewusst NUR für Facebook/Instagram: das sind die einzigen Plattformen, auf
// denen #18 wirklich automatisch postet (TikTok/Pinterest/YouTube/X bleiben
// dort Text-Entwürfe zum Copy-Paste - für die gibt es keine postId, also
// auch keine echten Performance-Daten abzurufen). Erfindet keine Zahlen für
// Plattformen ohne echten Post.
import { config, ueberspringenWerfen } from './lib/config.mjs';
import { loadState } from './lib/state.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POSTER_DIR = join(__dirname, '..', 'social-poster');
const FENSTER_TAGE = parseInt(config.SOCIAL_PERFORMANCE_FENSTER_TAGE || '30');
const MAX_BEITRAEGE = 20;

// Holt Insights robust ab - Meta ändert Metrik-Namen zwischen API-Versionen
// gelegentlich; ein Fehler hier darf niemals den ganzen Lauf abbrechen,
// sondern liefert einfach null (kein erfundener Wert) für "Aufrufe".
async function holeInsightMetrik(postId, metrik, token) {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${postId}/insights?metric=${metrik}&access_token=${token}`);
    if (!res.ok) return null;
    const data = await res.json();
    const wert = data?.data?.[0]?.values?.[0]?.value;
    return typeof wert === 'number' ? wert : null;
  } catch {
    return null;
  }
}

async function holeFacebookPerformance(postId) {
  const ergebnis = { aufrufe: null, likes: null, kommentare: null, shares: null };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${config.FB_PAGE_TOKEN}`);
    if (res.ok) {
      const data = await res.json();
      ergebnis.likes = data?.likes?.summary?.total_count ?? null;
      ergebnis.kommentare = data?.comments?.summary?.total_count ?? null;
      ergebnis.shares = data?.shares?.count ?? null;
    }
  } catch { /* keine Zahlen statt kaputtem Lauf */ }
  ergebnis.aufrufe = await holeInsightMetrik(postId, 'post_impressions', config.FB_PAGE_TOKEN);
  return ergebnis;
}

async function holeInstagramPerformance(postId) {
  const ergebnis = { aufrufe: null, likes: null, kommentare: null, shares: null };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${postId}?fields=like_count,comments_count&access_token=${config.META_ACCESS_TOKEN}`);
    if (res.ok) {
      const data = await res.json();
      ergebnis.likes = data?.like_count ?? null;
      ergebnis.kommentare = data?.comments_count ?? null;
    }
  } catch { /* keine Zahlen statt kaputtem Lauf */ }
  ergebnis.aufrufe = await holeInsightMetrik(postId, 'reach', config.META_ACCESS_TOKEN);
  return ergebnis;
}

async function main() {
  if (!config.FB_PAGE_TOKEN && !config.META_ACCESS_TOKEN) {
    ueberspringenWerfen('Weder FB_PAGE_TOKEN noch META_ACCESS_TOKEN gesetzt - Social-Performance-Radar braucht mindestens eins davon (dieselben Secrets wie #18).');
  }

  const state = loadState('18-multi-plattform-poster');
  const pakete = state.pakete || [];
  const grenze = new Date();
  grenze.setDate(grenze.getDate() - FENSTER_TAGE);

  const kandidaten = pakete
    .filter((p) => new Date(p.datum) >= grenze)
    .filter((p) => (p.facebook && p.facebook.gepostet && p.facebook.postId) || (p.instagram && p.instagram.gepostet && p.instagram.postId))
    .slice(0, MAX_BEITRAEGE);

  if (!kandidaten.length) {
    ueberspringenWerfen(`Keine wirklich geposteten Facebook/Instagram-Beiträge in den letzten ${FENSTER_TAGE} Tagen gefunden - #18 muss erst mit AUTO_POST_FACEBOOK/AUTO_POST_INSTAGRAM=ja gelaufen sein.`);
  }

  const beitraege = [];
  for (const p of kandidaten) {
    if (p.facebook && p.facebook.gepostet && p.facebook.postId && config.FB_PAGE_TOKEN) {
      const perf = await holeFacebookPerformance(p.facebook.postId);
      beitraege.push({ datum: p.datum, thema: p.thema, plattform: 'facebook', postId: p.facebook.postId, url: p.facebook.url || null, ...perf });
    }
    if (p.instagram && p.instagram.gepostet && p.instagram.postId && config.META_ACCESS_TOKEN) {
      const perf = await holeInstagramPerformance(p.instagram.postId);
      beitraege.push({ datum: p.datum, thema: p.thema, plattform: 'instagram', postId: p.instagram.postId, url: null, ...perf });
    }
  }

  beitraege.sort((a, b) => (b.aufrufe || 0) - (a.aufrufe || 0));
  const gesamtAufrufe = beitraege.reduce((s, b) => s + (b.aufrufe || 0), 0);
  const gesamtLikes = beitraege.reduce((s, b) => s + (b.likes || 0), 0);
  const gesamtKommentare = beitraege.reduce((s, b) => s + (b.kommentare || 0), 0);
  const topBeitrag = beitraege.find((b) => b.aufrufe !== null) || null;

  if (!existsSync(POSTER_DIR)) mkdirSync(POSTER_DIR, { recursive: true });
  writeFileSync(
    join(POSTER_DIR, 'performance.json'),
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      fensterTage: FENSTER_TAGE,
      anzahlBeitraege: beitraege.length,
      gesamtAufrufe,
      gesamtLikes,
      gesamtKommentare,
      topBeitrag,
      beitraege,
    }, null, 2)
  );

  const NL = '\n';
  const topZeile = topBeitrag
    ? `Top-Beitrag: ${topBeitrag.plattform} vom ${topBeitrag.datum.slice(0, 10)} mit ${topBeitrag.aufrufe} Aufrufen (${topBeitrag.likes ?? 0} Likes, ${topBeitrag.kommentare ?? 0} Kommentare)`
    : 'Noch keine Aufrufe-Zahlen verfügbar (Meta liefert Insights teils erst nach 24-48h).';
  await notifyTelegram(
    `SOCIAL-PERFORMANCE-RADAR - ${config.SHOP_NAME}${NL}${NL}${beitraege.length} echte Facebook/Instagram-Posts der letzten ${FENSTER_TAGE} Tage ausgewertet.${NL}Gesamt: ${gesamtAufrufe} Aufrufe, ${gesamtLikes} Likes, ${gesamtKommentare} Kommentare.${NL}${topZeile}`
  );

  console.log(`[89-social-performance] ${beitraege.length} Beiträge ausgewertet, ${gesamtAufrufe} Aufrufe gesamt`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[89-social-performance] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[89-social-performance] Fehler:', err);
  process.exit(1);
});
