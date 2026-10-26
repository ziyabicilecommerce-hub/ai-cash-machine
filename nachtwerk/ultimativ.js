// ZIYA ULTIMATIV: eine Idee -> Auftrag als vorausgefülltes GitHub-Issue (Label video-bot, ultimativ: true).
// nachtwerk-bots.yml baut daraus den Kurzfilm mit allem (Geschichte, KI-Animation, Parallax, Hook, DE/EN, Radar).
// "Deine Videos": Bot-Aufträge und Tagesvideos mit Titelbild, Status und Fehler-Radar - plus "Teil 2" per Knopf.
const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REPO = typeof location !== 'undefined' && location.hostname.endsWith('.github.io')
  ? `${location.hostname.split('.')[0]}/${location.pathname.split('/').filter(Boolean)[0] || ''}`
  : 'ziyabicilecommerce-hub/ai-cash-machine';
const API = `https://api.github.com/repos/${REPO}`;
const kopf = { headers: { Accept: 'application/vnd.github+json' } };

let bots = [];
let bot = null;
let laenge = { shots: 14, sekunden: 4 };
let effekt = '';

function waehle(gruppe, knopf) {
  for (const k of $(gruppe).querySelectorAll('.chip')) k.setAttribute('aria-pressed', String(k === knopf));
}

export function auftragUrl({ bot: b, idee, shots, sekunden, englisch, serie, preset = '' }, repo = REPO) {
  const auftrag = { bot: b.id, idee, ultimativ: true, shots, sekunden, englisch, ende: serie ? 'Fortsetzung folgt...' : '', ...(preset ? { preset } : {}) };
  const body = `🔥 **ZIYA ULTIMATIV** · ${b.emoji} ${b.name} – Auftrag. Nicht verändern, nur auf „Create“ tippen.\n\n\`\`\`json\n${JSON.stringify(auftrag, null, 2)}\n\`\`\`\n`;
  const url = new URL(`https://github.com/${repo}/issues/new`);
  url.searchParams.set('labels', 'video-bot');
  url.searchParams.set('title', `🔥 ULTIMATIV ${b.emoji}: ${idee.slice(0, 80)}`);
  url.searchParams.set('body', body);
  return url.toString();
}

// Idee aus einem Issue: Tagesvideo ("**Idee:** ...") oder Bestellung (JSON-Block).
export function ideeAusIssue(body) {
  const zeile = String(body || '').match(/\*\*Idee:\*\*\s*(.+)/)?.[1];
  if (zeile) return zeile.trim();
  try { return String(JSON.parse(String(body).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || '{}').idee || ''); } catch { return ''; }
}

// Ampel aus dem letzten Bot-Kommentar (Fehler-Radar), sonst Fortschritt.
export function statusAus(issue, kommentare) {
  const text = kommentare.map((k) => k.body || '').join('\n');
  if (/Fehler-Radar:\*\*\s*🟢/.test(text)) return ['gruen', '🟢 fertig – alles ok'];
  if (/Fehler-Radar:\*\*\n- 🔴/.test(text)) return ['rot', '🔴 fertig – mit Problemen'];
  if (/Fehler-Radar:\*\*\n- 🟡/.test(text)) return ['gelb', '🟡 fertig – Kleinigkeiten'];
  if (/❌/.test(text)) return ['rot', '❌ nicht fertig geworden'];
  if (/✅ Fertig/.test(text)) return ['gruen', '✅ fertig'];
  return ['laeuft', issue.state === 'open' ? '⏳ wird gebaut …' : '–'];
}

async function videosLaden() {
  const feld = $('videos');
  try {
    const [a, b, baum] = await Promise.all([
      fetch(`${API}/issues?labels=video-bot&state=all&per_page=6`, kopf).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/issues?labels=tages-video&state=all&per_page=6`, kopf).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/contents/vorschau?ref=bot-vorschau`, kopf).then((r) => (r.ok ? r.json() : [])),
    ]);
    const namen = Array.isArray(baum) ? baum.map((d) => d.name) : [];
    const issues = [...a, ...b].sort((x, y) => y.number - x.number).slice(0, 10);
    if (!issues.length) { feld.innerHTML = '<span class="leise">Noch keine Videos – bau oben dein erstes!</span>'; return; }
    const karten = await Promise.all(issues.map(async (i) => {
      const kommentare = await fetch(`${API}/issues/${i.number}/comments?per_page=20`, kopf).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      const [klasse, status] = statusAus(i, Array.isArray(kommentare) ? kommentare : []);
      const eigene = namen.filter((n) => n.startsWith(`issue-${i.number}-`)).sort();
      const bild = eigene.filter((n) => n.endsWith('-cover.jpg')).pop() || eigene.pop();
      const src = bild ? `https://raw.githubusercontent.com/${REPO}/bot-vorschau/vorschau/${encodeURIComponent(bild)}` : '';
      const idee = ideeAusIssue(i.body);
      return `<div class="video">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '<div class="platz">🎬</div>'}
        <div class="text"><a href="${esc(i.html_url)}" target="_blank" rel="noopener">${esc(i.title)}</a><span class="status ${klasse}">${esc(status)}</span></div>
        ${idee ? `<button class="weiter" type="button" data-idee="${esc(idee)}">▶ Teil 2 bauen</button>` : ''}</div>`;
    }));
    feld.innerHTML = karten.join('');
    for (const k of feld.querySelectorAll('.weiter')) {
      k.addEventListener('click', () => {
        $('idee').value = `Part 2 – continue this story with the same characters and a bigger twist: ${k.dataset.idee}`.slice(0, 400);
        $('idee').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  } catch {
    feld.innerHTML = '<span class="leise">Videos gerade nicht abrufbar.</span>';
  }
}

async function start() {
  ({ bots } = await (await fetch('./bots.json')).json());
  $('bots').innerHTML = bots.map((b) => `<button type="button" class="chip" data-id="${esc(b.id)}">${esc(b.emoji)} ${esc(b.name.replace(/-Bot$/, ''))}</button>`).join('');
  for (const k of $('bots').querySelectorAll('.chip')) k.addEventListener('click', () => { bot = bots.find((b) => b.id === k.dataset.id); waehle('bots', k); $('idee').placeholder = `z. B. ${bot.beispiel}`; });
  $('bots').querySelector('.chip').click();
  for (const k of $('laenge').querySelectorAll('.chip')) k.addEventListener('click', () => { laenge = { shots: Number(k.dataset.shots), sekunden: Number(k.dataset.sek) }; waehle('laenge', k); });
  for (const k of $('effekt').querySelectorAll('.chip')) k.addEventListener('click', () => { effekt = k.dataset.preset; waehle('effekt', k); });
  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const idee = $('idee').value.trim();
    if (idee.length < 5) return $('idee').focus();
    window.open(auftragUrl({ bot, idee, ...laenge, englisch: $('englisch').checked, serie: $('serie').checked, preset: effekt }), '_blank', 'noopener');
  });
  videosLaden();
}

if (typeof document !== 'undefined') start();
