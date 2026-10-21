import {auditWorkflow} from './workflow-audit.js';
const input=document.getElementById('nw100Workflow'),output=document.getElementById('nw100Audit');
input?.addEventListener('change',async()=>{
 const f=input.files?.[0];if(!f)return;
 try{if(f.size>2*1024*1024)throw Error('Workflow größer als 2 MB');const a=auditWorkflow(JSON.parse(await f.text()));output.textContent=`${a.valid?'STRUKTURPRÜFUNG BESTANDEN':'NICHT BEREIT'}\nVideo-Knoten: ${a.videoSavers.join(', ')||'keine'}\nModell-Knoten: ${a.modelNodes.join(', ')||'nicht erkannt'}\n${a.errors.map(x=>'FEHLER: '+x).join('\n')}\n${a.warnings.map(x=>'HINWEIS: '+x).join('\n')}\n\nDiese statische Prüfung lädt kein Modell und beweist keine Generierung.`;}catch(e){output.textContent='Fehler: '+e.message;}
});
