import {verifyGPUCompute} from './gpu-compute-check.js';
const button=document.getElementById('nw33Compute');
button?.addEventListener('click',async()=>{
 const status=document.getElementById('nw33ComputeStatus');button.disabled=true;status.textContent='GPU wird geprüft …';
 try {const r=await verifyGPUCompute(navigator.gpu);status.textContent=`GPU-Rechentest bestanden: ${r.values.join(', ')}. Keine Video-KI installiert.`;}
 catch(e){status.textContent=`GPU-Rechentest fehlgeschlagen: ${e.message}`;}
 finally{button.disabled=false;}
});
