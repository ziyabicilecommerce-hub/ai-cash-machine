// Schatten-Serie: postet eine fertig gerenderte Folge über Buffer auf ein TikTok-Konto (mit KI-Kennzeichnung).
// Aufruf: node posten.mjs <folge.json> <video-url> <buffer-kanal-id>   (Secret BUFFER_ACCESS_TOKEN)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { API, POST_MUTATION, postInput } from '../lib/bufferPoster.mjs';

const TAGS = '#horror #gruselgeschichte #horrorstory #creepy #fyp #serie';

// Beschreibung: Hook + Frage an die Zuschauer (für Kommentare), Teil-Nummer, Hashtags und klarer KI-Hinweis.
export function serienText(folge) {
  const teil = String(folge.titel || '').match(/Teil (\d+)/)?.[1];
  const kopf = String(folge.caption || folge.titel || '').trim();
  return `${kopf}${teil ? ` (Teil ${teil}/12)` : ''}\n\n${TAGS} #teil${teil || ''}\n(KI-generiert, frei erfundene Geschichte)`.slice(0, 2200);
}

export const serienTitel = (folge) => String(folge.titel || '').slice(0, 90);

async function main() {
  const [datei, url, kanal] = process.argv.slice(2);
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!datei || !/^https:\/\//.test(url || '') || !/^[a-f\d]{24}$/.test(kanal || '')) throw new Error('Aufruf: node posten.mjs <folge.json> <https-video-url> <kanal-id>');
  if (!token) { console.log('[schatten] BUFFER_ACCESS_TOKEN fehlt - nicht gepostet.'); process.exit(2); }
  const folge = JSON.parse(readFileSync(datei, 'utf8'));
  const input = postInput(kanal, serienText(folge), url, { titel: serienTitel(folge) });
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: POST_MUTATION, variables: { input } }) });
  const daten = await res.json().catch(() => ({}));
  const ergebnis = daten?.data?.createPost;
  if (!res.ok || !ergebnis || ergebnis.__typename === 'MutationError' || daten.errors) {
    console.log('[schatten] Posten fehlgeschlagen:', res.status, ergebnis?.message || JSON.stringify(daten.errors || daten).slice(0, 300));
    process.exit(1);
  }
  console.log('[schatten] gepostet:', folge.titel, ergebnis.post?.id, ergebnis.post?.status);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
