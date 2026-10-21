export function auditWorkflow(w) {
 const errors=[], warnings=[];
 if (!w || typeof w!=='object'||Array.isArray(w)||!Object.keys(w).length) return {valid:false,errors:['Leerer oder ungültiger API-Workflow'],warnings,videoSavers:[],modelNodes:[]};
 const nodes=Object.entries(w);
 for(const [id,n] of nodes){if(!n||typeof n.class_type!=='string'||!n.inputs||typeof n.inputs!=='object')errors.push(`Knoten ${id}: kein API-Format`);}
 const savers=nodes.filter(([,n])=>/VHS_VideoCombine|SaveVideo|VideoCombine|SaveAnimatedWEBP|SaveAnimatedPNG|SaveWEBM|SaveMP4/i.test(n?.class_type||''));
 const models=nodes.filter(([,n])=>/UNETLoader|CheckpointLoader|Wan|LTX|Hunyuan|ModelSampling|KSampler|SamplerCustom/i.test(n?.class_type||''));
 if(!savers.length) errors.push('Kein Video-Speicherknoten erkannt. Ein SaveImage-Knoten erzeugt kein Video.');
 if(!models.length) warnings.push('Kein bekannter Modell-/Sampler-Knoten erkannt; benutzerdefinierte Nodes können trotzdem funktionieren.');
 const serialized=JSON.stringify(w);
 if(!serialized.includes('{{prompt}}'))warnings.push('Platzhalter {{prompt}} fehlt; Szenenprompt wird eventuell nicht übernommen.');
 if(!/frames|length|num_frames|video_frames|image|samples/i.test(serialized))warnings.push('Frame-Eingang nicht eindeutig erkannt.');
 return {valid:errors.length===0,errors,warnings,videoSavers:savers.map(([id,n])=>`${id}: ${n.class_type}`),modelNodes:models.map(([id,n])=>`${id}: ${n.class_type}`)};
}
