// Such-Radar: Suchbegriffe, Fragen, Hashtags ohne fremde Marken, Hinweis fuer die Video-Fabrik.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stichwort, handleAus, vorschlaegeLesen, rangliste, fragen, hashtags, produktRadar, suchHinweis } from '../../automations/lib/suchRadar.mjs';
import { WERKZEUGE4 } from '../../mcp-ultimativ/werkzeuge4.mjs';

test('stichwort nimmt den Produkt-Begriff hinter dem Markennamen', () => {
  assert.equal(stichwort('DeskRebel PowerBand – Klimmzugband & Widerstandsband'), 'klimmzugband');
  assert.equal(stichwort('Purivelle LotusTap – Massagehammer zur Muskelentspannung'), 'massagehammer');
  assert.equal(stichwort('DeskRebel O-Loop – Latex-Widerstandsring für Arme & Rücken'), 'widerstandsring');
  assert.equal(stichwort('Purivelle TapRelax – Silikon-Klopfpaddel zur Selbstmassage'), 'klopfpaddel');
  assert.equal(stichwort('DeskRebel ArmForce – Power-Twister für Arme'), 'power twister');
  assert.equal(stichwort('DeskRebel DoorKit – Türanker, Griffe & Karabiner'), 'türanker');
  assert.equal(handleAus('https://x.store/products/powerband-x?variant=1'), 'powerband-x');
});

test('Vorschlaege lesen, ranken und Fragen erkennen', () => {
  assert.deepEqual(vorschlaegeLesen('["a",["Klimmzugband Test","wie benutze ich ein klimmzugband"]]'), ['klimmzugband test', 'wie benutze ich ein klimmzugband']);
  assert.deepEqual(vorschlaegeLesen('<html>'), []);
  const r = rangliste([['klimmzugband', 'klimmzugband übungen', 'klimmzugband stärke'], ['klimmzugband übungen']], 'klimmzugband');
  assert.equal(r[0], 'klimmzugband übungen');
  assert.ok(!r.includes('klimmzugband'), 'Grundbegriff selbst ist keine Erkenntnis');
  const n = 'DeskRebel PowerBand – Klimmzugband & Widerstandsband';
  assert.deepEqual(fragen(['wie lange klimmzugband', 'klimmzugband rot', 'lohnt sich ein klimmzugband', 'klimmzugband erfahrungen', 'klimmzugband test', 'beste kraftübungen wie oft'], n), ['wie lange klimmzugband', 'lohnt sich ein klimmzugband'], 'keine Test-/Bewertungs-Suchen, nur zum Produkt');
  assert.deepEqual(fragen(['massageroller cellulite wie lange', 'massageroller wie anwenden', 'silikon wie reinigen'], 'Purivelle SculptRoll – Massageroller für Faszien'), ['massageroller wie anwenden'], 'keine Heilversprechen-Fragen');
});

test('Hashtags nur aus eigenen Produkt- und Nischenwoertern - keine fremden Marken', () => {
  const t = hashtags(['klimmzugband decathlon', 'klimmzugband amazon', 'klimmzugband übungen rücken', 'theragun klimmzugband'], 'DeskRebel PowerBand – Klimmzugband & Widerstandsband');
  assert.ok(t.includes('#klimmzugband'));
  assert.ok(t.includes('#rücken'));
  assert.ok(!t.some((x) => /decathlon|amazon|theragun/.test(x)), t.join(' '));
  const m = hashtags(['massageliege test', 'massage hammer holz', 'massagehammer massage'], 'Purivelle LotusTap – Holz-Massagehammer');
  assert.ok(m.includes('#massagehammer') && m.includes('#massage'));
  assert.ok(!m.some((x) => /massageliege|holz/.test(x)), 'keine fremden Produkte, keine Materialwoerter');
});

test('produktRadar fragt Google und YouTube mit Zusaetzen ab und uebersteht Ausfaelle', async () => {
  const urls = [];
  const laden = async (u) => {
    urls.push(u);
    if (urls.length === 3) return new Response('x', { status: 500 });
    const q = decodeURIComponent(new URL(u).searchParams.get('q'));
    const yt = u.includes('ds=yt');
    return new Response(JSON.stringify([q, [q, `wie benutzt man ${q}`, yt ? `${q} workout` : `${q} rücken`]]));
  };
  const r = await produktRadar({ name: 'DeskRebel PowerBand – Klimmzugband & Widerstandsband', shop: 'DeskRebel' }, { laden, pause: 0 });
  assert.equal(urls.length, 10);
  assert.equal(urls.filter((u) => u.includes('ds=yt')).length, 5);
  assert.ok(urls.some((u) => u.includes('q=beste%20klimmzugband')));
  assert.ok(r.youtube.some((s) => s.includes('workout')));
  assert.ok(r.fragen.length > 0);
});

test('suchHinweis gibt der Fabrik echte Fragen - nur frisch und nur fuers richtige Produkt', () => {
  const pfad = join(mkdtempSync(join(tmpdir(), 'such-')), 's.json');
  const e = { name: 'X', google: ['a b'], youtube: [], fragen: ['wie lange klimmzugband'], hashtags: [] };
  writeFileSync(pfad, JSON.stringify({ stand: new Date().toISOString(), produkte: { 'power-x': e } }));
  assert.match(suchHinweis({ handle: 'power-x' }, pfad), /wie lange klimmzugband/);
  assert.match(suchHinweis({ handle: 'power-x' }, pfad), /nichts erfinden/);
  assert.equal(suchHinweis({ handle: 'anders' }, pfad), '');
  assert.equal(suchHinweis({ handle: 'power-x' }, pfad, Date.now() + 5 * 864e5), '', 'alte Daten werden nicht benutzt');
  assert.equal(suchHinweis({ handle: 'x' }, '/gibt/es/nicht'), '');
});

test('MCP kennt das Werkzeug suchbegriffe', () => {
  assert.ok(WERKZEUGE4.some((w) => w.name === 'suchbegriffe'));
});
