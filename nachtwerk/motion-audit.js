/** Checks sampled decoded frames for pixel changes; NOT a proof of AI origin or natural motion. */
export function frameDifference(a,b){
 if(!a || !b || a.length!==b.length || a.length===0 || a.length%4) throw new Error('Ungültige Frame-Daten');
 let sum=0, n=0;
 for(let i=0;i<a.length;i+=4){sum+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);n+=3;}
 return sum/(n*255);
}
export function summarizeMotion(differences,threshold=0.012){
 if(!Array.isArray(differences)||!differences.length||differences.some(x=>!Number.isFinite(x)||x<0||x>1)) throw new Error('Keine gültigen Frame-Vergleiche');
 const changed=differences.filter(x=>x>=threshold).length;
 return {comparisons:differences.length,changed,mean:differences.reduce((a,b)=>a+b,0)/differences.length,classification:changed===0?'Keine messbare Pixeländerung':changed===differences.length?'Pixeländerungen in allen Vergleichen':'Teilweise Pixeländerungen'};
}
export async function auditVideo(file,{samples=7,onProgress=()=>{}}={}){
 if(!(file instanceof Blob)||!file.type.startsWith('video/'))throw new Error('Videodatei erforderlich');
 const url=URL.createObjectURL(file), video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;video.src=url;
 const wait=(event)=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{cleanup();reject(new Error('Video-Zeitüberschreitung'));},15000);function cleanup(){clearTimeout(timeout);video.removeEventListener(event,done);video.removeEventListener('error',fail);}function done(){cleanup();resolve();}function fail(){cleanup();reject(new Error('Video konnte nicht dekodiert werden'));}video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});});
 try{
  await wait('loadedmetadata');
  if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth||!video.videoHeight)throw new Error('Ungültige Videodauer oder Auflösung');
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas nicht verfügbar');
  let previous=null;const differences=[];
  for(let i=0;i<samples;i++){
   const t=Math.min(video.duration-0.001,video.duration*(i+0.5)/samples);
   video.currentTime=t;await wait('seeked');ctx.drawImage(video,0,0,64,36);
   const pixels=ctx.getImageData(0,0,64,36).data;
   if(previous)differences.push(frameDifference(previous,pixels));previous=new Uint8ClampedArray(pixels);onProgress(i+1,samples);
  }
  return {...summarizeMotion(differences),duration:video.duration,width:video.videoWidth,height:video.videoHeight};
 }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
