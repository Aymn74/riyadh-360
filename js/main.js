// main.js — renderer, atmosphere, cameras, input, HUD, minimap and the street atlas.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as G from './geo.js';
import { U, makeGroundMaterial, makeSky, poolMat, skipHoles } from './materials.js';
import { buildLandmarks } from './landmarks.js';
import { Player } from './player.js';
import { OSM, RC, F, SEG } from './osm.js';
import { World } from './world.js';
import { Cars } from './cars.js';
import { Guide } from './guide.js';
import { Tour, LANGS, ARRIVED } from './tour.js';
import { TouristPanel } from './tourist.js';
import { esc } from './util.js';

const $ = (id) => document.getElementById(id);
const status = (t, p) => { $('loading-status').textContent = t; if (p !== undefined) $('loading-progress').style.width = (p * 100).toFixed(0) + '%'; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

// ---------- renderer & scene ----------
const touch = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('canvas-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 50000);
// upright phones: keep at least ~64 degrees across, or the road ahead is a narrow slot
function fitFov() {
  const a = camera.aspect, minH = 64 * Math.PI / 180;
  camera.fov = a >= 1.2 ? 60 : Math.min(84, Math.max(60, 2 * Math.atan(Math.tan(minH / 2) / a) * 180 / Math.PI));
}
fitFov(); camera.updateProjectionMatrix();
scene.fog = new THREE.Fog(0xd3cbb9, 600, 11000);

const sky = makeSky();
scene.add(sky);
const envScene = new THREE.Scene();
const envSky = new THREE.Mesh(sky.geometry, sky.material);
envSky.scale.setScalar(100);
envScene.add(envSky);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
scene.add(hemi);
// at night a soft warm light rides with the visitor, standing in for the street lamps all around
const nearGlow = new THREE.PointLight('#ffe4c4', 0, 46, 1.4);
scene.add(nearGlow);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 10, far: 2600 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.7;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

// ground and the arterial carriageways (they run on into the desert)
// tessellated: one huge triangle pair loses depth precision and swallows the roads seen from above
const ground = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000, 180, 180).rotateX(-Math.PI / 2), makeGroundMaterial());
skipHoles(ground.material);   // open trenches show through the ground
ground.position.y = -0.25;   // a clear gap below pavements and roads
ground.receiveShadow = true;
scene.add(ground);
// ---------- atmosphere presets ----------
const PRESETS = {
  noon: { ar: 'الظهيرة', sunEl: 70, sunAz: 165, sun: '#fff2df', sunI: 3.1, hs: '#c3d5e6', hg: '#b8956a', hi: 0.95, top: '#5b8fca', horizon: '#dcd6c4', bottom: '#c9b08a', glow: '#fff1d0', fog: '#d6cdb9', near: 700, far: 12000, night: 0, exp: 0.9, stars: 0, bloom: 0.08, env: 1.0 },
  maghrib: { ar: 'المغرب', sunEl: 4.5, sunAz: 258, sun: '#ffa65e', sunI: 2.6, hs: '#7d8db2', hg: '#a2774f', hi: 0.75, top: '#2d4d88', horizon: '#f2a25a', bottom: '#8a6a4c', glow: '#ff9545', fog: '#d4956a', near: 500, far: 9500, night: 0.45, exp: 1.05, stars: 0, bloom: 0.38, env: 0.6 },
  night: { ar: 'الليل', sunEl: 38, sunAz: 115, sun: '#a9bde6', sunI: 0.45, hs: '#34446a', hg: '#4a3524', hi: 0.62, top: '#030712', horizon: '#2a2232', bottom: '#1a140f', glow: '#5b3a22', fog: '#1f1b22', near: 400, far: 9000, night: 1, exp: 1.3, stars: 1, bloom: 0.62, env: 0.4 },
  haboob: { ar: 'عاصفة رملية', sunEl: 42, sunAz: 205, sun: '#ffc78a', sunI: 0.95, hs: '#d39a5a', hg: '#9a6a3c', hi: 1.15, top: '#b67b44', horizon: '#c98c50', bottom: '#a8733f', glow: '#e0a060', fog: '#c3854b', near: 15, far: 750, night: 0.3, exp: 1.0, stars: 0, bloom: 0.22, env: 0.5, dust: 1 }
};
let preset = PRESETS.maghrib, presetId = 'maghrib';
const sunDir = new THREE.Vector3();
function applyPreset(id) {
  presetId = id; preset = PRESETS[id];
  const el = THREE.MathUtils.degToRad(preset.sunEl), az = THREE.MathUtils.degToRad(preset.sunAz);
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  sun.color.set(preset.sun); sun.intensity = preset.sunI;
  hemi.color.set(preset.hs); hemi.groundColor.set(preset.hg); hemi.intensity = preset.hi;
  const su = sky.material.uniforms;
  su.top.value.set(preset.top); su.horizon.value.set(preset.horizon); su.bottom.value.set(preset.bottom);
  su.glow.value.set(preset.glow); su.sunCol.value.set(id === 'night' ? '#e8ecf5' : preset.sun);
  su.sunDir.value.copy(sunDir); su.stars.value = preset.stars; su.sunSize.value = id === 'night' ? 0.99985 : 0.9996;
  scene.fog.color.set(preset.fog); scene.fog.near = preset.near; scene.fog.far = preset.far;
  U.uNight.value = preset.night; U.uDust.value = preset.dust || 0;
  renderer.toneMappingExposure = preset.exp;
  if (bloom) bloom.strength = preset.bloom;
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0, 0.1, 1000);
  scene.environment = envRT.texture;
  scene.environmentIntensity = preset.env;
  dust.visible = !!preset.dust;
  poolMat.visible = preset.night > 0.05;
  document.querySelectorAll('.time-btn').forEach((b) => b.classList.toggle('active', b.dataset.time === id));
}

// haboob dust
const dust = (() => {
  const n = 5000, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 300; pos[i * 3 + 1] = Math.random() * 120; pos[i * 3 + 2] = (Math.random() - 0.5) * 300; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#d79a5c', size: 0.9, transparent: true, opacity: 0.55, depthWrite: false }));
  p.frustumCulled = false;
  scene.add(p);
  return p;
})();

