import {SPACE,SPACE_URL,DEFAULT_PROMPT,buildLtxArgs,findVideo} from './ltx12.js';
const $=id=>document.getElementById(id);let job=null;
function status(message){$('ltx12Status').textContent=message}
function init(){
 $('ltx12Prompt').value=DEFAULT_PROMPT;
 $('ltx12Open').href=SPACE_URL;
 $('ltx12Copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('ltx12Prompt').value);status('Prompt kopiert.')}catch{status('Kopieren nicht verfügbar. Prompt im Textfeld markieren.')}});
 $('ltx12Render').addEventListener('click',async()=>{
  const button=$('ltx12Render');let args;
  try{args=buildLtxArgs({prompt:$('ltx12Prompt').value,duration:$('ltx12Duration').value,ratio:$('ltx12Ratio').value});}catch(e){return status(e.message)}
  button.disabled=true;$('ltx12Cancel').disabled=false;$('ltx12Video').hidden=true;$('ltx12Result').hidden=true;
  try{
   status('Verbinde den öffentlichen LTX-2.3 Space …');
   const {Client}=await import('https://cdn.jsdelivr.net/npm/@gradio/client@1.20.1/+esm');
   const client=await Client.connect(SPACE);
   const api=await client.view_api();
   const endpoints=api?.named_endpoints||{};
   const found=Object.entries(endpoints).find(([name,ep])=>/generate/i.test(name)&&ep?.parameters?.length===11);
   if(!found)throw Error('Der Space hat aktuell keinen passenden öffentlichen 11-Parameter-Generate-Endpoint. API kann sich geändert haben. Nutze „Space öffnen“.');
   status('Starte echte Video-KI – GPU-Warteschlange möglich …');
   job=client.submit(found[0],args);let result=null;
   for await(const msg of job){
    if(msg.type==='status')status('Cloud-Status: '+(msg.stage||'Warteschlange')+(Number.isFinite(msg.position)?' · Platz '+msg.position:''));
    if(msg.type==='data'){result=findVideo(msg.data);if(result)break;}
   }
   if(!result)throw Error('Keine Video-Datei zurückgegeben. GPU-Limit, Space-Fehler oder geändertes Antwortformat möglich.');
   $('ltx12Video').src=result;$('ltx12Video').hidden=false;
   $('ltx12Result').href=result;$('ltx12Result').hidden=false;
   status('Video vom KI-Dienst empfangen. Bitte Ergebnis prüfen.');
  }catch(e){status('Render nicht erfolgreich: '+String(e.message||e).slice(0,450));}
  finally{job=null;button.disabled=false;$('ltx12Cancel').disabled=true;}
 });
 $('ltx12Cancel').addEventListener('click',()=>{if(job){job.cancel();status('Abbruch angefordert.')}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
