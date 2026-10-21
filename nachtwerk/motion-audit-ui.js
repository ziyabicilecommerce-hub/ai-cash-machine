import {auditVideo} from './motion-audit.js';
const input=document.getElementById('nw34MotionFile'),button=document.getElementById('nw34MotionRun'),status=document.getElementById('nw34MotionStatus');
button?.addEventListener('click',async()=>{
 const file=input.files?.[0];if(!file){status.textContent='Bitte ein Video auswählen.';return;}
 button.disabled=true;status.textContent='Videoframes werden dekodiert …';
 try{const r=await auditVideo(file,{onProgress:(i,n)=>status.textContent=`Frame ${i}/${n} untersucht …`});status.textContent=`${r.width}×${r.height} · ${r.duration.toFixed(2)} s · ${r.changed}/${r.comparisons} Vergleiche mit messbarer Pixeländerung (${(r.mean*100).toFixed(2)} % mittlere Änderung). ${r.classification}. Dies beweist weder KI-Ursprung noch natürliches Gehen oder echte 3D-Bewegung.`;}
 catch(e){status.textContent=`Prüfung fehlgeschlagen: ${e.message}`;}
 finally{button.disabled=false;}
});
