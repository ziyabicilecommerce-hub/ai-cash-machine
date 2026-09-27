export const connections=[
 {id:'ltx23',name:'LTX 2.3',model:'Lightricks/LTX-2.3',space:'Lightricks/LTX-2-3',host:'https://lightricks-ltx-2-3.hf.space',api:'generate_video',kind:'ltx23',maxDuration:10,params:['input_image','prompt','duration','enhance_prompt','seed','randomize_seed','height','width']},
 {id:'fastwan',name:'FastWan 2.2 · 5B',model:'FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers',space:'kingnish/wan2-2-fast',host:'https://kingnish-wan2-2-fast.hf.space',api:'generate_video',kind:'fastwan',maxDuration:8,params:['input_image','prompt','height','width','negative_prompt','duration_seconds','guidance_scale','steps','seed','randomize_seed']},
 {id:'wanrcm',name:'Wan 2.2 · 14B rCM',model:'Wan-AI/Wan2.2-I2V-A14B-Diffusers',space:'linoyts/wan2-2-i2v-rcm',host:'https://linoyts-wan2-2-i2v-rcm.hf.space',api:'generate_video',kind:'wan14',maxDuration:5,params:['input_image','prompt','steps','negative_prompt','duration_seconds','guidance_scale','guidance_scale_2','seed','randomize_seed']},
 {id:'wanaot',name:'Wan 2.2 · 14B AOT',model:'Wan-AI/Wan2.2-I2V-A14B-Diffusers',space:'zerogpu-aoti/wan2-2-fp8da-aoti-faster',host:'https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space',api:'generate_video',kind:'wan14',maxDuration:5,params:['input_image','prompt','steps','negative_prompt','duration_seconds','guidance_scale','guidance_scale_2','seed','randomize_seed']},
 {id:'ltx098',name:'LTX Video · 13B distilled',model:'Lightricks/LTX-Video-0.9.8-13B-distilled',space:'Lightricks/ltx-video-distilled',host:'https://lightricks-ltx-video-distilled.hf.space',api:'image_to_video',kind:'ltx098',maxDuration:8.5,params:['prompt','negative_prompt','input_image_filepath','input_video_filepath','height_ui','width_ui','mode','duration_ui','ui_frames_to_use','seed_ui','randomize_seed','ui_guidance_scale','improve_texture_flag']}
];
const negative='distorted product, deformed hands, extra fingers, watermark, subtitles, text, blurry, flicker';
export function requestData(connection,{image,prompt,duration=4}){
 const u=new URL(image);if(u.protocol!=='https:')throw new Error('Das Produktbild benötigt eine sichere HTTPS-Adresse.');
 if(!prompt?.trim()||prompt.length>4000)throw new Error('Bitte eine Videobeschreibung mit 1 bis 4000 Zeichen verwenden.');
 const d=Number(duration);if(!Number.isFinite(d)||d<1||d>connection.maxDuration)throw new Error('Die gewählte Dauer wird von diesem Modell nicht unterstützt.');
 const file={path:u.href,meta:{_type:'gradio.FileData'}};
 switch(connection.kind){
  case 'ltx23':return [file,prompt,d,true,42,true,832,480];
  case 'fastwan':return [file,prompt,832,480,negative,d,0,4,42,true];
  case 'wan14':return [file,prompt,6,negative,d,1,1,42,true];
  case 'ltx098':return [prompt,negative,file,null,832,480,'image-to-video',d,9,42,true,1,true];
  default:throw new Error('Unbekannte Videoverbindung.');
 }
}
export function classifyError(error){
 const s=String(error?.message||error||'Unbekannter Fehler');
 if(error?.name==='AbortError')return {kind:'cancel',text:'Verbindung abgebrochen. Ein bereits gestarteter Serverauftrag kann noch weiterlaufen.'};
 if(/quota|rate.limit|429|exceed|gpu.*limit|daily.*limit/i.test(s))return {kind:'quota',text:'Das kostenlose Kontingent des Anbieters ist ausgeschöpft. Die Generierung stoppt; ein Modellwechsel erweitert dieses gemeinsame Kontingent nicht.'};
 if(/401|403|auth|sign.in|login|token|forbidden/i.test(s))return {kind:'auth',text:'Der Anbieter verlangt aktuell eine Anmeldung oder lehnt den Zugriff ab. Es wird kein kostenpflichtiger Dienst gestartet.'};
 if(/timeout|deadline|zeitlimit/i.test(s))return {kind:'timeout',text:'Der Anbieter hat innerhalb des Zeitlimits kein Ergebnis geliefert. Es wurde kein Video als fertig markiert.'};
 if(/fetch|network|failed to fetch/i.test(s))return {kind:'network',text:'Die Verbindung zum Videodienst ist fehlgeschlagen. Netzwerk oder Anbieter können den Zugriff blockieren.'};
 return {kind:'provider',text:s.slice(0,350)};
}
export function parseEvents(text){
 const blocks=text.split(/\r?\n\r?\n/);const rest=blocks.pop();
 return {rest,events:blocks.map(block=>{
  const lines=block.split(/\r?\n/);return {event:lines.find(l=>l.startsWith('event:'))?.slice(6).trim()||'message',data:lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n')};
 }).filter(e=>e.data)};
}
export function outputVideo(data,connection){
 const candidates=[];
 function walk(v){if(typeof v==='string'){if(/\.mp4|\.webm|\/gradio_api\/file=|\/file=/i.test(v))candidates.push(v);}else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(v.url)walk(v.url);if(v.path)walk(v.path);for(const [k,value]of Object.entries(v))if(k!=='url'&&k!=='path')walk(value);}}
 walk(data);
 for(const raw of candidates){
  let url;if(raw.startsWith('https://'))url=new URL(raw);else if(raw.startsWith('/gradio_api/file=')||raw.startsWith('/file='))url=new URL(raw,connection.host);else if(raw.startsWith('/tmp/')||raw.startsWith('/data/'))url=new URL('/gradio_api/file='+raw,connection.host);else continue;
  if(url.protocol==='https:'&&url.origin===connection.host)return url.href;
 }
 throw new Error('Der Anbieter hat keinen gültigen Video-Link zurückgegeben.');
}
async function check(connection,signal){
 const response=await fetch(connection.host+'/gradio_api/info',{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])});
 if(!response.ok)throw new Error('Verbindungsprüfung: HTTP '+response.status);
 const info=await response.json(),p=info.named_endpoints?.['/'+connection.api]?.parameters;
 if(!p||p.map(x=>x.parameter_name).join('|')!==connection.params.join('|'))throw new Error('Die Schnittstelle des Anbieters hat sich geändert.');
}
export async function chooseConnection(id,signal,onStatus=()=>{},duration=4){
 const candidates=id==='auto'?connections:connections.filter(c=>c.id===id);
 const eligible=candidates.filter(c=>c.maxDuration>=duration);if(!eligible.length)throw new Error('Kein angeschlossenes Modell unterstützt diese Dauer.');
 for(const connection of eligible){
  signal.throwIfAborted();onStatus('Prüfe '+connection.name+' …');
  try{await check(connection,signal);return connection;}catch(e){if(signal.aborted)throw e;const kind=classifyError(e).kind;if(kind==='quota'||kind==='auth')throw e;onStatus(connection.name+': aktuell nicht erreichbar.');}
 }
 throw new Error('Aktuell ist keine passende kostenlose Videoverbindung erreichbar. Bitte später erneut versuchen.');
}
export async function generate(connection,input,{signal,onStatus=()=>{}}){
 const combined=AbortSignal.any([signal,AbortSignal.timeout(360000)]);
 const base=connection.host+'/gradio_api/call/'+connection.api;
 onStatus('Sende Produktbild und Beschreibung an '+connection.name+' …');
 const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:requestData(connection,input)}),signal:combined});
 if(!response.ok)throw new Error('Generierung: HTTP '+response.status+' '+(await response.text()).slice(0,140));
 const job=await response.json();if(!/^[a-zA-Z0-9_-]{8,100}$/.test(job.event_id||''))throw new Error('Der Anbieter hat keinen gültigen Auftrag zurückgegeben.');
 onStatus('Auftrag angenommen. Warte auf GPU und Generierung …');
 const stream=await fetch(base+'/'+encodeURIComponent(job.event_id),{signal:combined,headers:{Accept:'text/event-stream'}});
 if(!stream.ok||!stream.body)throw new Error('Ergebnisverbindung: HTTP '+stream.status);
 const reader=stream.body.getReader(),decoder=new TextDecoder();let buffer='';
 try{
  while(true){
   const {value,done}=await reader.read();if(done)break;
   buffer+=decoder.decode(value,{stream:true});const parsed=parseEvents(buffer);buffer=parsed.rest;
   for(const event of parsed.events){
    let data;try{data=JSON.parse(event.data);}catch{throw new Error('Ungültige Antwort des Videodienstes.');}
    if(event.event==='error')throw new Error(data?.error||data?.message||(typeof data==='string'?data:'Der Videodienst hat die Generierung ohne Fehlerdetails beendet. Es wurde kein Video erstellt.'));
    if(event.event==='heartbeat')onStatus('Verbindung aktiv. Warte auf das Ergebnis …');
    if(event.event==='generating')onStatus('Der Anbieter verarbeitet dein Video …');
    if(event.event==='complete')return {url:outputVideo(data,connection),connection:connection.name,model:connection.model};
   }
  }
  throw new Error('Die Ergebnisverbindung wurde ohne fertiges Video beendet.');
 }finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
