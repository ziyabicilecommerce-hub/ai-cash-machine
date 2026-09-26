export const TIMES = ['09:00','12:00','15:00','18:00','21:00'];
const QUESTIONS = [
 ['Wie beginnt dein Feierabend?','Handy weg oder Playlist an?','Was darf auf deinem Sofa nicht fehlen?','Welche kleine Pause passt heute?','Was war heute dein guter Moment?'],
 ['Eine Minute nur für dich.','Dein Lieblingsplatz zu Hause?','Klein, aber Teil deiner Routine.','Team Ruhe oder Team Musik?','Welches Ritual würdest du weiterempfehlen?'],
 ['Deine Pause braucht keinen Anlass.','Was gehört in deine Alltagstasche?','Ein Detail genauer ansehen.','Was möchtest du über unsere Produkte wissen?','Zeit für einen kleinen Check-in.'],
 ['Weniger scrollen. Mehr Feierabend.','Was bedeutet Gemütlichkeit für dich?','Dein Produkt-Favorit der Woche?','Welche Farbe passt zu deinem Zuhause?','Ein Satz über deinen Tag.'],
 ['Heute darf es einfach sein.','Lieber morgens oder abends?','Was schaust du dir zuerst an?','Ihr entscheidet den nächsten Beitrag.','Wofür nimmst du dir am Wochenende Zeit?'],
 ['Ein freier Moment im Wochenende.','Welches Ritual möchtest du behalten?','Aus unserem Sortiment: ein näherer Blick.','Was fehlt dir in deinem Feierabend?','Dein kleiner Wochenrückblick.'],
 ['Ein guter Start beginnt mit dir.','Was nimmst du dir nächste Woche vor?','Zehn Produkte. Dein Favorit?','Welche Frage sollen wir nächste Woche beantworten?','Wir hören zu. Was wünschst du dir?'],
];
const SUBS = ['Ein kleiner Moment, der nur dir gehört.','Erzähl uns von deiner Routine.','Originalprodukt aus unserem Sortiment.','Deine Antwort macht den nächsten Beitrag mit.','Speichere dir einen Moment für morgen.'];
const SERIES = ['Der kleine Feierabend','Eure Rituale','Ein Detail','Ihr entscheidet','Abend-Check-in'];
export function datePlus(iso, days) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Bitte ein gültiges Startdatum auswählen.');
 const d=new Date(iso+'T12:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso) throw new Error('Ungültiges Datum.');
 d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
export function buildPlan(products, start, mode='mix') {
 if(!products.length) throw new Error('Es sind keine Produkte verfügbar.');
 if(!['mix','bild','video'].includes(mode)) throw new Error('Unbekanntes Format.');
 return QUESTIONS.flatMap((day,d)=>day.map((headline,i)=>{
  const product=products[(d*3+i)%products.length];
  const type=mode==='mix'?(i===0||i===3?'video':'bild'):mode;
  const subline=SUBS[i];
  const detail=i===2?`Heute im Fokus: ${product.title}. Schau dir die Produktdetails im Shop an. Welches Detail interessiert dich besonders?`:`${headline} ${subline}`;
  return {id:`${datePlus(start,d)}-${i}`,date:datePlus(start,d),time:TIMES[i],day:d,type,headline,subline,series:SERIES[i],productId:product.id,caption:`${detail}\n\n${i===2?product.url:'Entdecke Purivelle: https://purivelle.store/'}\n\n#Purivelle #Feierabend #Alltagsrituale`,status:'Entwurf'};
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
