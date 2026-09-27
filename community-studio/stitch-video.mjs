// Concatenates generated footage. Does not turn product stills into a fake AI video.
export async function stitchScenes(urls,{signal,onStatus=()=>{}}={}){
 if(typeof MediaRecorder==='undefined'||!HTMLCanvasElement.prototype.captureStream)throw new Error('Dein Browser unterstützt den gemeinsamen Videoexport nicht. Die Einzelszenen stehen zum Download bereit.');
 const mime=['video/mp4;codecs=avc1.42E01E','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime)throw new Error('Kein passendes Exportformat verfügbar. Lade die Einzelszenen herunter.');
 if(document.hidden)throw new Error('Bitte das Studio sichtbar lassen, damit die Szenen zu einem Video exportiert werden können.');
 const localUrls=[],clips=[];let recorder,stream,raf=0;
 const visibilityController=new AbortController();
 const onVisibility=()=>{if(document.hidden)visibilityController.abort(new Error('Der Export wurde unterbrochen, weil das Studio nicht mehr sichtbar war. Die Einzelszenen bleiben verfügbar.'));};
 document.addEventListener('visibilitychange',onVisibility);
 const timeout=AbortSignal.any([signal,visibilityController.signal,AbortSignal.timeout(180000)]);
 const event=(target,type)=>new Promise((resolve,reject)=>{
  const cleanup=()=>{target.removeEventListener(type,done);target.removeEventListener('error',fail);timeout.removeEventListener('abort',abort);};
  const done=()=>{cleanup();resolve();};const fail=()=>{cleanup();reject(new Error('Eine generierte Szene konnte nicht gelesen werden.'));};const abort=()=>{cleanup();reject(timeout.reason);};
  timeout.throwIfAborted();target.addEventListener(type,done,{once:true});target.addEventListener('error',fail,{once:true});timeout.addEventListener('abort',abort,{once:true});
 });
 try{
  for(const url of urls){
   const response=await fetch(url,{signal:timeout});if(!response.ok)throw new Error('Eine Szene konnte nicht für den gemeinsamen Export geladen werden.');
   const blob=await response.blob();if(!blob.size)throw new Error('Eine Szene ist leer.');
   const local=URL.createObjectURL(blob);localUrls.push(local);const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';const ready=event(video,'loadedmetadata');video.src=local;await ready;
   if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>30)throw new Error('Die Länge einer Szene ist ungültig.');clips.push(video);
  }
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;const ctx=canvas.getContext('2d');stream=canvas.captureStream(30);
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});const chunks=[];
  const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}));recorder.onerror=()=>reject(new Error('Der gemeinsame Export ist fehlgeschlagen.'));});finished.catch(()=>{});
  let started=false;
  for(let i=0;i<clips.length;i++){
   timeout.throwIfAborted();const video=clips[i];onStatus('Verbinde Szene '+(i+1)+' von '+clips.length+' …');
   const ended=event(video,'ended');ended.catch(()=>{});await video.play();
   const draw=()=>{ctx.fillStyle='#050505';ctx.fillRect(0,0,720,1280);const scale=Math.min(720/video.videoWidth,1280/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale;ctx.drawImage(video,(720-w)/2,(1280-h)/2,w,h);raf=requestAnimationFrame(draw);};
   draw();if(!started){recorder.start(250);started=true;}await ended;cancelAnimationFrame(raf);
  }
  recorder.stop();const blob=await finished;if(!blob.size)throw new Error('Der Export hat keine Videodaten geliefert.');
  return {blob,extension:mime.startsWith('video/mp4')?'mp4':'webm'};
 }finally{
  document.removeEventListener('visibilitychange',onVisibility);cancelAnimationFrame(raf);for(const clip of clips){clip.pause();clip.removeAttribute('src');clip.load();}if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(t=>t.stop());localUrls.forEach(u=>URL.revokeObjectURL(u));
 }
}
