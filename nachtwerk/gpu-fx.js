/**
 * NACHTWERK GPU Cinema FX — procedural effects on the device's existing GPU.
 * Dependency-free WebGL2, no machine-learning inference and no model download.
 * If no WebGL2 context exists, callers use their ordinary 2D fallback.
 */
export const FX_VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  uv = position * .5;
  gl_Position = vec4(position * 2. - 1., 0., 1.);
}`;

export const FX_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uMood;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),u.x),
    mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),u.x),u.y);
}
float rainLayer(vec2 p, float count, float time) {
  p.x *= count;
  p.y *= count * .66;
  p.x += p.y * .075;
  vec2 id = floor(p);
  vec2 pos = fract(p);
  float rate = .8 + hash21(vec2(id.x,9.0))*.95;
  float drop = fract(time * rate + hash21(id));
  float dy = abs(fract(pos.y + drop) - .5);
  float dx = abs(pos.x - hash21(vec2(id.x, 2.0)));
  float streak = exp(-dx * 100.) * (1.0-smoothstep(0.,.16,dy));
  return streak * (.25 + hash21(id * 1.7) * .75);
}
float fog(vec2 uv, float time) {
  vec2 q = uv * vec2(2.3, 1.5) + vec2(time*.07, -time*.025);
  float a = noise2(q) * .55 + noise2(q*2.15) * .30 + noise2(q*4.3) * .15;
  return smoothstep(.27, .77, a) * (.35 + .65 * (1.0 - uv.y));
}
void main() {
  vec2 uv0 = uv;
  vec2 p = uv0;
  float t = uTime;
  float rain = rainLayer(p+vec2(t*.06,0.), 35., t*.37);
  rain += rainLayer(p*vec2(1.0,1.18)+vec2(.2,.15), 62., t*.51) * .34;
  float h = hash21(vec2(floor(t/9.), 19.));
  float flash = step(.88,h) * pow(max(0.,1.-abs(mod(t,9.) - 4.0)*6.), 12.);
  float vignette = (1.0-smoothstep(.03,.5,length((uv0-.5)*vec2(1.25, .85))));
  float smoke = fog(uv0,t);
  float scan = sin(uv0.y*uResolution.y*1.7 + t*.85)*.012;
  float grain = (hash21(floor(uv0*uResolution.xy*.68) + vec2(floor(t*25.))) - .5) * .065;
  vec3 fogTint = mix(vec3(.09,.19,.24),vec3(.24,.16,.20), step(.5,uMood));
  vec3 color = fogTint * smoke * .35 + vec3(.30,.48,.57) * rain * .63;
  color += vec3(.67,.81,.90)*flash*.46;
  color += vec3(scan+grain)*.2;
  color += (1.-vignette)*vec3(.022,.043,.063);
  float alpha = clamp(smoke*.19 + rain*.39 + flash*.40 + (1.-vignette)*.15 + .004, 0., .68) * uIntensity;
  outColor = vec4(max(color, vec3(0.)), alpha);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const reason = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("GPU-Shader fehlgeschlagen: " + reason);
  }
  return shader;
}

export class GPUCinematicFX {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true,
      depth: false, stencil: false, antialias: false, powerPreference: 'high-performance'
    });
    if (!this.gl) throw new Error('WebGL2 nicht verfügbar.');
    const gl = this.gl;
    const vertex = compile(gl,gl.VERTEX_SHADER,FX_VERTEX_SHADER);
    const fragment = compile(gl,gl.FRAGMENT_SHADER,FX_FRAGMENT_SHADER);
    this.program = gl.createProgram();
    gl.attachShader(this.program,vertex);
    gl.attachShader(this.program,fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error('GPU-Programm konnte nicht verbunden werden: ' + gl.getProgramInfoLog(this.program));
    }
    this.uniform = Object.fromEntries(['uResolution','uTime','uIntensity','uMood'].map(name => [name, gl.getUniformLocation(this.program,name)]));
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }
  draw(context,w,h,time,intensity=1,mood=0) {
    const gl = this.gl;
    // Half-resolution GPU texture saves bandwidth; final canvas compositing scales it.
    const targetWidth = Math.min(960,Math.max(2,Math.ceil(w*.65)));
    const targetHeight = Math.min(540,Math.max(2,Math.ceil(h*.65)));
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width=targetWidth; this.canvas.height=targetHeight;
      gl.viewport(0,0,targetWidth,targetHeight);
    }
    gl.useProgram(this.program);
    gl.uniform2f(this.uniform.uResolution,targetWidth,targetHeight);
    gl.uniform1f(this.uniform.uTime,time);
    gl.uniform1f(this.uniform.uIntensity,intensity);
    gl.uniform1f(this.uniform.uMood,mood);
    gl.drawArrays(gl.TRIANGLES,0,3);
    context.drawImage(this.canvas,0,0,w,h);
  }
  dispose() {
    if (!this.gl) return;
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl=null;
  }
}

export function canUseWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); }
  catch { return false; }
}

export async function gpuCapabilities() {
  const webgl2 = canUseWebGL2();
  let webgpu = false;
  if (navigator.gpu?.requestAdapter) {
    try { webgpu = !!(await navigator.gpu.requestAdapter()); }
    catch { webgpu = false; }
  }
  return {webgl2, webgpu, secure: !!window.isSecureContext};
}
