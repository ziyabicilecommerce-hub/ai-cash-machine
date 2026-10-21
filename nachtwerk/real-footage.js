// Curated Pexels source pages; these are NOT direct video URLs.
// Always let the user download from the publisher site and select the file.
export const REAL_FOOTAGE = Object.freeze([
  {
    "title": "Die Tür steht offen",
    "narration": "Die Tür steht offen. Warum brennt hier noch Licht?",
    "visual": "house",
    "camera": "push",
    "duration": 5,
    "url": "https://www.pexels.com/video/a-woman-going-inside-the-house-4010625/",
    "description": "Frau geht tatsächlich durch eine Haustür",
    "name": "Frau betritt Haus"
  },
  {
    "title": "Schritte im Flur",
    "narration": "Hallo? Ist hier jemand?",
    "visual": "corridor",
    "camera": "left",
    "duration": 5,
    "url": "https://www.pexels.com/video/woman-walking-to-room-at-night-10577431/",
    "description": "Frau bewegt sich durch einen dunklen Flur",
    "name": "Dunkler Flur"
  },
  {
    "title": "Ein Schatten",
    "narration": "Was war das? Da stand gerade jemand!",
    "visual": "corridor",
    "camera": "push",
    "duration": 4,
    "url": "https://www.pexels.com/video/woman-walking-and-getting-scared-at-night-10577436/",
    "description": "Dunkler Durchgang, unheimliche Figur",
    "name": "Schreckmoment"
  },
  {
    "title": "Der Anruf",
    "narration": "Polizei? Bitte schicken Sie jemanden. Ich glaube, hier ist noch jemand im Haus.",
    "visual": "window",
    "camera": "push",
    "duration": 8,
    "url": "https://www.pexels.com/video/scared-woman-calling-911-7699007/",
    "description": "Echte Schauspielerin telefoniert ängstlich",
    "name": "Besorgter Anruf"
  },
  {
    "title": "Das letzte Geräusch",
    "narration": "Moment. Ich höre Schritte ... direkt hinter mir.",
    "visual": "corridor",
    "camera": "pull",
    "duration": 5,
    "url": "https://www.pexels.com/video/a-woman-looking-out-the-door-5867583/",
    "description": "Echte Frau schaut besorgt durch eine Tür",
    "name": "Cliffhanger"
  }
]);
export const REAL_FOOTAGE_TOTAL = REAL_FOOTAGE.reduce((sum, s) => sum + s.duration, 0);
