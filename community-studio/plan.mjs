export const TIMES = ['09:00','12:00','15:00','18:00','21:00'];
const PURIVELLE_QUESTIONS = [
 ['Wie beginnt dein Feierabend?','Handy weg oder Playlist an?','Was darf auf deinem Sofa nicht fehlen?','Welche kleine Pause passt heute?','Was war heute dein guter Moment?'],
 ['Eine Minute nur für dich.','Dein Lieblingsplatz zu Hause?','Klein, aber Teil deiner Routine.','Team Ruhe oder Team Musik?','Welches Ritual würdest du weiterempfehlen?'],
 ['Deine Pause braucht keinen Anlass.','Was gehört in deine Alltagstasche?','Ein Detail genauer ansehen.','Was möchtest du über unsere Produkte wissen?','Zeit für einen kleinen Check-in.'],
 ['Weniger scrollen. Mehr Feierabend.','Was bedeutet Gemütlichkeit für dich?','Dein Produkt-Favorit der Woche?','Welche Farbe passt zu deinem Zuhause?','Ein Satz über deinen Tag.'],
 ['Heute darf es einfach sein.','Lieber morgens oder abends?','Was schaust du dir zuerst an?','Ihr entscheidet den nächsten Beitrag.','Wofür nimmst du dir am Wochenende Zeit?'],
 ['Ein freier Moment im Wochenende.','Welches Ritual möchtest du behalten?','Aus unserem Sortiment: ein näherer Blick.','Was fehlt dir in deinem Feierabend?','Dein kleiner Wochenrückblick.'],
 ['Ein guter Start beginnt mit dir.','Was nimmst du dir nächste Woche vor?','Zehn Produkte. Dein Favorit?','Welche Frage sollen wir nächste Woche beantworten?','Wir hören zu. Was wünschst du dir?'],
];
const DESKREBEL_QUESTIONS = [
 ['Kein Gym. Kein Problem.','Was trainierst du heute zu Hause?','Ein kompaktes Teil, viele Möglichkeiten.','Was passt in dein Home-Gym?','Team Kraft oder Team Cardio?'],
 ['Dein Training. Dein Tempo.','Welche Übung gehört in jeden Plan?','Klein genug für die Schublade.','Was motiviert dich dranzubleiben?','Zeig dein Setup.'],
 ['Kurze Pause. Ein paar Wiederholungen.','Welche Muskelgruppe ist heute dran?','Grip-Check: wie lange hältst du?','Was liegt immer in deiner Trainingstasche?','Dein nächstes Trainingsziel?'],
 ['Training braucht kein großes Studio.','Seilspringen oder Krafttraining?','Heute stellen wir ein Detail vor.','Welche Variante würdest du wählen?','Was hilft dir, Routine zu halten?'],
 ['Gear auspacken. Loslegen.','Dein Lieblings-Workout für zu Hause?','Ein Blick auf das Material.','Mit wem trainierst du am liebsten?','Eine kleine Runde zählt auch.'],
 ['Was ist dein Wochenend-Workout?','Einfach anfangen. Schritt für Schritt.','Trainierst du lieber drinnen oder draußen?','Welche Frage sollen wir beantworten?','Was möchtest du nächste Woche schaffen?'],
 ['Dein Körper. Dein Spielfeld.','Welches Gear würdest du mitnehmen?','Zehn Produkte. Was passt zu dir?','Was war dein stärkster Trainingsmoment?','Dein Plan für die nächste Woche?'],
];
const SUBS = ['Ein kleiner Moment, der nur dir gehört.','Erzähl uns von deiner Routine.','Originalprodukt aus unserem Sortiment.','Deine Antwort macht den nächsten Beitrag mit.','Speichere dir einen Moment für morgen.'];
const DESK_SUBS = ['Kompakt verstaut, schnell startklar.','Erzähl uns von deinem Training.','Originalprodukt aus unserem Sortiment.','Deine Antwort macht den nächsten Beitrag mit.','Speichere dir deine nächste Trainingsidee.'];
const SERIES = ['Der kleine Feierabend','Eure Rituale','Ein Detail','Ihr entscheidet','Abend-Check-in'];
export function datePlus(iso, days) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Bitte ein gültiges Startdatum auswählen.');
 const d=new Date(iso+'T12:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso) throw new Error('Ungültiges Datum.');
 d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
export function buildPlan(products, start, mode='mix', brand='purivelle') {
 if(!products.length) throw new Error('Es sind keine Produkte verfügbar.');
 if(!['mix','bild','video'].includes(mode)) throw new Error('Unbekanntes Format.');
 const questions=brand==='deskrebel'?DESKREBEL_QUESTIONS:PURIVELLE_QUESTIONS;
 const domain=brand==='deskrebel'?'https://www.deskrebel.store/':'https://purivelle.store/';
 const tag=brand==='deskrebel'?'#DeskRebel #HomeGym #Training':'#Purivelle #Feierabend #Alltagsrituale';
 const series=brand==='deskrebel'?['Kein Gym. Kein Problem.','Dein Trainings-Setup','Ein Detail','Ihr entscheidet','Rebel Check']:SERIES;
 return questions.flatMap((day,d)=>day.map((headline,i)=>{
  const product=products[(d*3+i)%products.length];
  const type=mode==='mix'?(i===0||i===3?'video':'bild'):mode;
  const subline=(brand==='deskrebel'?DESK_SUBS:SUBS)[i];
  const detail=i===2?`Heute im Fokus: ${product.title}. Schau dir die Produktdetails an. Welches Detail interessiert dich besonders?`:`${headline} ${subline}`;
  return {id:`${brand}-${datePlus(start,d)}-${i}`,brand,date:datePlus(start,d),time:TIMES[i],day:d,type,headline,subline,series:series[i],productId:product.id,caption:`${detail}\n\n${i===2?product.url:domain}\n\n${tag}`,status:'Entwurf'};
 }));
}
export function csvCell(v) {const s=String(v??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
export function planCSV(plan, products) {
 const header=['Datum','Uhrzeit (Europe/Berlin)','Serie','Format','Überschrift','Text','Produkt','Bild-URL','Status'];
 return '\uFEFF'+[header,...plan.map(p=>{const product=products.find(x=>x.id===p.productId);return [p.date,p.time,p.series,p.type,p.headline,p.caption,product?.title,product?.image,p.status];})].map(r=>r.map(csvCell).join(',')).join('\r\n');
}
export function autolistCSV(plan, products) {
 // Metricool Autolist uses exactly two columns, without a header or dates.
 return '\uFEFF'+plan.filter(p=>p.type==='bild').map(p=>[p.caption,products.find(x=>x.id===p.productId)?.image].map(csvCell).join(',')).join('\r\n');
}