// ---------- post ----------
let composer = null, bloom = null;
{
  // multisampled HDR target with a full depth buffer; phones skip the bloom pass
  const rt = new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: touch ? 2 : 3, stencilBuffer: true });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (!touch) {
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.4, 0.5, 0.9);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  // grade: a touch of contrast and warmth, gentle vignette
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, 1.1);
        c = (c - 0.5) * 1.06 + 0.5;
        vec2 q = vUv - 0.5;
        c *= 1.0 - dot(q, q) * 0.42;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`
  }));
}

// ---------- world ----------
const player = new Player(scene);
let osm = null, world = null, traffic = null;

// pedestrians: a light crowd on the pavements near the player
const peds = (() => {
  const N = 220;
  // two figures with painted parts: a man in thobe and shemagh, a woman in abaya
  const paint = (g, c) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const n = g.attributes.position.count, a = new Float32Array(n * 3); const col = new THREE.Color(c); for (let i = 0; i < n; i++) col.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const man = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.19, 0.29, 1.42, 12).translate(0, 0.71, 0), '#ffffff'),
    paint(new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 0.85).translate(0, 1.42, 0), '#ffffff'),
    paint(new THREE.CylinderGeometry(0.055, 0.07, 0.62, 6).translate(0, 1.12, 0.24), '#ffffff'),
    paint(new THREE.CylinderGeometry(0.055, 0.07, 0.62, 6).translate(0, 1.12, -0.24), '#ffffff'),
    paint(new THREE.SphereGeometry(0.11, 10, 8).translate(0.02, 1.64, 0), '#9c7153'),
    paint(new THREE.ConeGeometry(0.2, 0.46, 12, 1, true).translate(-0.02, 1.56, 0), '#c8343a'),
    paint(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.68, 0), '#e9e5e0'),
    paint(new THREE.TorusGeometry(0.115, 0.02, 5, 14).rotateX(Math.PI / 2).translate(0, 1.73, 0), '#151515')
  ]);
  const woman = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.17, 0.34, 1.5, 12).translate(0, 0.75, 0), '#ffffff'),
    paint(new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 0.85).translate(0, 1.48, 0), '#ffffff'),
    paint(new THREE.SphereGeometry(0.115, 10, 8).scale(1, 1.15, 1).translate(0, 1.63, 0), '#ffffff')
  ]);
  const pmat = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true });
  const body = new THREE.InstancedMesh(man, pmat, N);
  const head = new THREE.InstancedMesh(woman, pmat, N);
  body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  head.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  body.frustumCulled = head.frustumCulled = false;
  body.castShadow = true;
  scene.add(body, head);
  const list = Array.from({ length: N }, () => ({ ok: false }));
  const m = new THREE.Matrix4(), zero = new THREE.Matrix4();
  const white = new THREE.Color('#f3f1ec'), black = new THREE.Color('#15151a'), skin = new THREE.Color('#b98a66'), scarf = new THREE.Color('#d9d2cc');
  const perSeg = new Map();   // at most three walkers per pavement segment, so they never bunch up
  function respawn(p, fx, fz) {
    if (p.key !== undefined) { perSeg.set(p.key, (perSeg.get(p.key) || 1) - 1); p.key = undefined; }
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 300;
      const hit = osm.nearestRoad(fx + Math.cos(a) * r, fz + Math.sin(a) * r, 60, (rr) => { const c = osm.cls(rr); return c >= RC.tertiary && c <= RC.living && !(osm.flags(rr) & (F.bridge | F.tunnel)); });
      if (!hit) continue;
      const st = osm.s.roads[hit.road * 4 + 2], P = osm.s.roadPts, k = (st + hit.seg) * 2;
      const x0 = P[k], z0 = P[k + 1], x1 = P[k + 2], z1 = P[k + 3], L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 15) continue;
      const key = hit.road * 65536 + hit.seg;
      if ((perSeg.get(key) || 0) >= Math.min(3, Math.floor(L / 12))) continue;
      const side = Math.random() < 0.5 ? 1 : -1, off = osm.width(hit.road) / 2 + 1.6;
      const nx = -(z1 - z0) / L * side * off, nz = (x1 - x0) / L * side * off;
      // the pavement must not lie on another carriageway (parallel service roads, junctions)
      const onRoad = (x, z) => { const h = osm.nearestRoad(x, z, 6, (rr) => rr !== hit.road && osm.cls(rr) !== RC.pedestrian); return h && h.dist < 4; };
      if (onRoad(x0 + nx, z0 + nz) || onRoad(x1 + nx, z1 + nz) || onRoad((x0 + x1) / 2 + nx, (z0 + z1) / 2 + nz)) continue;
      perSeg.set(key, (perSeg.get(key) || 0) + 1);
      Object.assign(p, { key, ax: x0 + nx, az: z0 + nz, bx: x1 + nx, bz: z1 + nz, L, s: Math.random() * L, dir: Math.random() < 0.5 ? 1 : -1, v: 1.0 + Math.random() * 0.6, abaya: Math.random() < 0.35, ok: true });
      return;
    }
    p.ok = false;
  }
  function at(p) {
    if (p.s > p.L - 2) { p.s = p.L - 2; p.dir = -1; } else if (p.s < 2) { p.s = 2; p.dir = 1; }
    const t = p.s / p.L;
    return [p.ax + (p.bx - p.ax) * t, p.az + (p.bz - p.az) * t];
  }
  return {
    update(dt, fx, fz, show) {
      body.visible = head.visible = show;
      if (!show) return;
      list.forEach((p, i) => {
        if (!p.ok || (p.wx - fx) ** 2 + (p.wz - fz) ** 2 > 420 * 420) respawn(p, fx, fz);
        if (!p.ok) { m.makeScale(0, 0, 0); body.setMatrixAt(i, m); head.setMatrixAt(i, m); return; }
        p.s += p.v * p.dir * dt;
        const [wx, wz] = at(p);
        p.wx = wx; p.wz = wz;
        const yaw = Math.atan2(-(p.bz - p.az) * p.dir, (p.bx - p.ax) * p.dir);
        m.makeRotationY(yaw); m.setPosition(wx, 0.08 + Math.abs(Math.sin(p.s * 3.5)) * 0.03, wz);
        (p.abaya ? head : body).setMatrixAt(i, m);
        zero.makeScale(0, 0, 0); (p.abaya ? body : head).setMatrixAt(i, zero);
        body.setColorAt(i, i % 7 ? white : scarf);
        head.setColorAt(i, black);
      });
      body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
      body.instanceColor.needsUpdate = head.instanceColor.needsUpdate = true;
    }
  };
})();

// ---------- cameras ----------
const P = G.PLACES;
const at = (k, dx = 0, dz = 0) => new THREE.Vector3(P[k].x + dx, 0, P[k].z + dz);
const SCENIC = [
  { id: 'skybridge', ar: 'من جسر برج المملكة', pos: () => { const v = at('kingdom'); v.y = 316; return v; }, look: () => { const v = at('faisaliah'); v.y = 150; return v; }, drift: 0.02 },
  { id: 'kingdomOrbit', ar: 'حول برج المملكة', orbit: { c: 'kingdom', r: 520, h: 240, ty: 170, s: 0.035 } },
  { id: 'faisaliah', ar: 'كرة الفيصلية', orbit: { c: 'faisaliah', r: 260, h: 210, ty: 200, s: -0.05 } },
  { id: 'kfr', ar: 'طريق الملك فهد', pos: () => kfrShot().pos, look: () => kfrShot().look, drift: 0 },
  { id: 'kafd', ar: 'أفق المركز المالي', orbit: { c: 'kafd', r: 1100, h: 320, ty: 180, s: 0.025 } },
  { id: 'masmak', ar: 'ساحة المصمك', pos: () => at('masmak', -60, 90).setY(14), look: () => at('masmak').setY(10), drift: 0.01 },
  { id: 'diriyah', ar: 'الدرعية ووادي حنيفة', orbit: { c: 'turaif', r: 700, h: 160, ty: 10, s: 0.02 } },
  { id: 'skyline', ar: 'أفق الرياض', pos: () => { const w = G.geo(24.6560, 46.7250); return new THREE.Vector3(w.x, 420, w.z); }, look: () => at('kingdom').setY(120), drift: 0 }
];
// hover above King Fahd Road south of Al Faisaliah, looking north up the road
let kfrCache = null;
function kfrShot() {
  if (kfrCache) return kfrCache;
  const w = G.geo(24.6790, 46.6915);
  const hit = osm && osm.nearestRoad(w.x, w.z, 600, (r) => { const n = osm.nameOf(r); return n && /King Fahd/.test(n[1]) && osm.cls(r) <= RC.trunk; });
  const x = hit ? hit.x : w.x, z = hit ? hit.z : w.z;
  let dx = hit ? hit.dirx : -0.47, dz = hit ? hit.dirz : -0.88;
  if (dz > 0) { dx = -dx; dz = -dz; }   // north is -z
  kfrCache = { pos: new THREE.Vector3(x, 85, z), look: new THREE.Vector3(x + dx * 1800, 60, z + dz * 1800) };
  return kfrCache;
}
const FOLLOW = [
  { id: 'chase', ar: 'مطاردة' },
  { id: 'pov', ar: 'منظور السائق' },
  { id: 'top', ar: 'علوي' }
];
const CAMS = [...FOLLOW, ...SCENIC, { id: 'drone', ar: 'المخرج الآلي' }];
let camYaw = 0, camGy = 0;
let camId = 'chase', camT = 0, directorIdx = 0, directorT = 0, lookIdle = 0;
const orbitCtl = { yaw: 0, pitch: 0.18, zoom: 1 };
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function scenicPose(s, t, out, look) {
  if (s.orbit) {
    const o = s.orbit, c = at(o.c), a = t * o.s + 0.8;
    out.set(c.x + Math.cos(a) * o.r, o.h, c.z + Math.sin(a) * o.r);
    look.copy(c).setY(o.ty);
  } else {
    out.copy(s.pos()); look.copy(s.look());
    if (s.drift) { out.x += Math.sin(t * s.drift * 6) * 30; out.z += Math.cos(t * s.drift * 6) * 30; }
  }
}
function updateCamera(dt) {
  camT += dt;
  if (tour?.active) {
    // the guided tour flies the camera itself
    tour.update(dt);
    camPos.copy(tour.pos); camLook.copy(tour.look);
    camera.position.copy(camPos); camera.lookAt(camLook);
    return;
  }
  lookIdle += dt;
  if (lookIdle > 1.5 && Math.abs(player.speed) > 2 && camId !== 'top') {
    orbitCtl.yaw *= 1 - Math.min(1, dt * 1.2);
    orbitCtl.pitch += (0.18 - orbitCtl.pitch) * Math.min(1, dt * 0.8);
  }
  const p = player.pos;
  const fwd = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  let id = camId;
  if (id === 'drone') {
    directorT += dt;
    if (directorT > 11) { directorT = 0; directorIdx = (directorIdx + 1) % SCENIC.length; }
    id = SCENIC[directorIdx].id;
  }
  const s = SCENIC.find((x) => x.id === id);
  if (s) {
    scenicPose(s, camT, camPos, camLook);
    camera.position.copy(camPos); camera.lookAt(camLook);
    return;
  }
  const h = player.height;
  if (id === 'pov') {
    const eye = player.mode === 'car' ? 1.55 : player.mode === 'heli' ? player.alt + 2.2 : 1.7 + player.alt;
    const fx = player.mode === 'car' ? 0.4 : player.mode === 'heli' ? 1.8 : 0.25;
    camera.position.set(p.x + fwd.x * fx, eye, p.z + fwd.z * fx);
    const yaw = player.yaw + orbitCtl.yaw;
    camera.lookAt(p.x + Math.cos(yaw) * 50, eye - 50 * Math.sin(orbitCtl.pitch - 0.12), p.z - Math.sin(yaw) * 50);
    return;
  }
  let dist, up, look;
  if (id === 'top') { dist = 60 * orbitCtl.zoom; up = 140 * orbitCtl.zoom; look = 0; }
  else {
    dist = (player.mode === 'person' ? 5.5 : player.mode === 'car' ? 11 : 30) * orbitCtl.zoom * (player.gy < -2 && player.mode !== 'heli' ? 0.75 : 1);
    up = 0; look = player.mode === 'person' ? 1.5 : player.mode === 'car' ? 1.6 : 2.5;
    if (camera.aspect < 1 && player.mode === 'car') { dist *= 1.2; up = 1.2; }   // upright phone: a little higher and further back
  }
  // the camera heading trails the car's heading; position is then rigid to the car, so the car never shakes on screen
  const dy = Math.atan2(Math.sin(player.yaw - camYaw), Math.cos(player.yaw - camYaw));
  camYaw = Math.abs(dy) > 2.5 ? player.yaw : camYaw + dy * (1 - Math.exp(-dt * (player.mode === 'car' ? 4 : 6)));
  const yaw = camYaw + orbitCtl.yaw + Math.PI;
  const pitch = id === 'top' ? 1.1 : orbitCtl.pitch + (player.mode === 'heli' ? 0.12 : 0);
  camGy += (player.gy - camGy) * Math.min(1, dt * 4);   // ramps and bridges ease the camera height
  const base = player.mode === 'heli' ? player.alt : camGy + (player.mode === 'person' ? player.alt : 0);
  const ahead = id === 'top' || player.mode === 'heli' ? 0 : player.mode === 'car' ? (camera.aspect < 1 ? 9 : 5) : 2;
  const target = new THREE.Vector3(p.x + Math.cos(camYaw) * ahead, base + look, p.z - Math.sin(camYaw) * ahead);
  const want = new THREE.Vector3(
    p.x + Math.cos(yaw) * Math.cos(pitch) * dist,
    base + look + Math.sin(pitch) * dist + up,
    p.z - Math.sin(yaw) * Math.cos(pitch) * dist
  );
  want.y = Math.max(want.y, 0.6 + Math.min(0, player.gy));
  if (player.mode !== 'heli' && player.gy < -2) { want.y = Math.min(want.y, player.gy + 4.6); }
  const k = 1 - Math.exp(-dt * (player.mode === 'car' ? 7 : 5));
  if (player.mode === 'heli' || id === 'top' || camPos.distanceTo(want) > 300) {
    camPos.lerp(want, camPos.distanceTo(want) > 300 ? 1 : k);
    if (player.mode === 'heli') camPos.y += (want.y - camPos.y) * Math.min(1, k * 3);
    camLook.lerp(target, camLook.distanceTo(target) > 300 ? 1 : Math.min(1, k * 1.6));
  } else {
    camPos.copy(want); camLook.copy(target);   // rigid to the car: nothing to shake
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}
function setCamera(id) {
  camId = id;
  camT = 0; directorT = 0;
  if (id === 'chase' || id === 'top') orbitCtl.yaw = 0;
  $('hud-active-camera').textContent = CAMS.find((c) => c.id === id).ar;
  document.querySelectorAll('.cam-btn').forEach((b) => b.classList.toggle('active', b.dataset.camera === id));
}

// ---------- input ----------
const keys = {};
const input = { up: false, down: false, left: false, right: false, boost: false, jump: false, descend: false, ax: 0, ay: 0, az: 0 };
const typing = () => document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
addEventListener('keydown', (e) => {
  if (typing()) return;
  keys[e.code] = true;
  const k = e.code;
  if (k === 'Digit1') setMode('person');
  if (k === 'Digit2') setMode('car');
  if (k === 'Digit3') setMode('heli');
  if (k === 'KeyV') { const i = CAMS.findIndex((c) => c.id === camId); setCamera(CAMS[(i + 1) % CAMS.length].id); }
  if (k === 'KeyC') setCamera(camId === 'pov' ? 'chase' : 'pov');
  if (k === 'KeyM') { e.preventDefault(); toggleMap(); }
  if (k === 'KeyH') toggleHud();
  if (k === 'KeyG') guide?.openList();
  if (k === 'Escape' && tour?.active) tour.stop();
  if (k === 'Escape' && tourist && !tourist.el.hidden) tourist.toggle(false);
  if (k === 'Escape' && guide && !guide.card.hidden) guide.hideCard();
  if (k === 'KeyP') tourist?.toggle();
  if (k === 'KeyT') { const ids = Object.keys(PRESETS); applyPreset(ids[(ids.indexOf(presetId) + 1) % ids.length]); }
  if (k === 'Escape' && !$('fullmap-modal').hidden) toggleMap(false);
  if (['Space', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(k)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function readKeys() {
  input.up = keys.KeyW || keys.ArrowUp || touchGas; input.down = keys.KeyS || keys.ArrowDown || touchBrake;
  input.left = keys.KeyA || keys.ArrowLeft; input.right = keys.KeyD || keys.ArrowRight;
  input.boost = keys.ShiftLeft || keys.ShiftRight || touchBoost;
  input.jump = keys.Space || keys.KeyE || keys.PageUp || touchUp;
  input.descend = keys.KeyQ || keys.PageDown || keys.ControlLeft || touchDown;
}
// orbit with the mouse
{
  const el = renderer.domElement;
  let drag = null;
  el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbitCtl.yaw -= (e.clientX - drag.x) * 0.005; lookIdle = 0;
    orbitCtl.pitch = THREE.MathUtils.clamp(orbitCtl.pitch + (e.clientY - drag.y) * 0.004, -0.3, 1.35);
    drag = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener('pointerup', () => { drag = null; });
  el.addEventListener('wheel', (e) => { orbitCtl.zoom = THREE.MathUtils.clamp(orbitCtl.zoom * Math.exp(e.deltaY * 0.001), 0.35, 6); e.preventDefault(); }, { passive: false });
}
// touch: joystick on the left, drag elsewhere to look
let touchUp = false, touchDown = false, touchBoost = false, touchGas = false, touchBrake = false;
if (touch) {
  $('touch-controls').hidden = false;
  const stick = $('touch-stick'), knob = $('touch-stick-knob');
  let sid = null, c0 = null;
  stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; const r = stick.getBoundingClientRect(); c0 = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; stick.setPointerCapture(sid); move(e); });
  const move = (e) => {
    if (e.pointerId !== sid) return;
    let dx = (e.clientX - c0.x) / c0.r, dy = (e.clientY - c0.y) / c0.r;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
    // dead zone and a soft curve: small finger wobble must not steer
    const shape = (v, dz) => { const a = Math.max(0, (Math.abs(v) - dz) / (1 - dz)); return Math.sign(v) * a * (0.35 + 0.65 * a); };
    const steerOnly = player.mode === 'car';   // driving: the pedals do throttle and brake
    if (steerOnly) knob.style.transform = `translate(${dx * 38}px, 0px)`;
    input.ax = -shape(dx, steerOnly ? 0.1 : 0.18); input.ay = steerOnly ? 0 : -shape(dy, 0.12);
  };
  stick.addEventListener('pointermove', move);
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; input.ax = input.ay = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  const el = renderer.domElement;
  const pts = new Map();
  el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX; p.y = e.clientY;
      const [c, d] = [...pts.values()];
      orbitCtl.zoom = THREE.MathUtils.clamp(orbitCtl.zoom * d0 / Math.max(1, Math.hypot(c.x - d.x, c.y - d.y)), 0.35, 6);
      return;
    }
    orbitCtl.yaw -= (e.clientX - p.x) * 0.006; lookIdle = 0;
    orbitCtl.pitch = THREE.MathUtils.clamp(orbitCtl.pitch + (e.clientY - p.y) * 0.005, -0.3, 1.35);
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = (e) => pts.delete(e.pointerId);
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
document.querySelectorAll('.touch-action').forEach((b) => {
  const set = (v) => { const a = b.dataset.touchAction; if (a === 'up') touchUp = v; if (a === 'down') touchDown = v; if (a === 'boost') touchBoost = v; if (a === 'gas') touchGas = v; if (a === 'brake') touchBrake = v; b.setAttribute('aria-pressed', v); };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); });
  b.addEventListener('pointerup', () => set(false)); b.addEventListener('pointerleave', () => set(false)); b.addEventListener('pointercancel', () => set(false));
});
// a clicked HUD button must not keep keyboard focus, or Space would press it again instead of flying
// a button clicked with the mouse gives its focus back, or Space would press it again instead of flying;
// a button activated from the keyboard (detail 0) keeps it, so keyboard users do not lose their place
document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && e.detail > 0 && !b.closest('#fullmap-modal')) b.blur(); });

function startTour() {
  if (!tour) return;
  if (player.mode !== 'car') setMode('car');
  tour.open(camera.position.clone(), camLook.clone());
}
// ---------- modes, teleports ----------
const HINTS = {
  person: 'W A S D للمشي · Shift للركض · Space للقفز · اسحب للتدوير',
  car: 'W للتسارع · S للفرملة · A D للتوجيه · Shift تيربو · C منظور السائق',
  heli: 'W A S D للطيران · Space أو E صعود · Q هبوط · Shift سرعة'
};
function setMode(m) {
  player.setMode(m);
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  $('hud-active-mode').textContent = player.modeInfo.label;
  $('hud-controls-hint').textContent = touch ? '' : HINTS[m];
  document.querySelectorAll('.touch-action[data-touch-action="down"]').forEach((b) => (b.hidden = m !== 'heli'));
  if (!touch) $('touch-controls').hidden = m !== 'heli';
  document.querySelectorAll('.touch-action[data-touch-action="up"]').forEach((b) => (b.hidden = m === 'car'));
  document.querySelectorAll('.pedals').forEach((p) => (p.hidden = !(touch && m === 'car')));
  document.body.classList.toggle('driving-touch', touch && m === 'car');
  input.ay = 0;
  const upLabel = document.querySelector('[data-touch-label="up"]'); if (upLabel) upLabel.textContent = m === 'heli' ? 'صعود' : 'قفز';
}
// each teleport lands on the nearest big road to a real spot, facing along the traffic
const TELEPORTS = [
  { id: 'kingdom', ar: 'برج المملكة', sub: 'طريق الملك فهد · العليا', at: [24.7095, 46.6745] },
  { id: 'faisaliah', ar: 'برج الفيصلية', sub: 'طريق الملك فهد · العليا', at: [24.6925, 46.6838] },
  { id: 'tahlia', ar: 'شارع التحلية', sub: 'السليمانية', at: [24.6985, 46.6905] },
  { id: 'kafd', ar: 'المركز المالي (كافد)', sub: 'الطريق الدائري الشمالي', at: [24.7650, 46.6440] },
  { id: 'rafal', ar: 'برج رافال', sub: 'طريق الملك فهد · الصحافة', at: [24.7915, 46.6345] },
  { id: 'masmak', ar: 'قصر المصمك', sub: 'الديرة · وسط الرياض', at: [24.6305, 46.7150], small: true },
  { id: 'museum', ar: 'المتحف الوطني', sub: 'المربع', at: [24.6460, 46.7090], small: true },
  { id: 'turaif', ar: 'حي الطريف', sub: 'الدرعية · وادي حنيفة', at: [24.7350, 46.5790], small: true }
];
function teleport(t) {
  const w = G.geo(t.at[0], t.at[1]);
  let x = w.x, z = w.z, yaw;
  const want = (r) => !(osm.flags(r) & (F.tunnel | F.bridge)) && (t.small ? osm.cls(r) <= RC.living : osm.cls(r) <= RC.tertiary);
  // prefer the main carriageway when one runs close by, otherwise any suitable street
  const hit = osm && (!t.small && osm.nearestRoad(x, z, 150, (r) => want(r) && osm.cls(r) <= RC.primary) || osm.nearestRoad(x, z, 400, want));
  if (hit) {
    const ow = osm.flags(hit.road) & F.oneway, hw = osm.width(hit.road) / 2;
    // keep right: inside lane of a one-way carriageway, right half of a two-way street
    const off = ow ? hw * 0.35 : hw * 0.5;
    x = hit.x - hit.dirz * off; z = hit.z + hit.dirx * off;
    yaw = Math.atan2(-hit.dirz, hit.dirx);
  }
  player.teleport(x, z, yaw);
  camPos.set(player.pos.x, 2000, player.pos.z); // snaps the follow camera
  if (!SCENIC.find((s) => s.id === camId) && camId !== 'drone') setCamera(camId);
}

// ---------- HUD wiring ----------
function buildMenus() {
  const tp = $('teleport-list');
  for (const t of TELEPORTS) {
    const b = document.createElement('button');
    b.className = 'pop-item'; b.type = 'button';
    b.innerHTML = `<span class="pop-name">${t.ar}</span><span class="pop-sub">${t.sub}</span>`;
    b.onclick = () => { teleport(t); $('teleport-popover').hidePopover?.(); };
    tp.appendChild(b);
  }
  const cl = $('camera-list');
  const addGroup = (title, items) => {
    const h = document.createElement('div'); h.className = 'pop-title'; h.textContent = title; cl.appendChild(h);
    for (const c of items) {
      const b = document.createElement('button');
      b.className = 'pop-item cam-btn'; b.type = 'button'; b.dataset.camera = c.id;
      b.innerHTML = `<span class="pop-name">${c.ar}</span>`;
      b.onclick = () => { setCamera(c.id); $('camera-popover').hidePopover?.(); };
      cl.appendChild(b);
    }
  };
  addGroup('متابعة', FOLLOW);
  addGroup('مشاهد', [...SCENIC, { id: 'drone', ar: 'المخرج الآلي' }]);
  document.querySelectorAll('.time-btn').forEach((b) => (b.onclick = () => applyPreset(b.dataset.time)));
  document.querySelectorAll('.mode-btn').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('cam-prev').onclick = () => { const i = CAMS.findIndex((c) => c.id === camId); setCamera(CAMS[(i - 1 + CAMS.length) % CAMS.length].id); };
  $('cam-next').onclick = () => { const i = CAMS.findIndex((c) => c.id === camId); setCamera(CAMS[(i + 1) % CAMS.length].id); };
  $('btn-open-map').onclick = () => toggleMap(true);
  $('btn-guide').onclick = () => guide?.openList();
  $('minimap-card').onclick = () => toggleMap(true);
  $('fullmap-close').onclick = () => toggleMap(false);
  $('btn-toggle-hud').onclick = toggleHud;
}
function toggleHud() {
  const hidden = document.body.classList.toggle('hud-hidden');
  $('btn-toggle-hud').setAttribute('aria-pressed', hidden);
}

// ---------- minimap ----------
const mm = $('minimap-canvas'), mctx = mm.getContext('2d');
// road colours by class (motorway, trunk, primary, secondary, tertiary, local...)
const ROAD_COL = ['#f0b44c', '#f0b44c', '#f3d27a', '#f4efe6', '#e9e3d6', '#c9c1b2', '#bdb5a6', '#bdb5a6', '#a39b8d', '#f0b44c', '#e9e3d6', '#c9c1b2'];
const ROAD_MIN = [2.6, 2.4, 2.0, 1.7, 1.4, 1, 1, 1, 0.7, 1.4, 1.1, 0.8];
// draws every road crossing the view; at small scales only the main network
function drawRoadsOn(ctx, toScreen, scale, x0, z0, x1, z1) {
  const maxCls = scale < 0.03 ? RC.secondary : scale < 0.08 ? RC.tertiary : 11;
  const seen = new Set(), P = osm.s.roadPts;
  const order = [];
  osm.forItems(osm.segGrid, x0, z0, x1, z1, (v) => { const r = Math.floor(v / SEG); if (seen.has(r)) return; seen.add(r); const c = osm.cls(r); if (c <= maxCls) order.push(r); });
  order.sort((a, b) => osm.cls(b) - osm.cls(a));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of order) {
    const c = osm.cls(r), st = osm.s.roads[r * 4 + 2], n = osm.s.roads[r * 4 + 3];
    const tun = osm.flags(r) & F.tunnel;
    ctx.strokeStyle = tun ? '#8d867b' : ROAD_COL[c];
    ctx.setLineDash(tun ? [5, 4] : []);
    ctx.lineWidth = Math.max(ROAD_MIN[c], osm.width(r) * scale);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const q = toScreen(P[(st + i) * 2], P[(st + i) * 2 + 1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
}
function drawBlocks(ctx, toScreen, x0, z0, x1, z1) {
  const B = osm.s.bldPts, seen = new Set();
  ctx.fillStyle = '#5a534a';
  ctx.beginPath();
  osm.forItems(osm.bldGrid, x0, z0, x1, z1, (b) => {
    if (seen.has(b)) return; seen.add(b);
    const st = osm.s.buildings[b * 4 + 2], n = osm.s.buildings[b * 4 + 3];
    for (let i = 0; i < n; i++) { const q = toScreen(B[(st + i) * 2], B[(st + i) * 2 + 1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.closePath();
  });
  ctx.fill();
  // generated plots
  ctx.fillStyle = '#4a443c';
  ctx.beginPath();
  osm.forItems(osm.fillGrid, x0, z0, x1, z1, (f) => {
    const p = osm.fill(f), c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const corner = (a, b) => toScreen(p.x + a * c + b * s, p.z - a * s + b * c);
    const q = [corner(-p.w / 2, -p.d / 2), corner(p.w / 2, -p.d / 2), corner(p.w / 2, p.d / 2), corner(-p.w / 2, p.d / 2)];
    ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath();
  });
  ctx.fill();
}
function drawLand(ctx, toScreen, x0, z0, x1, z1) {
  const LP = osm.s.landPts, nl = osm.s.land.length / 3;
  const fills = { 1: '#4e6a33', 2: '#4f7a45', 3: '#5a6034', 4: '#3d5a2a', 6: '#2f5f6e', 8: '#6d6355' };
  for (let l = 0; l < nl; l++) {
    const k = osm.s.land[l * 3]; if (!fills[k]) continue;
    const st = osm.s.land[l * 3 + 1], n = osm.s.land[l * 3 + 2];
    const fx = LP[st * 2], fz = LP[st * 2 + 1];
    if (fx < x0 - 3000 || fx > x1 + 3000 || fz < z0 - 3000 || fz > z1 + 3000) continue;
    ctx.fillStyle = fills[k];
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const q = toScreen(LP[(st + i) * 2], LP[(st + i) * 2 + 1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.fill();
  }
}
function drawWadi(ctx, toScreen, scale) {
  ctx.strokeStyle = 'rgba(92,120,60,0.6)'; ctx.lineWidth = Math.max(3, 460 * scale);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); G.WADI.forEach((w, i) => { const s = toScreen(w.x, w.z); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke();
  ctx.lineCap = 'butt';
}
// the name of the road under a point (falls back to the nearest named road close by)
function roadName(x, z) {
  const hit = osm.nearestRoad(x, z, 45, (r) => osm.nameOf(r) && !(osm.flags(r) & F.tunnel));
  if (!hit) return null;
  const [ar, en] = osm.nameOf(hit.road);
  return { ar: ar || en, en: en || '' };
}
let mmTimer = 0;
function drawMinimap() {
  const dpr = Math.min(2, devicePixelRatio);
  const size = mm.clientWidth;
  if (mm.width !== size * dpr) { mm.width = mm.height = size * dpr; }
  const ctx = mctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2a2622'; ctx.fillRect(0, 0, size, size);
  const R = player.mode === 'heli' ? 1400 : 520;
  const scale = (size / 2) / R;
  const p = player.pos;
  const rot = player.yaw - Math.PI / 2; // heading up
  const toScreen = (x, z) => {
    const dx = x - p.x, dz = z - p.z;
    const c = Math.cos(rot), s = Math.sin(rot);
    return [size / 2 + (dx * c - dz * s) * scale, size / 2 + (dx * s + dz * c) * scale];
  };
  drawLand(ctx, toScreen, p.x - R * 1.5, p.z - R * 1.5, p.x + R * 1.5, p.z + R * 1.5);
  if (R < 900) drawBlocks(ctx, toScreen, p.x - R * 1.5, p.z - R * 1.5, p.x + R * 1.5, p.z + R * 1.5);
  drawRoadsOn(ctx, toScreen, scale, p.x - R * 1.5, p.z - R * 1.5, p.x + R * 1.5, p.z + R * 1.5);
  guide?.drawOn(ctx, toScreen, scale);
  for (const [k, pl] of Object.entries(P)) {
    const s = toScreen(pl.x, pl.z);
    if (s[0] < -10 || s[0] > size + 10 || s[1] < -10 || s[1] > size + 10) continue;
    ctx.fillStyle = '#1f9d63'; ctx.beginPath(); ctx.arc(s[0], s[1], 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); ctx.translate(size / 2, size / 2);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0d5ea8'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  $('radar-north').style.transform = `rotate(${(-rot) * 180 / Math.PI}deg) translateY(-${size / 2 - 12}px) rotate(${rot * 180 / Math.PI}deg)`;
}

// ---------- the full street atlas ----------
const fm = $('fullmap-canvas'), fctx = fm.getContext('2d');
const view = { x: 0, z: 0, s: 0.06 }; // pixels per metre
function toggleMap(open) {
  const modal = $('fullmap-modal');
  const show = open === undefined ? modal.hidden : open;
  modal.hidden = !show;
  if (show) { view.x = player.pos.x; view.z = player.pos.z; view.s = 0.06; drawAtlas(); if (!touch) setTimeout(() => $('fullmap-search').focus({ preventScroll: true }), 0); }
}
function drawAtlas() {
  const dpr = Math.min(2, devicePixelRatio);
  const W = fm.clientWidth, H = fm.clientHeight;
  if (fm.width !== W * dpr || fm.height !== H * dpr) { fm.width = W * dpr; fm.height = H * dpr; }
  const ctx = fctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#c9b38e'; ctx.fillRect(0, 0, W, H);
  const toScreen = (x, z) => [W / 2 + (x - view.x) * view.s, H / 2 + (z - view.z) * view.s];
  ctx.fillStyle = '#3a3631'; ctx.fillRect(0, 0, W, H);
  const vx0 = view.x - W / 2 / view.s, vx1 = view.x + W / 2 / view.s, vz0 = view.z - H / 2 / view.s, vz1 = view.z + H / 2 / view.s;
  drawLand(ctx, toScreen, vx0, vz0, vx1, vz1);
  if (view.s > 0.25) drawBlocks(ctx, toScreen, vx0, vz0, vx1, vz1);
  drawRoadsOn(ctx, toScreen, view.s, vx0, vz0, vx1, vz1);
  guide?.drawOn(ctx, toScreen, view.s);
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  if (view.s > 0.035) {
    ctx.font = '500 12px "IBM Plex Sans Arabic", sans-serif';
    for (const d of G.DISTRICTS) { const s = toScreen(d.x, d.z); ctx.fillStyle = 'rgba(255,248,235,0.55)'; ctx.fillText(d.ar, s[0], s[1]); }
  }
  ctx.font = '600 13px "IBM Plex Sans Arabic", sans-serif';
  for (const pl of Object.values(P)) {
    const s = toScreen(pl.x, pl.z);
    ctx.fillStyle = '#1f9d63'; ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = 'rgba(20,16,12,0.85)'; ctx.lineWidth = 3.5;
    ctx.strokeText(pl.ar, s[0], s[1] - 10); ctx.fillText(pl.ar, s[0], s[1] - 10);
  }
  if (view.s > 0.12) {
    // street names along the longest visible segment of each named road
    ctx.font = '600 11px "IBM Plex Sans Arabic", sans-serif'; ctx.fillStyle = '#20180e';
    const done = new Set(), P = osm.s.roadPts;
    osm.forItems(osm.segGrid, vx0, vz0, vx1, vz1, (v) => {
      const r = Math.floor(v / SEG), i = v % SEG, nm = osm.nameOf(r);
      if (!nm || osm.cls(r) > (view.s > 0.4 ? 7 : RC.tertiary)) return;
      const key = nm[0] || nm[1]; if (done.has(key)) return;
      const st = osm.s.roads[r * 4 + 2], k = (st + i) * 2;
      const L = Math.hypot(P[k + 2] - P[k], P[k + 3] - P[k + 1]) * view.s;
      if (L < ctx.measureText(key).width + 20) return;
      done.add(key);
      const q = toScreen((P[k] + P[k + 2]) / 2, (P[k + 1] + P[k + 3]) / 2);
      let ang = Math.atan2(P[k + 3] - P[k + 1], P[k + 2] - P[k]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(ang); ctx.fillText(key, 0, 4); ctx.restore();
    });
  }
  // player
  const s = toScreen(player.pos.x, player.pos.z);
  ctx.save(); ctx.translate(s[0], s[1]); ctx.rotate(-player.yaw + Math.PI / 2);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0d5ea8'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (pin) { const q = toScreen(pin.x, pin.z); ctx.fillStyle = '#c0242b'; ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
  const ll = G.toLatLon(view.x, view.z);
  $('fullmap-coords').textContent = `${ll.lat.toFixed(4)}° N · ${ll.lon.toFixed(4)}° E · ${(1 / view.s).toFixed(1)} م/بكسل`;
}
let pin = null;
{
  let drag = null, moved = 0;
  fm.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; fm.setPointerCapture(e.pointerId); });
  fm.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy);
    view.x -= dx / view.s; view.z -= dy / view.s; drag = { x: e.clientX, y: e.clientY }; drawAtlas();
  });
  fm.addEventListener('pointerup', (e) => {
    if (drag && moved < 6) {
      const r = fm.getBoundingClientRect();
      pin = { x: view.x + (e.clientX - r.left - r.width / 2) / view.s, z: view.z + (e.clientY - r.top - r.height / 2) / view.s };
      const d = G.districtAt(pin.x, pin.z), rd = roadName(pin.x, pin.z);
      $('fullmap-pin-label').textContent = (rd ? rd.ar + ' · ' : '') + d.ar;
      $('fullmap-go').disabled = false;
      drawAtlas();
    }
    drag = null;
  });
  fm.addEventListener('wheel', (e) => {
    const r = fm.getBoundingClientRect();
    const mx = (e.clientX - r.left - r.width / 2) / view.s + view.x, mz = (e.clientY - r.top - r.height / 2) / view.s + view.z;
    view.s = THREE.MathUtils.clamp(view.s * Math.exp(-e.deltaY * 0.0015), 0.012, 1.6);
    view.x = mx - (e.clientX - r.left - r.width / 2) / view.s; view.z = mz - (e.clientY - r.top - r.height / 2) / view.s;
    drawAtlas(); e.preventDefault();
  }, { passive: false });
  $('fullmap-zoom-in').onclick = () => { view.s = Math.min(1.6, view.s * 1.5); drawAtlas(); };
  $('fullmap-zoom-out').onclick = () => { view.s = Math.max(0.012, view.s / 1.5); drawAtlas(); };
  $('fullmap-locate').onclick = () => { view.x = player.pos.x; view.z = player.pos.z; drawAtlas(); };
  $('fullmap-go').onclick = () => { if (!pin) return; player.teleport(pin.x, pin.z); camPos.set(pin.x, 2000, pin.z); toggleMap(false); };
  const search = $('fullmap-search'), results = $('fullmap-results');
  let entries = null;
  // built on first search: landmarks, districts and every named street (one entry per name, at its middle)
  const searchIndex = () => {
    if (entries) return entries;
    entries = [
      ...Object.values(P).map((p) => ({ ar: p.ar, en: p.en, x: p.x, z: p.z, kind: 'معلم' })),
      ...G.DISTRICTS.map((d) => ({ ar: 'حي ' + d.ar, en: d.en, x: d.x, z: d.z, kind: 'حي' }))
    ];
    const byName = new Map(), RP = osm.s.roadPts;
    for (let r = 0; r < osm.nRoads; r++) {
      const nm = osm.nameOf(r); if (!nm) continue;
      const key = nm[0] || nm[1];
      const e = byName.get(key);
      if (e && e.len >= osm.roadLen[r]) continue;
      const st = osm.s.roads[r * 4 + 2], n = osm.s.roads[r * 4 + 3], mid = st + (n >> 1);
      byName.set(key, { ar: nm[0] || nm[1], en: nm[1] || '', x: RP[mid * 2], z: RP[mid * 2 + 1], kind: osm.cls(r) <= RC.tertiary ? 'طريق' : 'شارع', len: osm.roadLen[r] });
    }
    entries.push(...[...byName.values()].sort((a, b) => b.len - a.len));
    return entries;
  };
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    results.innerHTML = '';
    if (!q) return;
    for (const e of searchIndex().filter((e) => e.ar.includes(q) || e.en.toLowerCase().includes(q)).slice(0, 7)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pop-item';
      b.innerHTML = `<span class="pop-name">${esc(e.ar)}</span><span class="pop-sub">${esc(e.kind)} · ${esc(e.en)}</span>`;
      b.onclick = () => { view.x = e.x; view.z = e.z; view.s = Math.max(view.s, 0.15); pin = { x: e.x, z: e.z }; $('fullmap-pin-label').textContent = e.ar; $('fullmap-go').disabled = false; results.innerHTML = ''; drawAtlas(); };
      results.appendChild(b);
    }
  });
}

// ---------- HUD readouts ----------
const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
let hudTimer = 0, lastLoc = '';
function updateHud(dt, fps) {
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.2;
  const kmh = Math.round(Math.abs(player.speed) * 3.6);
  $('hud-speed').textContent = toArabicDigits(kmh);
  $('hud-speed-meter').style.width = Math.min(100, kmh / (player.mode === 'heli' ? 340 : player.mode === 'car' ? 190 : 30) * 100) + '%';
  // altitude when flying, the posted speed limit of the road when driving
  let limit = 0;
  if (player.mode === 'car') { const h = osm.nearestRoad(player.pos.x, player.pos.z, 8, (r) => !(osm.flags(r) & F.tunnel)); if (h && h.dist < 1) limit = Math.round(traffic.limit(h.road) * 3.6 / 10) * 10; }
  $('hud-altitude').textContent = toArabicDigits(Math.round(player.mode === 'heli' ? player.alt : limit || 612));
  $('hud-alt-label').textContent = player.mode === 'heli' ? 'الارتفاع' : limit ? 'حد السرعة' : 'فوق سطح البحر';
  $('hud-alt-unit').textContent = player.mode !== 'heli' && limit ? 'كم/س' : 'م';
  $('hud-speed').classList.toggle('over', limit > 0 && kmh > limit + 5);
  const d = G.districtAt(player.pos.x, player.pos.z);
  const r = roadName(player.pos.x, player.pos.z);
  const key = (r ? r.ar : '') + d.en;
  if (d.en !== lastDistrict) {
    // entering a new district while moving: the narrator names it, at most every 15 s
    if (lastDistrict && tour && !tour.active && Math.abs(player.speed) > 2 && performance.now() - lastDistrictT > 15000 && tour.speakFree(tour.districtLine(d), false)) lastDistrictT = performance.now();
    lastDistrict = d.en;
  }
  if (key !== lastLoc) {
    lastLoc = key;
    $('sign-ar').textContent = r ? r.ar : 'حي ' + d.ar;
    $('sign-en').textContent = r ? (r.en || d.en) : d.en;
    $('sign-district').textContent = r ? 'حي ' + d.ar : 'الرياض';
  }
  $('hud-fps').textContent = toArabicDigits(Math.round(fps));
  $('hud-fps').className = fps > 45 ? 'fps-ok' : fps > 28 ? 'fps-mid' : 'fps-low';
  const ll = G.toLatLon(player.pos.x, player.pos.z);
  $('hud-coords').textContent = `${ll.lat.toFixed(4)}°N ${ll.lon.toFixed(4)}°E`;
}

// ---------- main loop ----------
let guide = null, tour = null, tourist = null, lastDistrict = '', lastDistrictT = 0;
const IDLE = { ax: 0, ay: 0, az: 0 };
const clock = new THREE.Clock();
let fpsAvg = 60, slowT = 0, detailR = touch ? 1000 : 1500, farR = touch ? 5000 : 8000;
let lastTs = null, dtSmooth = 1 / 60;
function frame(ts) {
  // frame time from the display's own timestamps, smoothed: phones report noisy gaps, which shake the camera
  const raw = Math.min(0.25, lastTs === null || ts === undefined ? clock.getDelta() : (ts - lastTs) / 1000);
  if (ts !== undefined) lastTs = ts;
  dtSmooth = raw > dtSmooth * 2.5 ? raw : dtSmooth + (raw - dtSmooth) * 0.15;   // real hitches pass through, jitter is averaged out
  // simulate in steps of at most 1/30 s, so distance always matches real time even at low frame rates
  const frameDt = Math.max(1e-4, dtSmooth);
  const subN = Math.max(1, Math.ceil(frameDt / (1 / 30)));
  const dt = frameDt / subN;
  fpsAvg += (1 / Math.max(frameDt, 1e-3) - fpsAvg) * 0.05;
  U.uTime.value += frameDt;
  readKeys();
  for (let k = 0; k < subN; k++) player.update(dt, tour?.active ? IDLE : input, traffic);
  updateCamera(frameDt);
  const scenic = !!tour?.active || !!SCENIC.find((s) => s.id === camId || (camId === 'drone' && SCENIC[directorIdx].id === s.id));
  const focus = scenic ? camera.position : player.pos;
  const nearR = scenic ? detailR * 0.8 : player.mode === 'heli' ? Math.min(2600, detailR + player.alt * 0.5) : detailR;
  world.update({ x: focus.x, z: focus.z }, nearR, farR, 6);
  for (let k = 0; k < subN; k++) traffic.update(dt, focus, player.mode !== 'heli' && !scenic ? player.pos : null);
  peds.update(frameDt, focus.x, focus.z, !scenic || camPos.y < 60);
  guide?.update(frameDt, scenic || document.body.classList.contains('hud-hidden') || !$('fullmap-modal').hidden);
  // shadow camera follows what we are looking at
  const sc = new THREE.Vector3(camLook.x, 0, camLook.z);
  sun.target.position.copy(sc);
  sun.position.copy(sc).addScaledVector(sunDir, 1200);
  const sh = player.mode === 'heli' && !scenic ? Math.min(900, 260 + player.alt) : scenic ? 700 : 260;
  if (sun.shadow.camera.right !== sh) { Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh }); sun.shadow.camera.updateProjectionMatrix(); }
  sky.position.copy(camera.position);
  if (dust.visible) {
    dust.position.set(camera.position.x, Math.max(0, camera.position.y - 40), camera.position.z);
    dust.rotation.y += frameDt * 0.15;
  }
  // headlights in the dark
  player.models.car.userData.spot.intensity = player.mode === 'car' ? Math.max(0, U.uNight.value - 0.4) * 900 : 0;
  {
    const n = Math.max(0, U.uNight.value - 0.3) / 0.7, h = player.mode === 'heli' ? 0 : player.mode === 'car' ? 11 : 6;
    nearGlow.intensity = player.mode === 'heli' ? 0 : n * (player.mode === 'car' ? 85 : 46);   // high above, so the car roof is not blown out
    nearGlow.position.set(player.pos.x - Math.cos(player.yaw) * 3, player.height - (player.mode === 'car' ? 1.3 : 1.6) + h, player.pos.z + Math.sin(player.yaw) * 3);
  }
  if (composer) composer.render(); else renderer.render(scene, camera);
  mmTimer -= frameDt;
  if (mmTimer <= 0 && !document.body.classList.contains('hud-hidden')) { mmTimer = 0.1; drawMinimap(); }
  if (!$('fullmap-modal').hidden) drawAtlas();
  updateHud(frameDt, fpsAvg);
  // adaptive detail
  if (fpsAvg < 26) { slowT += frameDt; if (slowT > 4 && detailR > 800) { detailR -= 200; farR = Math.max(4000, farR - 1000); slowT = 0; } } else slowT = 0;
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; fitFov(); camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});

// ---------- boot ----------
async function boot() {
  try {
    status('تجهيز الأجواء والسماء…', 0.05);
    applyPreset('maghrib');
    await nextFrame();
    status('تحميل خريطة الرياض من OpenStreetMap…', 0.08);
    osm = await new OSM().load('./data/', (f) => status('تحميل خريطة الرياض من OpenStreetMap…', 0.08 + f * 0.3));
    status(`فهرسة ${toArabicDigits(osm.nRoads)} طريق و${toArabicDigits(osm.nBld)} مبنى…`, 0.4);
    await nextFrame();
    world = new World(scene, osm);
    traffic = new Cars(scene, osm, touch ? 110 : 170);
    tour = new Tour({ camera, onEnd: (stop) => {
      // land on a street near where the tour ended
      const t = TELEPORTS.find((q) => q.id === stop.key) || { id: stop.key, at: [stop.lat, stop.lon], small: true };
      teleport(t); setCamera('chase');
    } });
    // the narrator speaks the guide's notes, in the tour's language
    const narrate = (g, arrived) => {
      if (arrived || (tourist && Math.hypot(player.pos.x - tourist.spawn.x, player.pos.z - tourist.spawn.z) > 150)) tourist?.stamp(g.key);   // not for the spot the visitor starts on
      const story = tour.storyFor(g.key) || (tour.lang === 'ar' ? g.desc : g.descEn) || '';
      const name = tour.lang === 'ar' ? g.ar : g.en;
      guide.note((arrived ? ARRIVED[tour.lang] : '') + name, story || g.desc, story ? tour.dir : 'rtl');
      tour.speakFree((arrived ? ARRIVED[tour.lang] : '') + name + '. ' + story, true);
    };
    guide = new Guide({ scene, camera, osm, player, startTour, teleport: (key) => {
      // a key from the guide, or a place from the map with its own coordinates
      const g = typeof key === 'object' ? key : G.PLACES[key], id = typeof key === 'object' ? key.key : key;
      const t = TELEPORTS.find((q) => q.id === id) || { id, at: [g.lat, g.lon], small: true };
      teleport(t);
    } });
    guide.near = narrate;
    tourist = new TouristPanel({ osm, player, guide, tour, openTour: startTour });
    tourist.spawn = player.pos.clone();
    $('btn-tourist').onclick = () => tourist.toggle();
    // a language picker for the narrator at the top of the guide list
    guide.listExtras = (card) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px';
      row.innerHTML = `<span>لغة الراوي</span><select id="narrator-lang" style="height:32px;border-radius:8px;background:#2a231b;color:#fbf6ec;border:1px solid rgba(255,255,255,.2);font:inherit">${LANGS.map((l) => `<option value="${l.id}"${l.id === tour.lang ? ' selected' : ''}>${l.name}</option>`).join('')}</select>`;
      row.querySelector('select').onchange = (e) => tour.setLang(e.target.value);
      card.querySelector('.g-tour').after(row);
    };
    const nb = $('btn-narrator');
    const syncNarrator = () => { nb.setAttribute('aria-pressed', tour.narrator); nb.classList.toggle('muted', !tour.narrator); };
    nb.onclick = () => { tour.setNarrator(!tour.narrator); syncNarrator(); if (tour.narrator) tour.speakFree(tour.lang === 'ar' ? 'الراوي يعمل' : 'Narrator on', true); };
    syncNarrator();
    player.osm = osm;
    status('بناء المعالم: برج المملكة، الفيصلية، المصمك…', 0.45);
    buildLandmarks(scene);
    await nextFrame();
    buildMenus();
    setMode('car');
    teleport(TELEPORTS[0]);
    setCamera('chase');
    updateCamera(1);
    // stream the first rings of the city before showing it
    for (let i = 0; i < 600; i++) {
      const left = world.update(player.pos, detailR, Math.min(farR, 3500), 45);
      status(`بناء الأحياء والشوارع… ${toArabicDigits(world.stats.chunks)} كم²`, 0.5 + 0.45 * Math.min(1, i / Math.max(1, i + left)));
      await nextFrame();
      if (left === 0) break;
    }
    traffic.update(0.016, player.pos, null);
    status('جاهز', 1);
    renderer.compile(scene, camera);
    $('loading-overlay').classList.add('done');
    setTimeout(() => $('loading-overlay').remove(), 700);
    clock.getDelta();
    frame();
  } catch (err) {
    console.error(err);
    const msg = 'تعذّر تشغيل المشهد: ' + err.message;
    if (window.__bootFail) window.__bootFail(msg); else { status(msg); $('loading-overlay').classList.add('error'); }
  }
}
boot();
window.__riyadh = { scene, camera, player, orbitCtl, get guide() { return guide; }, get tour() { return tour; }, get tourist() { return tourist; }, startTour, orbitCtl, get world() { return world; }, get osm() { return osm; }, get traffic() { return traffic; }, applyPreset, setCamera, setMode, teleport: (i) => teleport(TELEPORTS[i]), renderer };
