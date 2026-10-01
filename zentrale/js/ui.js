// Gemeinsame Oberflächen-Bausteine: Escaping, Formate, Diagramme, Meldungen.
(function (root) {
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (x) => (Number(x) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const eur0 = (x) => (Number(x) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const zahl = (x, st = 0) => (Number(x) || 0).toLocaleString('de-DE', { maximumFractionDigits: st, minimumFractionDigits: st });
  const pct = (x, st = 1) => (x > 0 ? '+' : '') + zahl(x, st) + ' %';
  const datum = (d) => { const [j, m, t] = String(d).split('-'); return `${t}.${m}.${j.slice(2)}`; };
  const prioName = { hoch: 'Dringend', mittel: 'Wichtig', info: 'Info' };

  function chip(prio) { return `<span class="chip ${h(prio)}">${h(prioName[prio] || prio)}</span>`; }

  function aufgabenListe(aufgaben, mitAgent = true) {
    if (!aufgaben.length) return '<p class="klein-text">Keine offenen Punkte.</p>';
    return `<ul class="aufgaben">${aufgaben.map((a) => `
      <li class="aufgabe" data-prio="${h(a.prio)}">
        <span class="t">${h(a.titel)}</span>
        ${mitAgent ? `<span class="wer">${h(a.agent)}</span>` : ''}
        <span class="x">${h(a.text)}</span>
        ${a.ziel ? `<button class="knopf klein" data-gehe="${h(a.ziel)}">Öffnen</button>` : ''}
      </li>`).join('')}</ul>`;
  }

  function tabelle(spalten, zeilen) {
    return `<div class="tabelle-huelle"><table><thead><tr>${spalten.map((s) => `<th class="${s.z ? 'z' : ''}">${h(s.t)}</th>`).join('')}</tr></thead>
      <tbody>${zeilen.map((z) => `<tr>${spalten.map((s, i) => `<td class="${s.z ? 'z' : ''}">${z[i]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function balken(eintraege, format) {
    const max = Math.max(...eintraege.map((e) => e.wert), 0) || 1;
    return `<div class="balken">${eintraege.map((e) => `
      <div class="zeile"><span>${h(e.name)}</span><span class="spur"><span class="fuell" style="width:${Math.max(1, (e.wert / max) * 100).toFixed(1)}%;${e.farbe ? `background:${e.farbe}` : ''}"></span></span><span class="wert">${format(e.wert, e)}</span></div>`).join('')}</div>`;
  }

  // Umsatz pro Woche plus Prognose mit 80%-Band, alles auf einer gemeinsamen y-Skala.
  function umsatzDiagramm(reihe, prognose) {
    const B = Math.round(Math.min(720, Math.max(330, (root.innerWidth || 720) - 70))), H = B < 500 ? 220 : 240, L = 52, R = 26, O = 12, U = 28;
    const ist = reihe.map((r) => ({ x: r.woche, y: r.umsatz }));
    const prog = prognose.punkte || [];
    const alle = [...ist.map((p) => p.y), ...prog.map((p) => p.max)];
    if (ist.length < 2) return '<p class="klein-text">Für ein Diagramm braucht es Bestellungen aus mindestens zwei Wochen.</p>';
    const n = ist.length + prog.length, ymax = 4 * schoeneObergrenze(Math.max(...alle, 1) / 4);
    const x = (i) => L + (i / Math.max(n - 1, 1)) * (B - L - R), y = (v) => O + (1 - v / ymax) * (H - O - U);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ymax);
    const linie = ist.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
    const flaeche = `${linie}L${x(ist.length - 1).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;
    const s = ist.length - 1;
    const progLinie = prog.length ? `M${x(s)},${y(ist[s].y)}` + prog.map((p, i) => `L${x(s + i + 1).toFixed(1)},${y(p.wert).toFixed(1)}`).join('') : '';
    const band = prog.length ? `M${x(s)},${y(ist[s].y)}` + prog.map((p, i) => `L${x(s + i + 1).toFixed(1)},${y(p.max).toFixed(1)}`).join('') + [...prog].reverse().map((p, i) => `L${x(s + prog.length - i).toFixed(1)},${y(p.min).toFixed(1)}`).join('') + 'Z' : '';
    const schritt = Math.max(1, Math.ceil(n / Math.floor(B / 95)));
    const xLabels = [...ist.map((p) => p.x), ...prog.map((p) => p.woche)].map((w, i) => (i % schritt === 0 ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : 'middle'}">${h(datum(w).slice(0, 5))}</text>` : '')).join('');
    return `<div class="diagramm"><svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Umsatz pro Woche mit Prognose">
      <defs><linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd8ff" stop-opacity="0.28"/><stop offset="1" stop-color="#5fd8ff" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((t) => `<line x1="${L}" x2="${B - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#1b2f3a" stroke-width="1"/><text x="${L - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${h(kurz(t, ymax))}</text>`).join('')}
      <path d="${flaeche}" fill="url(#fl)"/>
      ${band ? `<path d="${band}" fill="rgba(242,177,84,0.16)"/>` : ''}
      <path d="${linie}" fill="none" stroke="#5fd8ff" stroke-width="2.2" stroke-linejoin="round"/>
      ${progLinie ? `<path d="${progLinie}" fill="none" stroke="#f2b154" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
      <circle cx="${x(s).toFixed(1)}" cy="${y(ist[s].y).toFixed(1)}" r="4" fill="#5fd8ff"/>
      ${xLabels}
    </svg>
    <div class="legende"><span><i></i>Umsatz pro Woche</span>${prog.length ? '<span><i class="prog"></i>Prognose</span><span><i class="band"></i>80 % Spanne</span>' : ''}</div></div>`;
  }

  function schoeneObergrenze(v) {
    const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function kurz(v, max) { return max >= 2000 ? zahl(v / 1000, v % 1000 ? 1 : 0) + ' T€' : zahl(v) + ' €'; }

  let toastTimer;
  function meldung(text) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  async function kopieren(text, feld) {
    try { await navigator.clipboard.writeText(text); meldung('Kopiert'); } catch (e) {
      if (feld) { feld.focus(); feld.select(); meldung('Markiert: jetzt mit Strg+C bzw. Teilen kopieren'); }
    }
  }

  function formDaten(form) { const o = {}; for (const [k, v] of new FormData(form).entries()) o[k] = String(v).trim(); return o; }

  root.ZUI = { h, eur, eur0, zahl, pct, datum, chip, aufgabenListe, tabelle, balken, umsatzDiagramm, meldung, kopieren, formDaten };
})(window);
