// Google-Maps-Lead-Jäger - findet Firmen ohne (gute) Website zum Website-Verkauf
// Neu, kein n8n-Workflow · Zeitplan: täglich, siehe automation-48-google-maps-lead-jaeger.yml
// Sucht per Google Places nach Firmen, prüft ob eine Website fehlt oder schlecht ist,
// und schickt neue Treffer per WhatsApp - Kontaktaufnahme übernimmt der Nutzer selbst.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { searchPlaces, getPlaceDetails } from './lib/googlePlaces.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { buildLeadPreviewHtml, slugifyLead } from './lib/leadPreview.mjs';

const STATE_NAME = 'lead-jaeger-state';
const MAX_GESENDETE_HISTORIE = 500;
const FETCH_TIMEOUT_MS = 8000;
const PAGES_BASE_URL = 'https://ziyabicilecommerce-hub.github.io/ai-cash-machine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW_DIR = join(__dirname, '..', 'lead-previews');

function parseSuchbegriffe() {
  return config.LEAD_SUCHBEGRIFFE.split(',').map((s) => s.trim()).filter(Boolean);
}

function branchAusSuchbegriff(begriff) {
  return begriff.split(/\s+in\s+/i)[0].trim() || 'Unternehmen';
}

// Google Places trägt bei vielen Kleinunternehmen als "website" nur eine
// Social-Media-Seite oder einen kostenlosen Baukasten-Auftritt ein - das ist
// keine echte eigene Website und damit trotzdem ein Lead.
const KEINE_ECHTE_WEBSITE_HOSTS = {
  'facebook.com': 'Facebook-Seite',
  'instagram.com': 'Instagram-Profil',
  'business.site': 'kostenloser Google Business Site',
  'linktr.ee': 'Linktree-Seite',
  'wa.me': 'WhatsApp-Link',
  'g.page': 'Google-Maps-Kurzlink',
};

function erkenneUnechteWebsite(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const [domain, label] of Object.entries(KEINE_ECHTE_WEBSITE_HOSTS)) {
      if (host === domain || host.endsWith(`.${domain}`)) return label;
    }
    return null;
  } catch {
    return null;
  }
}

async function checkWebsiteQualitaet(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);

    if (!res.ok) return 'Website antwortet mit Fehler (Status ' + res.status + ')';

    const html = await res.text();
    const gruende = [];
    if (!url.startsWith('https://')) gruende.push('kein HTTPS');
    if (!/<meta[^>]+viewport/i.test(html)) gruende.push('nicht für Handy optimiert (kein viewport-Meta-Tag)');
    if (html.length < 1500) gruende.push('sehr dünner Seiteninhalt');

    return gruende.length >= 2 ? gruende.join(', ') : null;
  } catch {
    return 'Website nicht erreichbar (offline oder Timeout)';
  }
}

async function main() {
  const suchbegriffe = parseSuchbegriffe();
  if (!suchbegriffe.length) {
    console.log('[48-lead-jaeger] Keine LEAD_SUCHBEGRIFFE konfiguriert - übersprungen.');
    return;
  }

  const state = loadState(STATE_NAME);
  const bereitsGesendet = new Set(state.gesendet || []);
  const maxProLauf = parseInt(config.LEAD_MAX_PRO_LAUF, 10) || 15;

  const leads = [];

  for (const begriff of suchbegriffe) {
    if (leads.length >= maxProLauf) break;
    const branche = branchAusSuchbegriff(begriff);
    const treffer = await searchPlaces(begriff);

    for (const ort of treffer) {
      if (leads.length >= maxProLauf) break;
      if (!ort.place_id || bereitsGesendet.has(ort.place_id)) continue;

      const details = await getPlaceDetails(ort.place_id);
      let grund = null;

      const unechteWebsite = details.website ? erkenneUnechteWebsite(details.website) : null;

      if (!details.website) {
        grund = 'keine Website';
      } else if (unechteWebsite) {
        grund = `keine echte Website (nur ${unechteWebsite})`;
      } else {
        const qualitaetsGrund = await checkWebsiteQualitaet(details.website);
        if (qualitaetsGrund) grund = `schlechte Website (${qualitaetsGrund})`;
      }

      if (!grund) continue;

      leads.push({
        name: details.name || ort.name || 'Unbekannt',
        adresse: details.formatted_address || ort.formatted_address || '',
        telefon: details.formatted_phone_number || '',
        bewertung: details.rating || null,
        bewertungenAnzahl: details.user_ratings_total || 0,
        branche,
        grund,
        mapsUrl: details.url || '',
        placeId: ort.place_id,
      });
      bereitsGesendet.add(ort.place_id);
    }
  }

  if (!leads.length) {
    console.log('[48-lead-jaeger] Keine neuen Leads gefunden.');
    return;
  }

  if (!existsSync(PREVIEW_DIR)) mkdirSync(PREVIEW_DIR, { recursive: true });
  for (const lead of leads) {
    const slug = slugifyLead(lead.name, lead.placeId);
    writeFileSync(join(PREVIEW_DIR, `${slug}.html`), buildLeadPreviewHtml(lead));
    lead.previewUrl = `${PAGES_BASE_URL}/lead-previews/${slug}.html`;
  }

  const zeilen = leads.map((l, i) => {
    const teile = [`${i + 1}. *${l.name}*`, l.grund];
    if (l.adresse) teile.push(l.adresse);
    if (l.telefon) teile.push(`Tel: ${l.telefon}`);
    teile.push(`Website-Entwurf: ${l.previewUrl}`);
    if (l.mapsUrl) teile.push(l.mapsUrl);
    return teile.join('\n');
  });

  const nachricht = `🎯 ${leads.length} neue Website-Verkaufs-Leads:\n\n${zeilen.join('\n\n')}`;
  await notifyWhatsapp(nachricht);

  const historie = [...bereitsGesendet].slice(-MAX_GESENDETE_HISTORIE);
  saveState(STATE_NAME, { gesendet: historie });

  console.log(`[48-lead-jaeger] ${leads.length} neue Leads per WhatsApp verschickt.`);
}

main().catch((err) => {
  console.error('[48-lead-jaeger] Fehler:', err);
  process.exit(1);
});
