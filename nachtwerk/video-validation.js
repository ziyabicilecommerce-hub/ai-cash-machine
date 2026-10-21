/** Strict validation for genuine generated video imports. */
export function validateVideoFile(file) {
  if (!file) return {ok:false, reason:'Keine Videodatei ausgewählt.'};
  const name = String(file.name || '');
  const type = String(file.type || '').toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase();
  if (!['mp4','webm','mov','m4v'].includes(ext) || (type && !type.startsWith('video/')))
    return {ok:false,reason:'Nur echte Videodateien (MP4, WebM, MOV, M4V) sind erlaubt.'};
  if (!Number.isFinite(file.size) || file.size < 1024)
    return {ok:false,reason:'Die Datei ist leer oder zu klein für ein Video.'};
  return {ok:true,reason:'Videodatei akzeptiert; Bewegung muss visuell geprüft werden.'};
}
export function videoProvenance(source) {
  return source === 'generated-verified' ? 'KI-Video: vom Nutzer als generiert bestätigt (nicht automatisch verifiziert)'
    : 'Videoimport: Ursprung und generative Bewegung nicht verifiziert';
}
