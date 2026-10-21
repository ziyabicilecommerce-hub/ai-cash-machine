/** Browser-only shot planning helpers; no synthetic video claims. */
export function timecode(seconds, fps=24) {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isInteger(fps) || fps < 1 || fps > 120) throw new RangeError('Ungültiger Timecode');
  const frames = Math.floor(seconds * fps + 1e-7);
  const hh = Math.floor(frames / (fps*3600));
  const mm = Math.floor(frames / (fps*60)) % 60;
  const ss = Math.floor(frames / fps) % 60;
  return [hh,mm,ss,frames%fps].map(v=>String(v).padStart(2,'0')).join(':');
}
export function shotPrompt({subject='',action='',camera='statisch',location='',lighting='natürlich',duration=5}={}) {
  const fields=[subject,action,camera,location,lighting].map(x=>String(x).trim());
  if (!fields[0] || !fields[1]) throw new Error('Motiv und Handlung fehlen');
  if (!Number.isFinite(Number(duration)) || Number(duration)<1 || Number(duration)>30) throw new RangeError('Dauer: 1–30 Sekunden');
  return `Fotorealistischer Filmclip, ${Number(duration)} Sekunden. Motiv: ${fields[0]}. Echte Handlung: ${fields[1]}. Kamera: ${fields[2]}. Ort: ${fields[3] || 'nicht festgelegt'}. Licht: ${fields[4]}. Durchgehende natürliche Körperbewegung, zeitlich konsistente Frames, realistische Physik, keine Standbild-Kamerafahrt. Keine Schnitte.`;
}
export function validateShotList(shots) {
  if (!Array.isArray(shots) || shots.length>100) return false;
  return shots.every(s=>s && typeof s.prompt==='string' && s.prompt.length>0 && Number.isFinite(s.duration) && s.duration>=1 && s.duration<=30);
}
export function shotListSrt(shots) {
  if (!validateShotList(shots)) throw new Error('Ungültige Shotliste');
  let offset=0;
  return shots.map((s,i)=>{const a=offset;offset+=s.duration;const f=t=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`};return `${i+1}\n${f(a)} --> ${f(offset)}\n${s.prompt}\n`;}).join('\n');
}
