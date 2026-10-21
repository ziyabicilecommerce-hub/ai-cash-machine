export const SPACE='ZeroCollabs/LTX-2.3-turbo';
export const SPACE_URL='https://huggingface.co/spaces/'+SPACE;
export const DEFAULT_PROMPT='Photorealistic cinematic horror film, one continuous shot. An adult woman wearing a black coat walks naturally through moonlit fog toward an abandoned Victorian mansion, camera tracking behind her. She reaches the entrance and slowly pushes the wooden door open. Natural walking biomechanics, coherent hands and face, detailed atmosphere, volumetric moonlight, realistic footsteps and creaking door audio. No cuts, no still-frame zooms.';
export function buildLtxArgs({prompt=DEFAULT_PROMPT,duration=2,ratio='16:9',seed=42}={}){
 const p=String(prompt).trim();if(!p)throw Error('Bitte eine Filmszene eingeben.');
 const d=Number(duration);if(![2,3,5].includes(d))throw Error('Nur 2, 3 oder 5 Sekunden sind für das Gratis-Preset vorgesehen.');
 const sizes={'16:9':[512,768],'1:1':[512,512],'9:16':[768,512]};
 if(!sizes[ratio])throw Error('Ungültiges Bildformat.');
 const [height,width]=sizes[ratio];
 // Order is taken from the public Space's Gradio generate_btn.click(inputs=[...]).
 return [null,null,p,d,'Image-to-Video',true,Number(seed),true,height,width,null];
}
export function findVideo(data){const visited=new Set();function scan(v,depth=0){if(depth>9||v==null)return null;if(typeof v==='string'){return /^https:\/\//.test(v)&&(/\.(mp4|webm)(\?|$)/i.test(v)||/\/gradio_api\/file=/.test(v))?v:null;}if(typeof v!=='object'||visited.has(v))return null;visited.add(v);if(typeof v.url==='string'&&/^https:\/\//.test(v.url))return v.url;for(const x of Array.isArray(v)?v:Object.values(v)){const found=scan(x,depth+1);if(found)return found;}return null;}return scan(data);}
