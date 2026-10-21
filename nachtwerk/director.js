/** Offline filmmaking helpers. Never claim that an outline or stock shot is AI-generated. */
export function sortByShotNumber(files) {
  return Array.from(files || []).sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "de", { numeric: true, sensitivity: "base" }));
}

export function inspectFilm(project) {
  const scenes = Array.isArray(project?.scenes) ? project.scenes : [];
  const realFilm = project?.source === "real-footage-guide";
  const clips = scenes.filter(s => s.media?.type === "video").length;
  const stills = scenes.filter(s => s.media?.type === "image").length;
  const missing = scenes.map((s, index) => !s.media ? index + 1 : null).filter(Boolean);
  const narration = scenes.filter(s => String(s.narration || "").trim()).length;
  const seconds = scenes.reduce((sum, s) => sum + Number(s.duration || 0), 0);
  const problems = [];
  if (realFilm && missing.length) problems.push(`${missing.length} Realfilm-Szenen ohne echte Clips (${missing.join(", ")}). Dort erscheinen noch Illustrationen.`);
  if (realFilm && clips === 0) problems.push("Der Realfilm ist noch eine Vorlage: echte Aufnahmen müssen importiert werden.");
  if (narration && !project.audio) problems.push("Sprechertext erzeugt nicht automatisch exportierbare Sprache. Für eine deutsche Filmstimme eine Audiospur aufnehmen, importieren oder im lokalen Kit erzeugen.");
  if (realFilm && clips) problems.push("Stockaufnahmen können unterschiedliche Menschen zeigen. Ohne ein separates Modell entsteht kein lippensynchron gesprochenes deutsches Schauspiel.");
  if (!scenes.length || seconds > 600 || seconds < 2) problems.push("Die Gesamtlänge muss zwischen 2 und 600 Sekunden liegen.");
  return {scenes: scenes.length, clips, stills, missing, narration, seconds, hasAudio: Boolean(project?.audio), realFilm, problems};
}

export function germanVoices(voices) {
  return Array.from(voices || [])
    .filter(v => String(v.lang || "").toLowerCase().startsWith("de"))
    .sort((a, b) => {
      const rank = v => Number(/natural|neural|enhanced|premium/i.test(v.name || "")) * 3
        + Number(String(v.lang).toLowerCase() === "de-de") * 2
        + Number(v.localService === true);
      return rank(b) - rank(a) || String(a.name).localeCompare(String(b.name), "de");
    });
}
