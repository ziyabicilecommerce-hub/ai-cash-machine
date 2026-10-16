// Einmal-Probe (Branch): was bietet Pollinations für Video ohne/mit Schlüssel?
const urls = [
  'https://gen.pollinations.ai/docs',
  'https://gen.pollinations.ai/openapi.json',
  'https://gen.pollinations.ai/docs/openapi.json',
  'https://gen.pollinations.ai/image/models',
  'https://gen.pollinations.ai/models',
  'https://gen.pollinations.ai/v1/models',
  'https://image.pollinations.ai/models',
  'https://enter.pollinations.ai/api/docs/open-api/generate-schema',
];
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' } });
    const t = await r.text();
    console.log(`\n=== ${u} -> ${r.status} (${t.length} Zeichen)`);
    const treffer = t.match(/.{0,160}(video|seedance|wan|veo|pollen|duration).{0,200}/gi) || [];
    console.log((treffer.length ? treffer.slice(0, 25).join('\n---\n') : t.slice(0, 1500)));
  } catch (e) { console.log(`\n=== ${u} -> FEHLER ${e.message}`); }
}
// Ohne Schlüssel ein Video versuchen
for (const u of ['https://gen.pollinations.ai/image/a%20cat%20running?model=seedance&duration=3', 'https://gen.pollinations.ai/video/a%20cat%20running?model=seedance&duration=3']) {
  try {
    const r = await fetch(u);
    const b = Buffer.from(await r.arrayBuffer());
    console.log(`\n=== VIDEO ${u} -> ${r.status} ${r.headers.get('content-type')} ${b.length} B ${b.subarray(0, 300).toString().replace(/[^\x20-\x7e]/g, '.')}`);
  } catch (e) { console.log(`VIDEO FEHLER ${e.message}`); }
}
