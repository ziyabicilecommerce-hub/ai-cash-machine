export const MODES = Object.freeze({
  horror:{label:'Horror Cinema',light:'cold moonlight, volumetric fog, practical shadows',sound:'creaking wood, distant wind, restrained low-frequency ambience'},
  scifi:{label:'Sci-Fi Epic',light:'cinematic neon rim lighting, atmospheric haze',sound:'mechanical ambience, cinematic synth textures'},
  action:{label:'Action Cinema',light:'high contrast practical lighting, realistic motion blur',sound:'dynamic footsteps, environmental impacts'},
  drama:{label:'Prestige Drama',light:'soft motivated lighting, natural skin tones',sound:'subtle room tone, expressive silence'},
  fantasy:{label:'Fantasy Epic',light:'golden-hour shafts, mist, atmospheric depth',sound:'wind, distant nature, orchestral atmosphere'}
});
export const CAMERAS = Object.freeze({tracking:'steady tracking shot following subject',dolly:'slow dolly-in with foreground parallax',handheld:'restrained natural handheld camera',orbit:'slow orbit with consistent geography',locked:'locked-off tripod composition'});
export const MODELS = Object.freeze([
 {id:'wan22',name:'Wan 2.2',tasks:'Text/Image to Video',note:'Open weights; needs compatible GPU or hosted demo',url:'https://github.com/Wan-Video/Wan2.2'},
 {id:'ltx',name:'LTX Video',tasks:'Video + possible audio (variant-dependent)',note:'Check model license, GPU and endpoint',url:'https://github.com/Lightricks/LTX-Video'},
 {id:'comfy',name:'ComfyUI',tasks:'Local video workflow',note:'Requires running server and installed weights',url:'https://docs.comfy.org/tutorials/video/wan/wan2_2'},
 {id:'spaces',name:'Hugging Face Spaces',tasks:'Public demos',note:'Queue, limits and availability vary',url:'https://huggingface.co/spaces'}
]);
export function sanitizeText(x,max=500){return String(x??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max)}
export function buildShot(s={}){
 const subject=sanitizeText(s.subject,240)||'a person'; const action=sanitizeText(s.action,240)||'walks naturally'; const place=sanitizeText(s.place,240)||'an atmospheric location';
 const mode=MODES[s.mode]||MODES.horror, camera=CAMERAS[s.camera]||CAMERAS.tracking;
 const seconds=Math.min(20,Math.max(3,Math.round(Number(s.seconds)||5)));
 const ratio=['16:9','9:16','1:1'].includes(s.ratio)?s.ratio:'16:9';
 const identity=sanitizeText(s.identity,300);
 const positive=`Photorealistic live-action cinematic footage, single continuous shot, ${seconds} seconds, ${ratio}. ${subject} ${action} in ${place}. Camera: ${camera}. Lighting: ${mode.light}. Natural human biomechanics, weight transfer, contact shadows, coherent object interactions, spatial continuity, physically plausible motion, consistent face and clothing, realistic lens optics, detailed textures. ${identity?'Identity continuity: '+identity+'. ':''}Audio direction: ${mode.sound}. No montage, no cuts, no freeze frames.`;
 const negative='still image, slideshow, Ken Burns effect, artificial zoom only, duplicate limbs, distorted hands, face morphing, flicker, warped architecture, rubber motion, text, watermark, jump cuts';
 return {positive,negative,seconds,ratio,mode:s.mode||'horror',camera:s.camera||'tracking',subject,action,place,identity};
}
export function makeProject(shots){if(!Array.isArray(shots)||!shots.length)throw Error('Mindestens eine Szene benötigt');if(shots.length>30)throw Error('Maximal 30 Szenen');return {format:'nachtwerk-ultimate-11',version:1,createdAt:new Date().toISOString(),shots:shots.map(s=>buildShot(s))}}
export function makeSrt(shots){let time=0;const fmt=n=>{const ms=Math.round(n*1000);const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),sec=Math.floor(ms%60000/1000),rest=ms%1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(rest).padStart(3,'0')}`};return shots.map((s,i)=>{const b=buildShot(s),start=time;time+=b.seconds;return `${i+1}\n${fmt(start)} --> ${fmt(time)}\n${b.subject} ${b.action} in ${b.place}\n`}).join('\n')}
export function validateSpaceName(value){const name=sanitizeText(value,150);if(!/^[\w-][\w.-]{0,59}\/[\w-][\w.-]{0,69}$/.test(name))throw Error('Space-ID muss owner/name sein');return name}
export function validateEndpoint(value){const ep=sanitizeText(value,120);if(!/^\/[\w/-]+$/.test(ep))throw Error('API-Endpoint muss mit / beginnen, z. B. /predict');return ep}
