(() => {
'use strict';
const C = window.CONTENT, M = window.META;
const VER = new URL(document.currentScript.src).search;      // the ?v= tag in index.html; bump it there to refresh cached artwork
const $ = (s) => document.querySelector(s);
const D = Math.PI / 180;
const canvas = $('#pano'), intro = $('#intro'), panel = $('#panel'), tv = $('#tv'), nav = $('#nav');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
if (!gl) { intro.querySelector('.loading-text').textContent = 'This site needs WebGL2. Please try a newer browser.'; return; }

// ---------------------------------------------------------------- state
const view = { yaw: 0, pitch: 0, fov: 160, fish: 1 };       // degrees; fish 0 = flat, 1 = full fisheye
const HOME = { yaw: 0, pitch: -3, fov: 120, fish: 0.3 };
const S = { entered: false, control: false, active: null, hover: 0, hoverA: 0, lights: 0, lightsOn: false, musicOn: true, muted: false };
const byId = {}; for (const k in M.objects) byId[M.objects[k].id] = k;
let W = 1, Hh = 1, half = [1, 1], tw = null, idsData = null;

// ---------------------------------------------------------------- projection (must match the shader)
const dirLL = ([yaw, pitch]) => [Math.sin(yaw * D) * Math.cos(pitch * D), Math.sin(pitch * D), Math.cos(yaw * D) * Math.cos(pitch * D)];
function updateHalf() {
  const d = view.fish, h = view.fov * D / 2, r = (d + 1) * Math.sin(h) / (d + Math.cos(h));
  half = W >= Hh ? [r, r * Hh / W] : [r * W / Hh, r];
}
function unproject(px, py) {                                 // screen px -> world direction
  const qx = (px / W * 2 - 1) * half[0], qy = (1 - py / Hh * 2) * half[1], d = view.fish;
  const r = Math.hypot(qx, qy), k = r / (d + 1), c = (-k * k * d + Math.sqrt(k * k * (1 - d * d) + 1)) / (k * k + 1), s = Math.sqrt(Math.max(0, 1 - c * c));
  let x = r > 1e-6 ? qx / r * s : 0, y = r > 1e-6 ? qy / r * s : 0, z = c;
  const cp = Math.cos(view.pitch * D), sp = Math.sin(view.pitch * D), cy = Math.cos(view.yaw * D), sy = Math.sin(view.yaw * D);
  [y, z] = [y * cp + z * sp, -y * sp + z * cp];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return [x, y, z];
}
function project([x, y, z]) {                                // world direction -> screen px, or null if behind
  const cp = Math.cos(view.pitch * D), sp = Math.sin(view.pitch * D), cy = Math.cos(view.yaw * D), sy = Math.sin(view.yaw * D), d = view.fish;
  [x, z] = [x * cy - z * sy, x * sy + z * cy];
  [y, z] = [y * cp - z * sp, y * sp + z * cp];
  if (d + z < 0.15) return null;
  const k = (d + 1) / (d + z);
  return [(x * k / half[0] + 1) / 2 * W, (1 - y * k / half[1]) / 2 * Hh];
}
const dirToUV = ([x, y, z]) => [Math.atan2(x, z) / (2 * Math.PI) + 0.5, 0.5 - Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI];

// 3x3 helpers (row arrays) for mapping four points onto four points
const mul = (a, b) => a.map((r) => [0, 1, 2].map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
function inv(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m, A = e * i - f * h, B = f * g - d * i, Cc = d * h - e * g, det = a * A + b * B + c * Cc;
  return [[A, c * h - b * i, b * f - c * e], [B, a * i - c * g, c * d - a * f], [Cc, b * g - a * h, a * e - b * d]].map((r) => r.map((v) => v / det));
}
function basis(p) {                                          // matrix taking e1,e2,e3,(1,1,1) to p0,p1,p2,p3
  const m = [[p[0][0], p[1][0], p[2][0]], [p[0][1], p[1][1], p[2][1]], [p[0][2], p[1][2], p[2][2]]], n = inv(m);
  const k = n.map((r) => r[0] * p[3][0] + r[1] * p[3][1] + r[2] * p[3][2]);
  return m.map((r) => r.map((v, j) => v * k[j]));
}
const homography = (src, dst) => mul(basis(dst), inv(basis(src)));
const SQUARE = [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];

// ---------------------------------------------------------------- WebGL
const VS = `#version 300 es
in vec2 p; out vec2 vP; void main(){ vP = p; gl_Position = vec4(p, 0., 1.); }`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uPano, uIds, uEmis, uScrA, uScrB, uPic;
uniform highp usampler2D uNear;
uniform vec2 uHalf, uView;
uniform float uFish, uHover, uHoverA, uLights, uDpr;
uniform mat3 uHA, uHB, uHC;
uniform float uPicOn;
uniform vec4 uLamps[7];
uniform vec3 uGlow[3];
in vec2 vP; out vec4 o;
const float PI = 3.14159265;
float idAt(vec2 uv){ return floor(textureLod(uIds, uv, 0.).r * 255. + .5); }
float pool(float cosA, float size){                 // cartoon light pool: soft falloff snapped towards flat bands
  float a = acos(clamp(cosA, -1., 1.)), f = exp(-a * a / (2. * size * size));
  return f;
}
vec3 screen(mat3 H, sampler2D t, vec3 v, vec3 c){
  vec3 a = H * v; vec2 st = a.xy / a.z;
  return (a.z > 0. && st.x > 0. && st.x < 1. && st.y > 0. && st.y < 1.) ? texture(t, st).rgb : c;
}
void main(){
  vec2 q = vP * uHalf; float r = length(q), d = uFish, k = r / (d + 1.);
  float c = (-k * k * d + sqrt(k * k * (1. - d * d) + 1.)) / (k * k + 1.), s = sqrt(max(0., 1. - c * c));
  vec3 v = vec3(r > 1e-6 ? q / r * s : vec2(0.), c);
  float cp = cos(uView.y), sp = sin(uView.y), cy = cos(uView.x), sy = sin(uView.x);
  v = vec3(v.x, v.y * cp + v.z * sp, -v.y * sp + v.z * cp);
  v = vec3(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy);
  float lat = asin(clamp(v.y, -1., 1.));
  float u = atan(v.x, v.z) / (2. * PI) + .5, w = .5 - lat / PI, ub = fract(u + .5) - .5;
  vec2 gx = vec2(abs(dFdx(u)) < abs(dFdx(ub)) ? dFdx(u) : dFdx(ub), dFdx(w));   // gradients that ignore the 0/360 seam
  vec2 gy = vec2(abs(dFdy(u)) < abs(dFdy(ub)) ? dFdy(u) : dFdy(ub), dFdy(w));
  vec2 uv = vec2(u, w);
  vec3 base = textureGrad(uPano, uv, gx, gy).rgb;
  vec3 em = textureGrad(uEmis, uv, gx, gy).rgb;
  if (uPicOn > 0.) base = screen(uHC, uPic, v, base);                 // photo in the frame on the fridge, lit like the rest of the room

  float lamp = 0.;
  for (int i = 0; i < 7; i++) lamp += uLamps[i].w * pool(dot(v, uLamps[i].xyz), .7);
  float glow = 0.;
  for (int i = 0; i < 3; i++) glow += pool(dot(v, uGlow[i]), .3);
  vec3 light = vec3(.12, .16, .33)                                    // blue hour
             + uLights * vec3(1., .80, .52) * (.08 + .46 * (1. - exp(-1.2 * lamp)))   // warm lamps over a soft warm fill
             + vec3(.42, .58, .95) * (1. - exp(-1.2 * glow)) * .5;    // cold screens
  // (pools are summed then eased towards a ceiling, so overlaps melt together instead of clipping into hard rings)
  vec3 col = base * light;
  col = mix(col, base * .9, em.b);                                    // sky is its own light
  col = mix(col, base * 1.06, em.r * uLights);                        // a lit shade is just its own painted colour at full brightness, no tint
  vec3 scr = vec3(.03, .05, .1);
  scr = screen(uHA, uScrA, v, scr); scr = screen(uHB, uScrB, v, scr);
  col = mix(col, scr, em.g);

  // uNear says which objects are anywhere near this pixel, so the 33-sample outline only runs around the hovered one
  if (uHover > 0. && ((texelFetch(uNear, ivec2(min(uv * vec2(256., 128.), vec2(255., 127.))), 0).r >> uint(uHover - 1.)) & 1u) == 1u) {
    float me = idAt(uv) == uHover ? 1. : 0., n1 = 0., n2 = 0.;
    // size of one CSS pixel in panorama units, so the outline keeps the same on-screen thickness at any zoom
    float cl = max(cos(lat), .25);
    float px = max(length(vec2(gx.x * 2. * cl, gx.y)), length(vec2(gy.x * 2. * cl, gy.y))) * uDpr;
    vec2 sc = vec2(.5 / cl, 1.) * px;
    for (int i = 0; i < 16; i++) {
      float a = float(i) * PI / 8.; vec2 dir = vec2(cos(a), sin(a)) * sc;
      n1 += idAt(uv + dir * 3.) == uHover ? 1. : 0.;
      n2 += idAt(uv + dir * 7.) == uHover ? 1. : 0.;
    }
    float edge = max(smoothstep(0., 5., n1), .6 * smoothstep(0., 9., n2)) * (1. - me);
    col = mix(col, vec3(1., .82, .12), edge * uHoverA);
    col += me * uHoverA * vec3(.07, .055, 0.);
  }
  o = vec4(col, 1.);
}`;
function shader(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.bindAttribLocation(prog, 0, 'p'); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const U = new Proxy({}, { get: (t, n) => t[n] || (t[n] = gl.getUniformLocation(prog, n)) });
const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
function texture(unit, name, src, { mips = false, nearest = false } = {}) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  if (nearest) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, src);   // id mask: one byte per pixel
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (mips && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  gl.uniform1i(U[name], unit);
  return (img) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); };
}
const flat = (m) => [m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]];
function screenMatrix(name, uniform) {                        // direction -> 0..1 coords on that screen
  const q = M.screens[name].map(dirLL); let h = homography(q, SQUARE);
  const mid = q[0].map((_, i) => q[0][i] + q[2][i]);
  if (h[2][0] * mid[0] + h[2][1] * mid[1] + h[2][2] * mid[2] < 0) h = h.map((r) => r.map((v) => -v));
  gl.uniformMatrix3fv(U[uniform], false, flat(h));
}
screenMatrix('github', 'uHA'); screenMatrix('laptop', 'uHB');
if (M.frame) { M.screens.frame = M.frame; screenMatrix('frame', 'uHC'); delete M.screens.frame; }
gl.uniform4fv(U['uLamps[0]'], M.lamps.flatMap((l) => [...dirLL(l), l[2]]));
const centre = (q) => { const a = q.map(dirLL), c = [0, 1, 2].map((i) => a[0][i] + a[1][i] + a[2][i] + a[3][i]), n = Math.hypot(...c); return c.map((v) => v / n); };
gl.uniform3fv(U['uGlow[0]'], ['video', 'github', 'laptop'].flatMap((k) => centre(M.screens[k])));

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth; Hh = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
new ResizeObserver(resize).observe(canvas); resize();       // follows any window / pane size, not just window resizes

// ---------------------------------------------------------------- the two drawn screens
function makeCanvas() { const c = document.createElement('canvas'); c.width = 640; c.height = 400; return c; }
const ghCanvas = makeCanvas(), lapCanvas = makeCanvas();
let ghUpload, lapUpload;
function drawGithub(user, repos, avatar) {
  const x = ghCanvas.getContext('2d');
  x.fillStyle = '#0d1117'; x.fillRect(0, 0, 640, 400);
  x.fillStyle = '#161b22'; x.fillRect(0, 0, 640, 44);
  x.fillStyle = '#e6edf3'; x.font = 'bold 20px Arial'; x.fillText('github.com/' + C.github, 18, 29);
  x.save(); x.beginPath(); x.arc(84, 124, 56, 0, 7); x.closePath(); x.fillStyle = '#30363d'; x.fill(); x.clip();
  if (avatar) x.drawImage(avatar, 28, 68, 112, 112); x.restore();
  x.fillStyle = '#e6edf3'; x.font = 'bold 30px Arial'; x.fillText((user && user.name) || C.name, 160, 110);
  x.fillStyle = '#8b949e'; x.font = '20px Arial'; x.fillText('@' + C.github, 160, 140);
  if (user) x.fillText(`${user.public_repos} repos · ${user.followers} followers`, 160, 170);
  (repos || []).slice(0, 4).forEach((r, i) => {
    const bx = 18 + (i % 2) * 308, by = 200 + (i >> 1) * 78;
    x.strokeStyle = '#30363d'; x.lineWidth = 2; x.strokeRect(bx, by, 296, 66);
    x.fillStyle = '#58a6ff'; x.font = 'bold 19px Arial'; x.fillText(r.name.slice(0, 24), bx + 12, by + 27);
    x.fillStyle = '#8b949e'; x.font = '15px Arial'; x.fillText(r.language || '', bx + 12, by + 52);
  });
  for (let i = 0; i < 40; i++) for (let j = 0; j < 3; j++) {         // decorative activity strip
    x.fillStyle = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'][(i * 7 + j * 13 + i * j) % 5]; x.fillRect(18 + i * 15.2, 362 + j * 12, 11, 9);
  }
  if (ghUpload) ghUpload(ghCanvas);
}
function drawLaptop() {
  const x = lapCanvas.getContext('2d'), it = C.sections.laptop.items[0] || {};
  x.fillStyle = '#eef3fb'; x.fillRect(0, 0, 640, 400);
  x.fillStyle = '#2f5fd0'; x.fillRect(0, 0, 640, 70);
  x.fillStyle = '#fff'; x.font = 'bold 34px Arial'; x.fillText('SCHOOL', 24, 48);
  x.fillStyle = '#1b2433'; x.font = 'bold 34px Arial'; x.fillText((it.title || '').slice(0, 30), 24, 130);
  x.fillStyle = '#5b6b85'; x.font = '24px Arial'; x.fillText((it.sub || '').slice(0, 44), 24, 168);
  x.fillStyle = '#c3cfe4'; [0, 1, 2, 3].forEach((i) => x.fillRect(24, 210 + i * 40, 560 - i * 90, 16));
}
drawGithub(); drawLaptop();
async function loadGithub() {
  try {
    const j = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const [user, repos] = await Promise.all([j(`https://api.github.com/users/${C.github}`), j(`https://api.github.com/users/${C.github}/repos?sort=updated&per_page=12`)]);
    const mine = repos.filter((r) => !r.fork);
    drawGithub(user, mine);
    const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => drawGithub(user, mine, img); img.src = user.avatar_url;
  } catch (e) { console.warn('GitHub data unavailable, showing the offline card', e); }
}

// ---------------------------------------------------------------- loading
function loadImage(src, onProgress) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('GET', src + VER); x.responseType = 'blob';
    x.onprogress = (e) => onProgress && e.lengthComputable && onProgress(e.loaded / e.total);
    x.onerror = () => rej(new Error('failed to load ' + src));
    x.onload = () => { if (x.status >= 400) return rej(new Error(src + ' ' + x.status)); const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(x.response); };
    x.send();
  });
}
const small = gl.getParameter(gl.MAX_TEXTURE_SIZE) < 8192 || Math.max(screen.width, screen.height) < 1000;
Promise.all([
  loadImage(small ? 'assets/pano_4k.webp' : 'assets/pano.webp', (f) => { $('#pct').textContent = Math.round(f * 95) + '%'; }),
  loadImage(small ? 'assets/ids_4k.png' : 'assets/ids.png'), loadImage('assets/emis.png'),
]).then(([pano, ids, emis]) => {
  texture(0, 'uPano', pano, { mips: true }); texture(1, 'uIds', ids, { nearest: true }); texture(2, 'uEmis', emis);
  ghUpload = texture(3, 'uScrA', ghCanvas); lapUpload = texture(4, 'uScrB', lapCanvas);
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; x.drawImage(ids, 0, 0, 2048, 1024);
  idsData = x.getImageData(0, 0, 2048, 1024).data;
  // coarse 256x128 map: bit (id-1) is set where that object is within 6 cells (~8 degrees), wider towards the poles. Holds ids 1-16.
  const raw = new Uint16Array(256 * 128), near = new Uint16Array(256 * 128);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 2048; x++) { const id = idsData[(y * 2048 + x) * 4]; if (id) raw[(y >> 3) * 256 + (x >> 3)] |= 1 << (id - 1); }
  for (let y = 0; y < 128; y++) {
    const lat = Math.min(Math.PI / 2, Math.abs((y + .5) / 128 - .5) * Math.PI + 6 * Math.PI / 128), rx = Math.min(128, Math.ceil(6 / Math.max(.02, Math.cos(lat))));
    for (let x = 0; x < 256; x++) { let b = 0; for (let j = Math.max(0, y - 6); j <= Math.min(127, y + 6); j++) for (let i = -rx; i <= rx; i++) b |= raw[j * 256 + ((x + i) & 255)]; near[y * 256 + x] = b; }
  }
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, 256, 128, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, near);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.uniform1i(U.uNear, 6);
  $('#pct').textContent = '100%';
  intro.classList.remove('loading');
  requestAnimationFrame(frame);
  loadGithub();
  // optional photo for the fridge frame: drop any image at assets/frame.jpg. It is centre-cropped to fill the frame.
  const pic = new Image();
  pic.onload = () => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 460;
    const s = Math.max(c.width / pic.width, c.height / pic.height), w = pic.width * s, h = pic.height * s;
    c.getContext('2d').drawImage(pic, (c.width - w) / 2, (c.height - h) * .3, w, h);
    texture(5, 'uPic', c); gl.uniform1f(U.uPicOn, 1);
  };
  pic.src = 'assets/frame.jpg' + VER;
}).catch((e) => { intro.querySelector('.loading-text').textContent = 'Could not load the room. ' + e.message; });

