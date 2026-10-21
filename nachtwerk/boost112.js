export const PRESETS = [
 ['Horror','Eine Frau betritt nachts ein verlassenes Herrenhaus','tracking','horror'],
 ['Sci-Fi','Eine Astronautin entdeckt eine verlassene Raumstation','dolly','noir'],
 ['Action','Ein Kurier flieht durch eine regennasse Stadt','handheld','rain'],
 ['Fantasy','Eine Reisende entdeckt ein schwebendes Schloss','orbit','natural'],
 ['Mystery','Ein Detektiv folgt einem Schatten durch einen Tunnel','tracking','noir'],
 ['Cyberpunk','Ein Android geht durch einen Neonmarkt','tracking','rain'],
 ['Naturfilm','Ein Wolf streift durch einen nebligen Wald','dolly','natural'],
 ['Drama','Zwei Freunde treffen sich am Bahnhof wieder','static','natural'],
 ['Thriller','Eine Person hört Schritte in einem leeren Parkhaus','handheld','noir'],
 ['Abenteuer','Eine Entdeckerin findet eine verborgene Tempeltür','orbit','natural']
];
export function makeShots(subject, count=5){
 const stages=['Wide establishing shot','Medium tracking shot','Close-up reaction shot','Over-the-shoulder action shot','Wide resolution shot'];
 const actions=['establish location and atmosphere','show natural walking and interaction','capture subtle facial reaction','follow the key action continuously','end with a memorable cinematic reveal'];
 return Array.from({length:count},(_,i)=>({shot:i+1,prompt:`${subject}. ${stages[i%5]}; ${actions[i%5]}. Photorealistic live-action video, natural body mechanics, consistent character and wardrobe, physically plausible lighting, continuous temporal motion, no freeze frame.`,duration:5}));
}
export function auditPrompt(s){const warnings=[];if(s.trim().length<25)warnings.push('Beschreibe die Handlung genauer.');if(!/walk|lauf|geh|öffn|open|move|beweg|renn|run|turn|dreh/i.test(s))warnings.push('Konkrete sichtbare Bewegung ergänzen.');if(!/light|licht|night|nacht|day|tag|neon|sonne/i.test(s))warnings.push('Licht oder Tageszeit ergänzen.');if(!/camera|kamera|shot|tracking|dolly|handheld/i.test(s))warnings.push('Kameraführung ergänzen.');return warnings;}
export function exportProject(shots){return JSON.stringify({format:'nachtwerk-shots-1',created:new Date().toISOString(),shots},null,2)};
