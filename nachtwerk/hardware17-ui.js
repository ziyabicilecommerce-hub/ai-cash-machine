import {HARDWARE,chooseHardware,validateSpaceId,spaceUrl} from './hardware17.js';
const $=id=>document.getElementById(id);
const mode=$('nw17Mode'),result=$('nw17Status'),space=$('nw17Space');
if(mode){
 for(const h of HARDWARE){const o=document.createElement('option');o.value=h.id;o.textContent=`${h.name} · ${h.memory}`;mode.append(o);}
 function show(){const h=chooseHardware(mode.value);$('nw17Details').textContent=`${h.name} | ${h.memory} | ${h.cost}. ${h.note}`;}
 mode.addEventListener('change',show);show();
 $('nw17Detect').addEventListener('click',async()=>{
  const lines=[`Browser: ${navigator.userAgentData?.platform||navigator.platform||'unbekannt'}`];
  if(!navigator.gpu){lines.push('WebGPU: nicht verfügbar.');}else{
   try{const adapter=await navigator.gpu.requestAdapter();if(!adapter)lines.push('WebGPU: kein Adapter verfügbar.');else{
    const info=adapter.info||{};lines.push(`WebGPU: verfügbar (${info.description||info.vendor||'Adapter erkannt'}).`);
    const device=await adapter.requestDevice();lines.push(`maxBufferSize: ${Math.round(Number(device.limits.maxBufferSize)/1048576)} MiB (kein VRAM-Messwert).`);device.destroy();
   }}catch(e){lines.push('WebGPU-Abfrage fehlgeschlagen: '+e.message);}
  }
  lines.push('Cloud-GPU: nicht reserviert. GPU-Zuteilung nur durch den jeweiligen Space.');result.textContent=lines.join('\n');
 });
 $('nw17Open').addEventListener('click',()=>{try{const url=spaceUrl(space.value.trim());window.open(url,'_blank','noopener,noreferrer');result.textContent='Space geöffnet. Status und Hardware werden dort geprüft; kein Render gestartet.';}catch(e){result.textContent=e.message;}});
 $('nw17Transfer').addEventListener('click',()=>{
  const id=space.value.trim();if(!validateSpaceId(id)){result.textContent='Bitte gültige Space-ID owner/name eingeben.';return;}
  const dest=$('nw13Space');if(!dest){result.textContent='Multi-Modell-Lab nicht gefunden.';return;}
  dest.value=id;result.textContent='Space-ID an Multi-Modell-Lab übertragen. Hardware nicht reserviert; API muss dort geprüft werden.';dest.dispatchEvent(new Event('input',{bubbles:true}));
 });
}