// ---------------------------------------------------------------- camera
const EASE = { p3: (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), q4: (k) => (k < .5 ? 8 * k * k * k * k : 1 - Math.pow(-2 * k + 2, 4) / 2) };
function tween(to, dur, ease, delay = 0, done) {
  to = { ...to };
  if ('yaw' in to) to.yaw = view.yaw + ((to.yaw - view.yaw + 540) % 360 - 180);      // shortest way round
  tw = { from: { ...view }, to, t0: performance.now() + delay * 1000, dur: dur * 1000, ease, done };
}
function clampView() {
  view.fov = Math.max(FOV_MIN, Math.min(S.control ? FOV_MAX : 170, view.fov));
  view.pitch = Math.max(-90, Math.min(90, view.pitch));       // full sphere: straight up and straight down are allowed
  updateHalf();
}
const FOV_MIN = 25, FOV_MAX = 150;                            // zoom range (the reference site uses 70-140)
let fovT = null;                                              // where the wheel is easing the zoom to
let vel = [0, 0], drag = null;
function frame(now) {
  if (tw && now >= tw.t0) {
    const k = Math.min(1, (now - tw.t0) / tw.dur), e = tw.ease(k);
    for (const key in tw.to) view[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
    if (k === 1) { const d = tw.done; tw = null; d && d(); }
  } else if (!drag && (Math.abs(vel[0]) > .01 || Math.abs(vel[1]) > .01)) {
    view.yaw += vel[0]; view.pitch += vel[1]; vel = [vel[0] * .94, vel[1] * .94];
  }
  if (tw) fovT = null;
  else if (fovT != null) { view.fov += (fovT - view.fov) * .16; if (Math.abs(fovT - view.fov) < .05) fovT = null; }
  clampView();
  if (ptr && !drag) setHover(pick(ptr[0], ptr[1]));            // every frame, so the glow follows when the room moves under a still cursor
  S.lights += ((S.lightsOn ? 1 : 0) - S.lights) * .18;
  S.hoverA += ((S.hover ? 1 : 0) - S.hoverA) * .25; if (!S.hover && S.hoverA < .02) S.hoverA = 0;   // fully off, no faint leftover glow
  gl.uniform2f(U.uHalf, half[0], half[1]); gl.uniform2f(U.uView, view.yaw * D, view.pitch * D);
  gl.uniform1f(U.uFish, view.fish); gl.uniform1f(U.uLights, S.lights); gl.uniform1f(U.uDpr, canvas.width / W);
  gl.uniform1f(U.uHover, S.hover || S.lastHover || 0); gl.uniform1f(U.uHoverA, S.hoverA);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  placeTV();
  requestAnimationFrame(frame);
}
function placeTV() {
  if (!tv.firstChild) return;
  const p = M.screens.video.map((q) => project(dirLL(q)));
  if (p.some((q) => !q) || p.every((q) => q[0] < 0 || q[0] > W || q[1] < 0 || q[1] > Hh)) { tv.style.display = 'none'; return; }
  const h = homography([[0, 0, 1], [640, 0, 1], [640, 360, 1], [0, 360, 1]], p.map((q) => [q[0], q[1], 1])).map((r) => r.map((v) => v / 1));
  const s = h[2][2];
  tv.style.display = 'block';
  tv.style.transform = `matrix3d(${[h[0][0], h[1][0], 0, h[2][0], h[0][1], h[1][1], 0, h[2][1], 0, 0, 1, 0, h[0][2], h[1][2], 0, h[2][2]].map((v) => v / s).join(',')})`;
}

// ---------------------------------------------------------------- pointer
function idAtPx(px, py) {
  const [u, v] = dirToUV(unproject(px, py));
  return idsData[(Math.min(1023, Math.floor(v * 1024)) * 2048 + (Math.floor(u * 2048) % 2048)) * 4];
}
function pick(px, py) {
  if (!idsData) return 0;
  let id = idAtPx(px, py);
  for (let i = 0; !id && i < 8; i++) id = idAtPx(px + 6 * Math.cos(i * Math.PI / 4), py + 6 * Math.sin(i * Math.PI / 4));   // 6px of forgiveness around small objects
  return id;
}
function setHover(id) { if (id === S.hover) return; if (id) S.lastHover = id; S.hover = id; canvas.classList.toggle('hot', !!id); }
let ptr = null;                                               // where the mouse is resting, or null when it is off the room
const touches = new Map(); let pinch = 0;                     // two fingers = pinch to zoom
canvas.addEventListener('pointerdown', (e) => {
  if (!S.control) return;
  canvas.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0;
  if (touches.size > 1) { if (drag) drag.moved = 99; return; }
  drag = { x: e.clientX, y: e.clientY, moved: 0 }; vel = [0, 0];
  if (e.pointerType !== 'mouse') setHover(pick(e.clientX, e.clientY));
});
canvas.addEventListener('pointermove', (e) => {
  if (!S.control) return;
  if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (touches.size === 2) {
    const [a, b] = [...touches.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) { tw = null; fovT = null; view.fov *= pinch / d; }
    pinch = d; vel = [0, 0]; return;
  }
  if (e.pointerType === 'mouse') ptr = [e.clientX, e.clientY];
  if (!drag) return setHover(pick(e.clientX, e.clientY));
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = view.fov / Math.max(W, Hh) * 1.8;
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  if (drag.moved > 5) { tw = null; vel = [-dx * k, dy * k]; view.yaw += vel[0]; view.pitch += vel[1]; }
});
canvas.addEventListener('pointerup', (e) => {
  touches.delete(e.pointerId); pinch = 0;
  if (!drag) return;
  if (touches.size) { drag.x = [...touches.values()][0][0]; drag.y = [...touches.values()][0][1]; return; }
  const click = drag.moved <= 5; drag = null;
  if (click) { const id = pick(e.clientX, e.clientY); if (id) activate(byId[id]); else if (S.active) reset(); }
  if (e.pointerType !== 'mouse') setTimeout(() => setHover(0), 600);
});
canvas.addEventListener('pointerleave', () => { ptr = null; if (!drag) setHover(0); });
canvas.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); pinch = 0; drag = null; });
canvas.addEventListener('wheel', (e) => { if (!S.control) return; e.preventDefault(); tw = null;
  const step = e.deltaY * (e.deltaMode === 1 ? 33 : 1);       // line-based wheels report tiny numbers
  fovT = Math.max(FOV_MIN, Math.min(FOV_MAX, (fovT ?? view.fov) * Math.exp(step * .0016))); }, { passive: false });

