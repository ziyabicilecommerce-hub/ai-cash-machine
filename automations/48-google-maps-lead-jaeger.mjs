// Google-Maps-Lead-Jäger - findet Firmen ohne (gute) Website zum Website-Verkauf
// Neu, kein n8n-Workflow · Zeitplan: täglich, siehe automation-48-google-maps-lead-jaeger.yml
// Sucht per Google Maps (über die bestehende Composio-Verbindung, kein eigener
// Google-Cloud-Billing-Account nötig) nach Firmen, prüft ob eine Website fehlt
// oder schlecht ist, und schickt neue Treffer per WhatsApp - Kontaktaufnahme
// übernimmt der Nutzer selbst.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { searchPlaces } from './lib/composioMaps.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { buildLeadPreviewHtml, slugifyLead } from './lib/leadPreview.mjs';

const STATE_NAME = 'lead-jaeger-state';
const MAX_GEPRUEFTE_HISTORIE = 5000;
const FETCH_TIMEOUT_MS = 8000;
const PAGES_BASE_URL = 'https://ziyabicilecommerce-hub.github.io/ai-cash-machine';
// WhatsApp Cloud API begrenzt Text-Nachrichten auf 4096 Zeichen - mit
// Sicherheitsabstand für den Kopftext splitten wir vorher in mehrere Nachrichten.
const WHATSAPP_MAX_CHARS = 3500;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW_DIR = join(__dirname, '..', 'lead-previews');

function parseSuchbegriffe() {
  return config.LEAD_SUCHBEGRIFFE.split(',').map((s) => s.trim()).filter(Boolean);
}

function branchAusSuchbegriff(begriff) {
  return begriff.split(/\s+in\s+/i)[0].trim() || 'Unternehmen';
}

// Normalisiert eine deutsche Telefonnummer auf reine Ziffern im internationalen
// Format (ohne "+"), damit sie mit dem "from"-Feld eingehender WhatsApp-
// Nachrichten verglichen werden kann (der Anruf-Trigger-Worker macht das gleiche).
function normalizeTelefonDE(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('49')) return digits;
  if (digits.startsWith('0')) return '49' + digits.slice(1);
  return digits;
}

const WARTELISTE_STATE_NAME = 'leads-warten-auf-antwort';
const MAX_WARTELISTE = 300;

// Veröffentlicht die Leads mit Telefonnummer, damit der Cloudflare-Worker
// (whatsapp-call-trigger/) erkennen kann, welcher eingehenden WhatsApp-Antwort
// welcher Lead zugeordnet ist, und dafür einen Vapi-Anruf auslösen kann.
function aktualisiereWarteliste(neueLeads) {
  const bestehende = loadState(WARTELISTE_STATE_NAME).leads || [];
  const neueEintraege = neueLeads
    .filter((l) => l.telefon)
    .map((l) => ({
      telefonNormalisiert: normalizeTelefonDE(l.telefon),
      name: l.name,
      branche: l.branche,
      grund: l.grund,
      previewUrl: l.previewUrl,
      hinzugefuegtAm: new Date().toISOString().slice(0, 10),
    }))
    .filter((l) => l.telefonNormalisiert);

  const kombiniert = [...bestehende, ...neueEintraege].slice(-MAX_WARTELISTE);
  saveState(WARTELISTE_STATE_NAME, { leads: kombiniert });
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

function chunkZeilen(zeilen, maxChars) {
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
  const bereitsGeprueft = new Set(state.geprueft || []);
  const maxProLauf = parseInt(config.LEAD_MAX_PRO_LAUF, 10) || 15;

  const leads = [];

  for (const begriff of suchbegriffe) {
    if (leads.length >= maxProLauf) break;
    const branche = branchAusSuchbegriff(begriff);
    const treffer = await searchPlaces(begriff, Math.min(maxProLauf, 20));

    for (const ort of treffer) {
      if (leads.length >= maxProLauf) break;
      if (!ort.id || bereitsGeprueft.has(ort.id)) continue;
      bereitsGeprueft.add(ort.id);

      const website = ort.websiteUri || '';
      const unechteWebsite = website ? erkenneUnechteWebsite(website) : null;
      let grund = null;

      if (!website) {
        grund = 'keine Website';
      } else if (unechteWebsite) {
        grund = `keine echte Website (nur ${unechteWebsite})`;
      } else {
        const qualitaetsGrund = await checkWebsiteQualitaet(website);
        if (qualitaetsGrund) grund = `schlechte Website (${qualitaetsGrund})`;
      }

      if (!grund) continue;

      leads.push({
        name: (ort.displayName && ort.displayName.text) || 'Unbekannt',
        adresse: ort.formattedAddress || '',
        telefon: ort.nationalPhoneNumber || '',
        bewertung: ort.rating || null,
        bewertungenAnzahl: ort.userRatingCount || 0,
        branche,
        grund,
        mapsUrl: ort.googleMapsUri || '',
        placeId: ort.id,
      });
    }
  }

  const historie = [...bereitsGeprueft].slice(-MAX_GEPRUEFTE_HISTORIE);
  saveState(STATE_NAME, { geprueft: historie });

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

  aktualisiereWarteliste(leads);

  const zeilen = leads.map((l, i) => {
    const teile = [`${i + 1}. *${l.name}*`, l.grund];
    if (l.adresse) teile.push(l.adresse);
    if (l.telefon) teile.push(`Tel: ${l.telefon}`);
    teile.push(`Website-Entwurf: ${l.previewUrl}`);
    if (l.mapsUrl) teile.push(l.mapsUrl);
    return teile.join('\n');
  });

  const chunks = chunkZeilen(zeilen, WHATSAPP_MAX_CHARS);
  for (let i = 0; i < chunks.length; i++) {
    const kopf = chunks.length > 1
      ? `🎯 ${leads.length} neue Website-Verkaufs-Leads (Teil ${i + 1}/${chunks.length}):`
      : `🎯 ${leads.length} neue Website-Verkaufs-Leads:`;
    await notifyWhatsapp(`${kopf}\n\n${chunks[i].join('\n\n')}`);
  }

  console.log(`[48-lead-jaeger] ${leads.length} neue Leads per WhatsApp verschickt.`);
}

main().catch((err) => {
  console.error('[48-lead-jaeger] Fehler:', err);
  process.exit(1);
});
