// Video lernt aus Zahlen: Posts merken, echte Zahlen holen, Lernstand rechnen, Auswahl mit Lernen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { postId, postMerken, postsLaden, lernstandRechnen, waehlen, wert, HOLER } from '../../automations/lib/leistung.mjs';
import { sammeln } from '../../automations/leistung-sammler.mjs';

test('postId liest die IDs aus den Rueckmeldungen der Plattformen', () => {
  assert.equal(postId('Instagram', 'Reel 1789'), '1789');
  assert.equal(postId('YouTube', 'Video abC-9_x (public)'), 'abC-9_x');
  assert.equal(postId('Bluesky', 'Video-Post at://did:plc:x/app.bsky.feed.post/3k'), 'at://did:plc:x/app.bsky.feed.post/3k');
  assert.equal(postId('Mastodon', 'Status 1123 https://m.social/@x/1123'), '1123');
  assert.equal(postId('Telegram', 'Video'), '', 'ohne ID kein Eintrag');
});

test('postMerken legt Posts mit Hook-Typ, Winkel und Format ab', () => {
  const pfad = join(mkdtempSync(join(tmpdir(), 'lst-')), 'posts.json');
  postMerken({ datei: 'a-B.mp4', gruppe: 'a', hookTyp: 'frage', winkel: 'Schmerz', formatName: 'pov' }, 'YouTube', 'Video x1 (public)', { pfad });
  postMerken({ datei: 'a.mp4' }, 'Telegram', 'Video', { pfad });
  const p = postsLaden(pfad);
  assert.equal(p.length, 1);
  assert.equal(JSON.stringify([p[0].id, p[0].gruppe, p[0].hookTyp, p[0].winkel, p[0].format]), '["x1","a","frage","Schmerz","pov"]');
});

const post = (plattform, datei, hookTyp, zahlen, gruppe = 'g') => ({ plattform, id: datei, datei, gruppe, hookTyp, winkel: '', format: '', zahlen });

test('lernstandRechnen vergleicht je Plattform und findet den Gewinner der 3 Anfaenge', () => {
  const posts = [
    post('YouTube', 'A', 'frage', { aufrufe: 900 }), post('YouTube', 'A', 'frage', { aufrufe: 1100 }),
    post('YouTube', 'B', 'warnung', { aufrufe: 100 }), post('YouTube', 'B', 'warnung', { aufrufe: 120 }),
    post('Bluesky', 'A', 'frage', { likes: 9, kommentare: 1, teilen: 0 }), post('Bluesky', 'B', 'warnung', { likes: 2, kommentare: 0, teilen: 0 }),
    post('Bluesky', 'C', 'widerspruch', null),
  ];
  const s = lernstandRechnen(posts);
  assert.equal(s.posts, 6, 'ohne Zahlen wird nicht bewertet');
  assert.ok(s.hookTyp.frage.punkte > 0 && s.hookTyp.warnung.punkte < 0);
  assert.equal(s.gruppen.g.gewinner, 'A');
  assert.equal(wert({ likes: 1, kommentare: 1, teilen: 1 }), 6);
});

test('waehlen probiert Unbekanntes zuerst, dann gewinnt das Beste', () => {
  assert.equal(waehlen(['frage', 'warnung'], { frage: { n: 3, punkte: 0.2 } }), 'warnung');
  assert.equal(waehlen(['frage', 'warnung'], { frage: { n: 30, punkte: 0.5 }, warnung: { n: 30, punkte: -0.4 } }), 'frage');
});

test('sammeln misst nur reife Posts mit vorhandenem Zugang (Bluesky oeffentlich)', async () => {
  const jetzt = Date.parse('2026-10-05T12:00:00Z');
  const posts = [
    { plattform: 'Bluesky', id: 'at://x/1', gepostet: '2026-10-03T12:00:00Z', zahlen: null },
    { plattform: 'Bluesky', id: 'at://x/2', gepostet: '2026-10-05T10:00:00Z', zahlen: null },
    { plattform: 'YouTube', id: 'yt', gepostet: '2026-10-03T12:00:00Z', zahlen: null },
  ];
  const laden = async (url) => new Response(JSON.stringify({ posts: [{ likeCount: 4, replyCount: 1, repostCount: 2, quoteCount: 0 }] }), { headers: { 'content-type': 'application/json' } });
  const alt = process.env.YOUTUBE_REFRESH_TOKEN; delete process.env.YOUTUBE_REFRESH_TOKEN;
  assert.equal(await sammeln(posts, { jetzt, laden }), 1);
  if (alt) process.env.YOUTUBE_REFRESH_TOKEN = alt;
  assert.equal(posts[0].zahlen.likes, 4);
  assert.equal(posts[1].zahlen, null, 'zu frisch');
  assert.equal(posts[2].zahlen, null, 'kein YouTube-Zugang');
  assert.ok(HOLER.Instagram && HOLER.Facebook && HOLER.Mastodon);
});