// ---------------------------------------------------------------- actions
function activate(name) {
  sfx(name);
  if (name === 'lights') { S.lightsOn = !S.lightsOn; return; }
  if (name === 'speaker') { S.musicOn = !S.musicOn; applyVolume(); return; }
  if (name === 'globe') { window.open(C.mapUrl, '_blank', 'noopener'); return; }
  if (S.active === name) return reset();
  // desktop: panel is on the left, so park the object right of centre. phone: panel is a bottom sheet, so park it in the top half.
  const f = M.objects[name].focus, wide = W > 570 && !C.sections[name].row, fov = W >= Hh ? f[2] : f[2] * 1.6;
  tween({ yaw: f[0] - (wide ? fov * .16 : 0), pitch: f[1] - (wide ? 0 : fov * .22), fov, fish: .3 }, 2, EASE.q4);
  openPanel(name);
}
function reset() {
  S.active = null; panel.classList.add('closed'); tv.classList.remove('live'); markNav();
  tween(HOME, 2, EASE.q4);
}
function fillCard(d, it, full) {
  if (it.img) {
    const i = el('img'); i.src = it.img; i.alt = it.title || it.alt || ''; i.loading = 'lazy';
    i.onerror = () => i.replaceWith(el('div', 'ph', 'Photo coming soon'));       // picture not added yet
    d.appendChild(i);
  }
  if (it.title) { const t = el('div', 'title', it.title); if (full) t.id = 'modal-title'; d.appendChild(t); }
  if (it.sub) d.appendChild(el('div', 'sub', it.sub));
  if (it.text) d.appendChild(el('div', 'text', it.text));
  if (full && it.detail) d.appendChild(el('div', 'text', it.detail));
  if (it.tech && (full || !it.detail)) { const t = el('div', 'tech'); t.append(el('b', '', 'Built with '), it.tech); d.appendChild(t); }
  if (it.links && it.links.length && (full || !it.detail)) {
    const l = el('div', 'links');
    for (const k of it.links) { const a = el('a', '', k.label); a.href = k.url; if (!/^mailto:/.test(k.url)) { a.target = '_blank'; a.rel = 'noopener'; } l.appendChild(a); }
    d.appendChild(l);
  }
}
function openPanel(name) {
  S.active = name; markNav();
  tv.classList.toggle('live', name === 'computers');
  const sec = C.sections[name], inner = $('#panel-inner');
  inner.textContent = '';
  if (!sec.items.length) inner.appendChild(el('div', 'empty', 'Nothing here yet.'));
  for (const it of sec.items) {
    if (it.heading) { inner.appendChild(el('div', 'heading', it.heading)); continue; }
    const pop = it.detail || it.zoom, d = el(pop ? 'button' : 'div', 'item' + (it.star ? ' star' : ''));
    fillCard(d, it, false);
    if (pop) { d.type = 'button'; if (it.detail) d.appendChild(el('span', 'more', 'Read more')); d.addEventListener('click', () => openModal(it, d)); }
    inner.appendChild(d);
  }
  inner.scrollTop = inner.scrollLeft = 0;
  panel.classList.toggle('row', !!sec.row);
  panel.classList.remove('closed');
}
$('#panel-inner').addEventListener('wheel', (e) => { if (panel.classList.contains('row') && !e.deltaX) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });   // mouse wheel moves the strip sideways
const modal = $('#modal'); let modalFrom = null;
function openModal(it, from) {
  const b = $('#modal-body'); b.textContent = ''; fillCard(b, it, true);
  modal.classList.toggle('art', !!it.zoom);
  modalFrom = from; modal.classList.remove('closed'); $('#modal-close').focus(); sfx('notebook');
}
function closeModal() { modal.classList.add('closed'); if (modalFrom) modalFrom.focus(); modalFrom = null; }
$('#modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
$('#back').addEventListener('click', reset);
addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!modal.classList.contains('closed')) closeModal(); else if (S.active) reset(); });

