// Kommentar-Agent: ehrlich antworten, Heikles melden, Spam ignorieren, nie doppelt, keine Namen/Texte im Repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vorfilter, entscheiden, ADAPTER } from '../../automations/lib/kommentare.mjs';
import { lauf } from '../../automations/kommentar-agent.mjs';

const post = { titel: 'DeskRebel PowerBand', caption: 'Klimmzugband 4 Stärken 👉 https://www.deskrebel.store/products/powerband', shopLink: 'https://www.deskrebel.store/products/powerband' };

test('Vorfilter: Spam und Gesundheitsthemen sicher erkannt', () => {
  assert.equal(vorfilter('Check my page www.spam.xyz'), 'spam');
  assert.equal(vorfilter('Hilft das bei Bandscheibenvorfall?'), 'gesundheit');
  assert.equal(vorfilter('Wie viel kostet das?'), '');
  assert.equal(vorfilter('Top Produkt!'), '', '"top" ist kein "OP"');
});

test('entscheiden: Kauffrage beantworten, Kritik melden, fremde Links blocken', async () => {
  const kauf = await entscheiden({ autor: 'a', text: 'Wo kann ich das kaufen?' }, post, async () => ({ kategorie: 'kauf', antwort: `Hier entlang 👉 ${post.shopLink}` }));
  assert.equal(kauf.aktion, 'antworten');
  assert.equal((await entscheiden({ text: 'Meine Bestellung kam nie an!' }, post, async () => ({ kategorie: 'kritik', antwort: 'x' }))).aktion, 'melden');
  assert.equal((await entscheiden({ text: 'Link?' }, post, async () => ({ kategorie: 'kauf', antwort: 'Hier: https://fremd.example/x' }))).grund, 'Antwort enthielt fremden Link');
  assert.equal((await entscheiden({ text: 'Spam www.x.de' }, post, async () => { throw new Error('darf nicht aufgerufen werden'); })).aktion, 'ignorieren');
  assert.equal((await entscheiden({ text: 'Hilft das gegen Arthrose?' }, post, async () => { throw new Error('nein'); })).aktion, 'melden');
});

test('lauf: antwortet einmal, meldet Heikles, speichert keine Namen oder Texte', async () => {
  const jetzt = Date.parse('2026-10-05T12:00:00Z');
  const geantwortet = [];
  const adapter = { Bluesky: {
    bereit: () => true, eigen: (k) => k.autor === 'ich.bsky.social',
    lesen: async () => [
      { id: 'c1', autor: 'kunde', text: 'Was kostet das Band?', zeit: '2026-10-05T10:00:00Z' },
      { id: 'c2', autor: 'max', text: 'Hilft das bei Rückenschmerzen?', zeit: '2026-10-05T10:00:00Z' },
      { id: 'c3', autor: 'ich.bsky.social', text: 'eigener Kommentar', zeit: '2026-10-05T10:00:00Z' },
      { id: 'c4', autor: 'alt', text: 'Alter Kommentar', zeit: '2026-09-20T10:00:00Z' },
    ],
    antworten: async (k, t) => { geantwortet.push([k.id, t]); return 'r1'; },
  } };
  const posts = [{ plattform: 'Bluesky', id: 'at://p', datei: 'v.mp4', gepostet: '2026-10-04T12:00:00Z' }, { plattform: 'X', id: '1', datei: 'v.mp4', gepostet: '2026-10-04T12:00:00Z' }];
  const feed = [{ datei: 'v.mp4', titel: post.titel, caption: post.caption }];
  const ki = async () => ({ kategorie: 'kauf', antwort: `19,99 € 👉 ${post.shopLink}` });
  const state = { erledigt: {} };
  const r = await lauf({ posts, feed, state, ki, jetzt, pause: 0, adapter });
  assert.equal(JSON.stringify(geantwortet.map((x) => x[0])), '["c1"]');
  assert.equal(r.zaehler.melden, 1);
  assert.match(r.meldungen[0], /Gesundheitsfrage/);
  const gespeichert = JSON.stringify(r.state);
  assert.ok(!/kunde|max|Band\?|Rückenschmerzen/.test(gespeichert), 'keine Namen/Texte im Repo-State');
  const r2 = await lauf({ posts, feed, state: r.state, ki, jetzt, pause: 0, adapter });
  assert.equal(r2.zaehler.antworten, 0, 'nie doppelt antworten');
});

test('Bluesky-Adapter liest Antworten mit Referenzen fuer die Antwort', async () => {
  const laden = async () => new Response(JSON.stringify({ thread: { post: { uri: 'at://root', cid: 'rc' }, replies: [{ post: { uri: 'at://r1', cid: 'c1', author: { handle: 'kunde.bsky.social' }, record: { text: 'Preis?', createdAt: '2026-10-05T10:00:00Z' } } }] } }));
  const l = await ADAPTER.Bluesky.lesen({ id: 'at://root' }, laden);
  assert.equal(l[0].text, 'Preis?');
  assert.equal(JSON.stringify(l[0].ref), '{"root":{"uri":"at://root","cid":"rc"},"parent":{"uri":"at://r1","cid":"c1"}}');
});
