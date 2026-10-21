/**
 * NACHTWERK 2.5 — deterministic frame-accurate illustrated character performance.
 * Zero network access, zero inference: this is 2D rig animation, NOT photorealistic AI video.
 * Intended for instant offline preview/browser export; local FFmpeg export requires rendered clips.
 */
export const ACTIONS = Object.freeze({
  none: 'Keine Figur', walk: 'Zum Haus gehen', enter: 'Tür öffnen und hineingehen',
  search: 'Unsicher umsehen', startle: 'Erschrecken und zurückweichen',
  phone: 'Handy herausziehen und telefonieren', flee: 'Weglaufen', freeze: 'Erstarren und umdrehen'
});
const clip = (v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const smooth = t=>{t=clip(t); return t*t*(3-2*t)};
export function actorPose(action, progress, elapsed=0) {
  const p=clip(progress), phase=elapsed*10.8;
  let x=.25, scale=1, stride=0, lean=0, arms=0, shock=0, phone=0, mouth=0, blink=0, door=0, look=0;
  if(action==='walk'){x=.18+.31*smooth(p);scale=.62+.34*p;stride=Math.sin(phase)*Math.sin(Math.PI*clip(p)*.95); arms=-stride*.7;lean=.055;}
  if(action==='enter'){x=.48+.065*smooth(p);scale=.93-.45*smooth(p);stride=Math.sin(phase)*Math.sin(Math.PI*p);arms=.16;door=smooth(p);lean=.05;}
  if(action==='search'){x=.43;scale=.93;look=Math.sin(elapsed*2.4)*.26;arms=.12;lean=Math.sin(elapsed*1.2)*.02;}
  if(action==='startle'){x=.48-.085*smooth((p-.2)*2);scale=.92;shock=smooth((p-.18)*8)*(1-smooth((p-.8)*5));lean=-shock*.22;arms=shock*1.2;stride=shock*.55;mouth=shock*.84;}
  if(action==='phone'){x=.51;scale=1.04;phone=smooth((p-.06)*5);arms=.15;look=-.15;mouth=(.15+.58*Math.pow(Math.sin(elapsed*13),2))*phone;}
  if(action==='flee'){x=.52-.40*smooth(p);scale=1.05-.27*p;stride=Math.sin(phase*1.8);arms=stride*1.2;lean=-.18;}
  if(action==='freeze'){x=.48;scale=.9;shock=smooth((p-.1)*6);look=smooth((p-.4)*3)*.7;arms=shock*.25;mouth=shock*.4;}
  blink = Math.pow(Math.max(0,Math.cos(elapsed*2.1+1.3)),18);
  return {x,scale,stride,lean,arms,shock,phone,mouth,blink,door,look,breath:Math.sin(elapsed*2.8)*.012};
}
function line(ctx,a,b,width,stroke){ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}
function ellipse(ctx,x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function round(ctx,x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
export function drawPerformance(ctx, width,height, action, local, duration){
  if(!ACTIONS[action] || action==='none')return;
  const pose=actorPose(action,duration?local/duration:0,local);
  ctx.save();
  ctx.scale(width/1280,height/720);
  const x=pose.x*1280, footY=569, sc=pose.scale*1.22;
  // Door opens behind the character during the entrance action.
  if(action==='enter'){
    ctx.save();ctx.translate(635,475);
    ctx.fillStyle=`rgba(4,10,13,${pose.door*.95})`;ctx.fillRect(-18,-68,37,113);
    ctx.fillStyle='rgba(237,190,112,.2)';ctx.beginPath();ctx.moveTo(17,-68);ctx.lineTo(32+pose.door*38,-65);ctx.lineTo(32+pose.door*38,44);ctx.lineTo(17,45);ctx.closePath();ctx.fill();
    ctx.restore();
  }
  // Ground shadow follows steps.
  ellipse(ctx,x+2,footY+4,37*sc,8*sc,'rgba(0,0,0,.56)');
  ctx.translate(x,footY);ctx.scale(sc,sc);
  const bob=Math.abs(pose.stride)*4+pose.breath*10;
  ctx.translate(0,-bob);
  ctx.rotate(pose.lean*.34);
  // Back hair and hood, dark rim-light.
  ellipse(ctx,0,-176,23,36,'#141a20');
  // Legs: clear skeletal joint motion, rather than camera motion only.
  const step=pose.stride*21;
  line(ctx,[-11,-82],[-16+step/2,-47],15,'#172129');
  line(ctx,[-16+step/2,-47],[-17+step,-5],11,'#0c1722');
  line(ctx,[11,-82],[15-step/2,-47],15,'#1d2a32');
  line(ctx,[15-step/2,-47],[17-step,-5],11,'#101b22');
  round(ctx,-28+step,-6,22,9,4,'#0a1017');
  round(ctx,7-step,-6,23,9,4,'#10161b');
  // Jacket torso: articulated shoulders, breathing and lean.
  ctx.save();ctx.rotate(pose.lean);
  const breath=1+pose.breath;
  ctx.scale(breath,1);
  ctx.beginPath();ctx.moveTo(-21,-158);ctx.quadraticCurveTo(-35,-151,-33,-127);ctx.lineTo(-25,-79);ctx.lineTo(27,-79);ctx.lineTo(35,-129);ctx.quadraticCurveTo(32,-149,17,-158);ctx.closePath();
  ctx.fillStyle='#1b313b';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#5d747d';ctx.stroke();
  line(ctx,[0,-155],[-1,-92],2,'rgba(202,194,165,.48)');
  // Arms and hands with animated counter-swing, phone raised in police-call shot.
  const swing=pose.arms*22;
  line(ctx,[-25,-145],[-37-swing/2,-107],17,'#1a303a');
  line(ctx,[-37-swing/2,-107],[-37-swing,-78],14,'#192b34');
  ellipse(ctx,-37-swing,-74,8,11,'#ae8075');
  let wrist=[37+swing,-78];
  if(pose.phone>0) wrist=[12+pose.phone*11,-150-pose.phone*21];
  else if(pose.shock>.05)wrist=[42+pose.shock*28,-110-pose.shock*25];
  line(ctx,[25,-145],[39+swing/3,-105],18,'#203844');
  line(ctx,[39+swing/3,-105],wrist,14,'#253743');
  ellipse(ctx,wrist[0],wrist[1],7,10,'#bc8b7c');
  if(pose.phone>.05){
    ctx.save();ctx.translate(wrist[0]+2,wrist[1]-9);ctx.rotate(-.16);
    round(ctx,-7,-15,15,29,4,'#070c13');round(ctx,-5,-11,11,21,2,'#3c91a4');
    round(ctx,-3,-8,7,11,2,'#c1dcdd');ctx.restore();
  }
  // neck and head. Head turns at key moments.
  round(ctx,-8,-172,16,19,5,'#b88b77');
  ctx.translate(pose.look*6,-188);ctx.rotate(pose.look*.22 - pose.shock*.04);
  ellipse(ctx,-3,-10,23,31,'#17171a'); // hair halo
  ellipse(ctx,0,0,18,25,'#b88f7d');
  ellipse(ctx,-2,-1,17,24,'#c99b86');
  ctx.beginPath();ctx.moveTo(-19,-13);ctx.quadraticCurveTo(-28,-43,0,-38);ctx.quadraticCurveTo(26,-34,22,-12);ctx.lineTo(15,-21);ctx.quadraticCurveTo(1,-33,-18,-13);ctx.fillStyle='#272225';ctx.fill();
  // Eyes, blink, eyebrow lift during fright.
  line(ctx,[-13,-4],[-3,-5-pose.shock*2],2,'#2a282a');
  line(ctx,[5,-5-pose.shock*2],[14,-6],2,'#2a282a');
  const eyeH=Math.max(.65,2.5*(1-pose.blink)+pose.shock*1.8);
  ellipse(ctx,-8,1,3,eyeH,'#20252b');ellipse(ctx,9,1,3,eyeH,'#20252b');
  // Lips open during the simulated speech action and gasping.
  ellipse(ctx,2,13,4.5,1.2+pose.mouth*6,'#6c3539');
  ellipse(ctx,1,21,5,1.2,'rgba(250,189,178,.36)');
  ctx.restore();ctx.restore();
}