// menu: the list is repeated three times and the scroll position wraps, so it loops forever
const track = $('#nav-track'), order = ['computers', 'frame', 'laptop', 'certs', 'name', 'bag', 'notebook', 'phone'];
for (let r = 0; r < 3; r++) for (const k of order) {
  const b = el('button', 'menu-button'); b.type = 'button'; b.dataset.k = k;
  b.append(el('span', '', C.sections[k].label), el('span', 'close', '×'), el('span', 'line'));
  if (r !== 1) { b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); }
  b.addEventListener('click', () => { if (S.control) activate(k); });
  track.appendChild(b);
}
const setW = () => track.scrollWidth / 3;
nav.addEventListener('scroll', () => { const w = setW(); if (nav.scrollLeft < w * .5) nav.scrollLeft += w; else if (nav.scrollLeft > w * 1.5) nav.scrollLeft -= w; });
nav.addEventListener('wheel', (e) => { if (!e.deltaX) { nav.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
const homeNav = () => { nav.scrollLeft = setW(); };
requestAnimationFrame(homeNav); addEventListener('resize', homeNav);   // item widths change with the window
function markNav() {
  track.querySelectorAll('.menu-button').forEach((b) => b.classList.toggle('active', b.dataset.k === S.active));
  if (!S.active) return;
  // slide the open section's button to the left edge, above the panel. Of its three copies, use the one that keeps the scroll inside the wrap limits above.
  const w = setW(), bs = [...track.querySelectorAll(`.menu-button[data-k="${S.active}"]`)], b = bs.find((x) => x.offsetLeft >= w * .5 && x.offsetLeft < w * 1.5) || bs[1];
  if (b) nav.scrollTo({ left: b.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

// ---------------------------------------------------------------- sound (all synthesised, no audio files needed)
let A = null, master, musicBus, sfxBus, musicEl = null;
function tone(dest, f, t, dur, type = 'sine', g = .2, f2) {
  const o = A.createOscillator(), n = A.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  n.gain.setValueAtTime(0, t); n.gain.linearRampToValueAtTime(g, t + .012); n.gain.exponentialRampToValueAtTime(.0005, t + dur);
  o.connect(n).connect(dest); o.start(t); o.stop(t + dur + .02);
}
let noiseBuf, meowBuf;
function noise(dest, t, dur, type, f0, f1, g = .2, q = 1) {
  const s = A.createBufferSource(), fl = A.createBiquadFilter(), n = A.createGain();
  s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  n.gain.setValueAtTime(0, t); n.gain.linearRampToValueAtTime(g, t + .008); n.gain.exponentialRampToValueAtTime(.0005, t + dur);
  s.connect(fl).connect(n).connect(dest); s.start(t, Math.random()); s.stop(t + dur + .02);
}
const SFX = {
  globe: (t) => { noise(sfxBus, t, .55, 'bandpass', 350, 2200, .3, 2); tone(sfxBus, 988, t + .4, .5, 'sine', .08); },                      // spin + ping
  computers: (t) => { tone(sfxBus, 523, t, .14, 'square', .05); tone(sfxBus, 784, t + .13, .3, 'square', .05); },                          // boot beep
  laptop: (t) => { for (let i = 0; i < 6; i++) noise(sfxBus, t + i * .065 + Math.random() * .02, .03, 'highpass', 2500, 0, .25); },        // typing
  phone: (t) => { for (let i = 0; i < 16; i++) tone(sfxBus, i % 2 ? 1320 : 1650, t + i * .045, .06, 'triangle', .11); },                   // bell ring
  certs: (t) => { tone(sfxBus, 2093, t, .7, 'sine', .1); tone(sfxBus, 3136, t, .45, 'sine', .04); },                                       // glass ting
  lights: (t) => { noise(sfxBus, t, .02, 'highpass', 1800, 0, .5); tone(sfxBus, 190, t, .07, 'sine', .25, 80); },                          // switch click
  bag: (t) => { for (let i = 0; i < 7; i++) noise(sfxBus, t + i * .06 + Math.random() * .03, .07, 'bandpass', 2200 + Math.random() * 3000, 0, .22, .7); }, // paper rustle
  notebook: (t) => { noise(sfxBus, t, .3, 'highpass', 700, 5200, .22); },                                                                  // page flip
  name: (t) => { [659, 784, 1047].forEach((f, i) => tone(sfxBus, f, t + i * .1, .35, 'triangle', .12)); },                                 // little fanfare
  frame: (t) => { if (meowBuf) { const s = A.createBufferSource(); s.buffer = meowBuf; s.connect(sfxBus); s.start(t); return; }   // meow; the chirp below is the fallback until it has loaded
    tone(sfxBus, 620, t, .12, 'sine', .12, 880); tone(sfxBus, 880, t + .1, .3, 'sine', .1, 1320); },                         // bright chirp
  speaker: (t) => { tone(sfxBus, 95, t, .2, 'sine', .5, 42); noise(sfxBus, t, .08, 'lowpass', 900, 0, .2); },                              // thump
};
function sfx(name) { if (A && SFX[name]) SFX[name](A.currentTime + .01); }
function applyVolume() {
  if (!A) return;
  master.gain.setTargetAtTime(S.muted ? 0 : 1, A.currentTime, .05);
  musicBus.gain.setTargetAtTime(S.musicOn ? 1 : 0, A.currentTime, .15);
  if (musicEl) { musicEl.volume = S.musicOn && !S.muted ? .6 : 0; }
}
function startAudio() {
  A = new (window.AudioContext || window.webkitAudioContext)();
  master = A.createGain(); master.connect(A.destination);
  musicBus = A.createGain(); musicBus.connect(master); sfxBus = A.createGain(); sfxBus.connect(master);
  noiseBuf = A.createBuffer(1, A.sampleRate * 2, A.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  // room tone: soft white-noise air, a low computer-fan hum and a slow breeze outside. Always on (the mute button still silences it).
  const air = A.createBufferSource(); air.buffer = noiseBuf; air.loop = true;
  const loop = (type, freq, q, gain) => { const f = A.createBiquadFilter(), g = A.createGain(); f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain; air.connect(f).connect(g).connect(master); return [f, g]; };
  loop('lowpass', 2600, .3, .010);                                  // the hiss of a quiet room
  loop('bandpass', 180, 1.2, .016);                                  // fan hum from the PC
  const [, breeze] = loop('bandpass', 520, .6, .007);                // wind against the windows, slowly rising and falling
  const lfo = A.createOscillator(), depth = A.createGain(); lfo.frequency.value = .07; depth.gain.value = .005; lfo.connect(depth).connect(breeze.gain); lfo.start();
  air.start();
  fetch('assets/meow.mp3' + VER).then((r) => r.arrayBuffer()).then((b) => A.decodeAudioData(b)).then((b) => { meowBuf = b; }).catch(() => {});
  if (C.music) { musicEl = new Audio(C.music); musicEl.loop = true; musicEl.play().catch(() => {}); applyVolume(); return; }
  // built-in ambient music, made to sound like it comes from the speaker in the room:
  // slow soft chords and a few stray notes, muffled a little and sent through a room echo
  const room = A.createConvolver(), len = Math.floor(A.sampleRate * 2.4), ir = A.createBuffer(2, len, A.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  room.buffer = ir;
  const tone_ = A.createBiquadFilter(); tone_.type = 'lowpass'; tone_.frequency.value = 1500;
  const dry = A.createGain(), wet = A.createGain(); dry.gain.value = .5; wet.gain.value = .55;
  tone_.connect(dry).connect(musicBus); tone_.connect(room).connect(wet).connect(musicBus);
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const pad = (m, t, dur, g) => {                                  // a note that swells in and fades out slowly
    for (const det of [-5, 5]) {
      const o = A.createOscillator(), n = A.createGain();
      o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = det;
      n.gain.setValueAtTime(0, t); n.gain.linearRampToValueAtTime(g, t + dur * .4); n.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(n).connect(tone_); o.start(t); o.stop(t + dur + .05);
    }
  };
  const chords = [[48, 55, 64, 67, 71], [45, 52, 60, 64, 67], [41, 53, 57, 60, 64], [43, 50, 59, 62, 69]];   // Cmaj7, Am7, Fmaj7, G6/9
  const span = 9;                                                   // seconds per chord
  let next = A.currentTime + .1, bar = 0;
  const schedule = () => {
    while (next < A.currentTime + 2) {
      const ch = chords[bar % 4], t = next;
      ch.forEach((m, i) => pad(m, t + i * .35, span * 1.25, i ? .03 : .055));
      for (let k = 0; k < 3; k++) if (Math.random() < .7) {         // a few soft bell-like notes drifting over the top
        const m = ch[1 + Math.floor(Math.random() * 4)] + 12 * (1 + Math.floor(Math.random() * 2));
        tone(tone_, hz(m), t + 1 + Math.random() * (span - 2), 3.5, 'sine', .05);
      }
      next += span; bar++;
    }
  };
  schedule(); setInterval(schedule, 500);
}
$('#mute').addEventListener('click', (e) => { S.muted = !S.muted; e.currentTarget.setAttribute('aria-pressed', S.muted); applyVolume(); });

// ---------------------------------------------------------------- intro
$('#enter').addEventListener('click', () => {
  if (S.entered) return; S.entered = true;
  try { startAudio(); } catch (e) { console.warn('audio unavailable', e); }
  intro.classList.add('gone');
  view.pitch = HOME.pitch;
  tween(HOME, 2, EASE.p3, .4, () => { S.control = true; document.body.classList.remove('intro-open'); });
  if (C.youtube && location.protocol !== 'file:') {            // YouTube refuses to play from file://
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(C.youtube)}?autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(C.youtube)}&controls=0&playsinline=1&rel=0`;
    f.allow = 'autoplay; encrypted-media'; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.title = 'Video on the monitor'; f.tabIndex = -1;
    tv.appendChild(f);
  }
});
window.__room = { view, S, pick, project, dirLL, M };   // handy in the console
})();
