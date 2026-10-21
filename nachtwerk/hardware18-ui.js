import {FLAGSHIP,validateEndpoint,hardwareSummary} from './hardware18.js';
const $=id=>document.getElementById(id);
const status=$('nw18Status');
if(status){
 $('nw18Spec').textContent=hardwareSummary();
 $('nw18Details').textContent=FLAGSHIP.description;
 $('nw18Docs').href=FLAGSHIP.source;
 $('nw18Check').addEventListener('click',async()=>{
  const raw=$('nw18Endpoint').value.trim();
  if(!raw){status.textContent='Kein Endpoint eingetragen. Das Profil ist nur eine Hardware-Referenz; keine GPU verbunden.';return;}
  let origin;try{origin=validateEndpoint(raw);}catch(e){status.textContent=e.message;return;}
  status.textContent='Prüfe die Erreichbarkeit des angegebenen Endpoints …';
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),6000);
  try{
   const response=await fetch(origin,{method:'GET',mode:'cors',signal:controller.signal,cache:'no-store'});
   status.textContent=response.ok?`HTTP ${response.status} von ${origin}. Nur Netzwerk-Erreichbarkeit bestätigt – keine GPU, Authentifizierung oder Videogenerierung nachgewiesen.`:`HTTP ${response.status} von ${origin}. Keine verfügbare GPU nachgewiesen.`;
  }catch(e){status.textContent=`Endpoint nicht verifizierbar (${e.name==='AbortError'?'Zeitüberschreitung':'Netzwerk/CORS'}). Keine GPU verbunden.`;}
  finally{clearTimeout(timeout);}
 });
 $('nw18Copy').addEventListener('click',async()=>{
  const config={hardware:FLAGSHIP,endpoint:$('nw18Endpoint').value.trim()||null,connected:false,renderVerified:false};
  const blob=new Blob([JSON.stringify(config,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='nachtwerk18-hardware-profil.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  status.textContent='Hardware-Profil exportiert. Kein Cloud-Zugriff freigeschaltet.';
 });
}
