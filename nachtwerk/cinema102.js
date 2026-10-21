export const cameras={tracking:'smooth stabilized tracking shot, natural parallax and depth',handheld:'subtle handheld camera, realistic inertia, controlled micro-movement',dolly:'slow cinematic dolly-in, clear foreground-background separation',orbit:'controlled 30-degree camera orbit with stable geometry',static:'locked-off camera, subject motion only'};
export const looks={noir:'cinematic noir, low-key lighting, deep blacks, delicate rim light',rain:'wet streets, rain reflections, volumetric neon haze',natural:'natural skin tones, soft practical lighting, restrained film grain',horror:'moonlit fog, subtle warm practicals, suspenseful chiaroscuro'};
export function makeCinemaPrompt({scene,camera='tracking',look='natural',duration=5,ratio='16:9',quality='high'}){
 if(typeof scene!=='string'||!scene.trim())throw Error('Szenenbeschreibung fehlt');
 if(scene.length>2000)throw Error('Beschreibung zu lang');
 if(!cameras[camera]||!looks[look])throw Error('Unbekannte Einstellung');
 if(!Number.isInteger(duration)||duration<2||duration>20)throw Error('Dauer außerhalb 2–20 Sekunden');
 if(!['16:9','9:16','1:1'].includes(ratio))throw Error('Ungültiges Format');
 const detail=quality==='high'?'Detailed textures, coherent lighting and shadows, believable human biomechanics, temporally consistent faces and clothing, physically plausible contact and motion.':'Clear subject, consistent motion, stable background.';
 return `CINEMATIC VIDEO BRIEF\nScene: ${scene.trim()}\nCamera: ${cameras[camera]}.\nLighting / grade: ${looks[look]}.\nMotion: A continuous ${duration}-second moving shot with meaningful subject action, natural acceleration and deceleration, no slideshow or simulated still-image zoom.\nQuality: ${detail}\nFraming: ${ratio}, cinematic composition, subject remains visible and consistent.\nAvoid: flicker, morphing, duplicated limbs, floating feet, warped architecture, unintended cuts, text overlays, logos.`;
}
