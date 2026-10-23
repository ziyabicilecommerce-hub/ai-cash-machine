// NACHTWERK-Bot-Netzwerk: Auftrag als vorausgefülltes GitHub-Issue (Label video-bot) - kein Schlüssel im Browser nötig.
// Der Workflow nachtwerk-bots.yml baut daraus das Video und antwortet im Issue.
const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Repo aus der Pages-Adresse (<owner>.github.io/<repo>/...), sonst das bekannte Repo.
const REPO = location.hostname.endsWith('.github.io')
  ? `${location.hostname.split('.')[0]}/${location.pathname.split('/').filter(Boolean)[0] || ''}`
  : 'ziyabicilecommerce-hub/ai-cash-machine';

let bots = [];
let gewaehlt = null;

function waehlen(bot) {
  gewaehlt = bot;
  for (const k of document.querySelectorAll('.bot')) k.setAttribute('aria-pressed', String(k.dataset.id === bot.id));
  $('idee').placeholder = 'z. B. ' + bot.beispiel;
  $('shots').value = bot.shots;
  $('stil').value = bot.stil;
  $('geschichte').checked = bot.geschichte;
}

function bestellen(event) {
  event.preventDefault();
  const idee = $('idee').value.trim();
  if (idee.length < 5) return $('idee').focus();
  const auftrag = {
    bot: gewaehlt.id, idee, shots: Number($('shots').value) || gewaehlt.shots, sekunden: Number($('sekunden').value) || 3.5,
    stil: $('stil').value, geschichte: $('geschichte').checked, krass: $('krass').checked, text: $('text').value.trim(),
  };
  const body = `${gewaehlt.emoji} **${gewaehlt.name}** – Auftrag aus NACHTWERK. Nicht verändern, nur auf „Create“ tippen.\n\n\`\`\`json\n${JSON.stringify(auftrag, null, 2)}\n\`\`\`\n`;
  const url = new URL(`https://github.com/${REPO}/issues/new`);
  url.searchParams.set('labels', 'video-bot');
  url.searchParams.set('title', `🎬 ${gewaehlt.name}: ${idee.slice(0, 80)}`);
  url.searchParams.set('body', body);
  window.open(url.toString(), '_blank', 'noopener');
}

async function auftraegeLaden() {
  const liste = $('auftraege');
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/issues?labels=video-bot&state=all&per_page=10`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(res.status);
    const issues = await res.json();
    liste.innerHTML = issues.length
      ? issues.map((i) => `<li><a href="${esc(i.html_url)}" target="_blank" rel="noopener">${esc(i.title)}</a><span class="status ${i.state === 'open' ? 'offen' : ''}">${i.state === 'open' ? '⏳ in Arbeit' : '✅ fertig'}</span></li>`).join('')
      : '<li class="leise">Noch keine Aufträge.</li>';
  } catch {
    liste.innerHTML = '<li class="leise">Aufträge gerade nicht abrufbar.</li>';
  }
}

async function start() {
  ({ bots } = await (await fetch('./bots.json')).json());
  $('bots').innerHTML = bots.map((b) => `<button type="button" class="bot" data-id="${esc(b.id)}" aria-pressed="false"><span class="emoji">${esc(b.emoji)}</span><b>${esc(b.name)}</b><small>${esc(b.text)}</small></button>`).join('');
  for (const k of document.querySelectorAll('.bot')) k.addEventListener('click', () => waehlen(bots.find((b) => b.id === k.dataset.id)));
  waehlen(bots[0]);
  $('form').addEventListener('submit', bestellen);
  auftraegeLaden();
}

start();
