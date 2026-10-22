// landmarks.js — hand-built icons of the Riyadh skyline and old town.
import * as THREE from 'three';
import { PLACES, TH, rng } from './geo.js';
import { ST, U, makeBuildingMaterial, nightGlow } from './materials.js';
import { Sink, boxGeo, capGeo, domeGeo, palm, domeMat, capMat } from './city.js';
import { palmTrunkMat, palmCrownMat } from './materials.js';

const matCache = new Map();
function bmat(color) {
  if (!matCache.has(color)) { const m = makeBuildingMaterial({ always: true }); m.color.set(color); matCache.set(color, m); }
  return matCache.get(color);
}
function styled(geo, style, seed = 0.5) {
  const n = geo.attributes.position.count;
  geo.setAttribute('aStyle', new THREE.BufferAttribute(new Float32Array(n).fill(style), 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(seed), 1));
  return geo;
}
function mesh(geo, style, color, seed) {
  const m = new THREE.Mesh(styled(geo, style, seed), bmat(color));
  m.castShadow = m.receiveShadow = true;
  return m;
}
function site(key, yaw = TH) {
  const p = PLACES[key];
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.rotation.y = yaw;
  g.name = key;
  return g;
}
function sinkMeshes(sink, parent, mat) {
  const add = (m) => { if (m) { m.castShadow = m.receiveShadow = true; parent.add(m); } };
  add(sink.boxes.mesh(boxGeo, mat));
  add(sink.domes.mesh(domeGeo, domeMat, false));
  add(sink.caps.mesh(capGeo, capMat, false));
  add(sink.palms.mesh(palm.trunk, palmTrunkMat, false));
  add(sink.palms.mesh(palm.crown, palmCrownMat, false));
}
// Sink whose coordinates are local metres (x along the site's u, z along its v)
function localSink() { return new Sink('detail'); }

// ---------- Kingdom Centre (302 m) — the "bottle opener" with the Sky Bridge ----------
function kingdomCentre() {
  const g = site('kingdom');
  // front elevation: a softly tapering slab whose top third opens into a parabolic arch
  const H = 302, holeBase = 182;
  const xo = (y) => 44 - 9 * (y / H) ** 2;
  const xi = (y) => 31 * Math.pow(Math.max(0, (y - holeBase) / (H - holeBase)), 0.62);
  const sh = new THREE.Shape();
  const N = 40;
  sh.moveTo(-xo(0), 0);
  sh.lineTo(xo(0), 0);
  for (let i = 1; i <= N; i++) { const y = (i / N) * H; sh.lineTo(xo(y), y); }
  for (let i = N; i >= 0; i--) { const y = holeBase + (i / N) * (H - holeBase); sh.lineTo(xi(y), y); }
  for (let i = 1; i <= N; i++) { const y = holeBase + (i / N) * (H - holeBase); sh.lineTo(-xi(y), y); }
  for (let i = N; i >= 1; i--) { const y = (i / N) * H; sh.lineTo(-xo(y), y); }
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 40, bevelEnabled: false, curveSegments: 4 });
  geo.translate(0, 0, -20);
  // the plan tapers towards the top
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); pa.setZ(i, pa.getZ(i) * (1 - 0.62 * (y / H) ** 1.3)); }
  geo.computeVertexNormals();
  const tower = mesh(geo, ST.glass, '#a9b6c0', 0.31);
  g.add(tower);
  // Sky Bridge
  const yb = 292;
  const bw = 2 * xi(292) + 4;
  const bridge = mesh(new THREE.BoxGeometry(bw, 5, 8), ST.glass, '#c9d2d8', 0.9);
  bridge.position.y = yb;
  g.add(bridge);
  // LED outline of the arch (lit at night, colour-cycling)
  const pts = [];
  for (let i = 0; i <= 60; i++) { const t = i / 60; const y = holeBase + (H - holeBase) * (1 - Math.abs(1 - 2 * t)) ** 1; const x = (t < 0.5 ? -1 : 1) * xi(y); pts.push(new THREE.Vector3(x, y, 0)); }
  const arch = new THREE.Mesh(styled(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.9, 6), ST.led, 0.1), bmat('#ffffff'));
  for (const z of [-6.4, 6.4]) { const a = arch.clone(); a.position.z = z; g.add(a); }
  const bridgeLed = new THREE.Mesh(styled(new THREE.BoxGeometry(bw + 1, 0.8, 8.6), ST.led, 0.6), bmat('#ffffff'));
  bridgeLed.position.y = yb - 2.4;
  g.add(bridgeLed);
  // Kingdom Mall podium
  const pod = mesh(new THREE.BoxGeometry(210, 26, 110).translate(0, 13, 0), ST.shop, '#c9c2b4', 0.7);
  g.add(pod);
  const pod2 = mesh(new THREE.BoxGeometry(150, 6, 80).translate(0, 29, 0), ST.glass, '#8fa3ad', 0.2);
  g.add(pod2);
  return g;
}

// ---------- Al Faisaliah Tower (267 m) — pyramid frame with the golden globe ----------
function faisaliah() {
  const g = site('faisaliah');
  const core = mesh(new THREE.CylinderGeometry(2.5, 31, 238, 4, 24).rotateY(Math.PI / 4).translate(0, 119, 0), ST.glass, '#b89b69', 0.55);
  g.add(core);
  // four edge members, lighter concrete, standing slightly proud of the glass
  const beamGeo = new THREE.BoxGeometry(3.6, 1, 3.6).translate(0, 0.5, 0);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const base = new THREE.Vector3(sx * 24.5, 0, sz * 24.5), top = new THREE.Vector3(0, 246, 0);
    const len = base.distanceTo(top);
    const b = mesh(beamGeo.clone(), ST.plain, '#d9d2c4');
    b.position.copy(base);
    b.scale.y = len;
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(base).normalize());
    g.add(b);
  }
  const globe = new THREE.Mesh(new THREE.SphereGeometry(12.5, 32, 20), nightGlow('#d8a845', 0.15, 2.2, { metalness: 0.9, roughness: 0.18 }));
  globe.position.y = 200;
  globe.castShadow = true;
  g.add(globe);
  const spire = mesh(new THREE.CylinderGeometry(0.4, 1.6, 52, 8).translate(0, 26, 0), ST.plain, '#d0d0d0');
  spire.position.y = 214;
  g.add(spire);
  const beacon = new THREE.Mesh(styled(new THREE.SphereGeometry(1.2, 8, 6), ST.lamp), bmat('#ff4040'));
  beacon.position.y = 267;
  g.add(beacon);
  // hotel and office wings around the base
  g.add(mesh(new THREE.BoxGeometry(46, 34, 26).translate(-70, 17, 30), ST.stone, '#d3c6ac', 0.3));
  g.add(mesh(new THREE.BoxGeometry(30, 24, 70).translate(70, 12, -10), ST.glass, '#9b8a66', 0.8));
  g.add(mesh(new THREE.BoxGeometry(150, 0.4, 150).translate(0, 0.2, 0), ST.slab, '#d8cdb9'));
  return g;
}

// ---------- KAFD: PIF Tower (385 m) and its neighbours ----------
function kafd() {
  const g = site('kafd');
  const R = rng(1977);
  // PIF Tower: faceted shaft tapering into an open crown
  const pif = mesh(new THREE.CylinderGeometry(21, 33, 352, 8, 1).rotateY(Math.PI / 8).translate(0, 176, 0), ST.glass, '#7d98ad', 0.42);
  g.add(pif);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = mesh(new THREE.BoxGeometry(2.2, 34, 9).translate(0, 17, 0), ST.plain, '#c9d3da');
    fin.position.set(Math.cos(a) * 18, 352, Math.sin(a) * 18);
    fin.rotation.y = -a;
    g.add(fin);
  }
  const crownLed = new THREE.Mesh(styled(new THREE.CylinderGeometry(21.6, 21.6, 1.2, 8, 1, true).rotateY(Math.PI / 8), ST.led, 0.8), bmat('#ffffff'));
  crownLed.position.y = 350;
  g.add(crownLed);
  const sink = localSink();
  for (let i = 0; i < 24; i++) { const a = R() * Math.PI * 2, r = 50 + R() * 40; sinkPalmLocal(sink, Math.cos(a) * r, Math.sin(a) * r, 9 + R() * 4, R); }
  sinkMeshes(sink, g, bmat('#ffffff'));
  return g;
}
function sinkPalmLocal(sink, x, z, h, R) {
  const yaw = R() * Math.PI * 2, s = h * (0.9 + R() * 0.2);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  sink.palms.m.push(c * s, 0, -sn * s, 0, 0, h, 0, 0, sn * s, 0, c * s, 0, x, 0.2, z, 1);
  sink.palms.c.push(0.9, 0.95, 0.8); sink.palms.st.push(0); sink.palms.sd.push(0);
}

// ---------- Burj Rafal (308 m) ----------
function rafal() {
  const g = site('rafal');
  const sh = new THREE.Shape();
  sh.moveTo(-20, 0); sh.lineTo(20, 0); sh.lineTo(20, 262); sh.quadraticCurveTo(8, 292, -20, 308); sh.lineTo(-20, 0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 34, bevelEnabled: true, bevelSize: 1.5, bevelThickness: 2, bevelSegments: 2 }).translate(0, 0, -17);
  g.add(mesh(geo, ST.glass, '#7f97a8', 0.66));
  g.add(mesh(new THREE.BoxGeometry(90, 18, 60).translate(0, 9, 0), ST.stone, '#d6c9ae', 0.1));
  return g;
}

// ---------- Masmak Fortress (1865) ----------
function masmak() {
  const g = site('masmak', TH + 0.05);
  const mud = '#b98d5f';
  const W = 56, D = 50, Hw = 11;
  const walls = [[0, -D / 2, W, 3], [0, D / 2, W, 3], [-W / 2, 0, 3, D], [W / 2, 0, 3, D]];
  for (const [x, z, sx, sz] of walls) g.add(mesh(new THREE.BoxGeometry(sx, Hw, sz).translate(x, Hw / 2, z), ST.mud, mud, 0.2));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const t = mesh(new THREE.CylinderGeometry(4.4, 5.6, 18, 18).translate(0, 9, 0), ST.mud, mud, 0.5);
    t.position.set(sx * W / 2, 0, sz * D / 2);
    g.add(t);
    const rim = mesh(new THREE.CylinderGeometry(4.9, 4.6, 1.2, 18).translate(0, 18.4, 0), ST.plain, '#a97d52');
    rim.position.copy(t.position);
    g.add(rim);
  }
  // the square watchtower (al-Mirabba'a) and the inner buildings
  g.add(mesh(new THREE.BoxGeometry(9, 22, 9).translate(-12, 11, 6), ST.mud, mud, 0.8));
  g.add(mesh(new THREE.BoxGeometry(20, 8, 16).translate(10, 4, -6), ST.mud, '#c09a6e', 0.3));
  // the palm-trunk gate
  g.add(mesh(new THREE.BoxGeometry(5, 7, 1).translate(0, 3.5, -D / 2 - 1.4), ST.plain, '#5b3c22'));
  // triangular Najdi merlons along the parapets
  const sink = localSink();
  const mc = new THREE.Color('#a97d52');
  for (let x = -W / 2 + 3; x < W / 2 - 2; x += 2.4) for (const z of [-D / 2, D / 2]) sink.caps.boxW(x, z, 1.3, 1.3, Hw, 1.6, 0, mc, 0);
  for (let z = -D / 2 + 3; z < D / 2 - 2; z += 2.4) for (const x of [-W / 2, W / 2]) sink.caps.boxW(x, z, 1.3, 1.3, Hw, 1.6, 0, mc, 0);
  // Dirah square: paving and palms
  sink.boxes.boxW(0, -70, 180, 60, 0, 0.3, 0, new THREE.Color('#d6c6a6'), ST.slab);
  const R = rng(1902);
  for (let x = -80; x <= 80; x += 16) { sinkPalmLocal(sink, x, -50, 8 + R() * 3, R); sinkPalmLocal(sink, x, -92, 8 + R() * 3, R); }
  sinkMeshes(sink, g, bmat('#ffffff'));
  return g;
}

// ---------- National Museum & Murabba Palace ----------
function museum() {
  const g = site('museum');
  const sh = new THREE.Shape();
  sh.absarc(0, 0, 120, Math.PI * 0.15, Math.PI * 0.85, false);
  sh.absarc(0, 0, 92, Math.PI * 0.85, Math.PI * 0.15, true);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 20, bevelEnabled: false, curveSegments: 32 }).rotateX(-Math.PI / 2).translate(0, 0, 60);
  g.add(mesh(geo, ST.stone, '#cdb48d', 0.2));
  g.add(mesh(new THREE.BoxGeometry(70, 12, 60).translate(150, 6, 40), ST.mud, '#bf9666', 0.5));
  for (const [x, z] of [[115, 10], [185, 10], [115, 70], [185, 70]]) g.add(mesh(new THREE.CylinderGeometry(3.4, 4.2, 15, 12).translate(x, 7.5, z), ST.mud, '#bf9666', 0.5));
  g.add(mesh(new THREE.BoxGeometry(360, 0.3, 160).translate(0, 0.15, -40), ST.slab, '#7a8f45'));
  const sink = localSink();
  const R = rng(77);
  for (let i = 0; i < 70; i++) sinkPalmLocal(sink, -170 + R() * 340, -110 + R() * 140, 8 + R() * 5, R);
  sinkMeshes(sink, g, bmat('#ffffff'));
  return g;
}

// ---------- Water Tower, TV Tower, Ministry of Interior, National Library ----------
function waterTower() {
  const g = site('water');
  g.add(mesh(new THREE.CylinderGeometry(3.2, 4.6, 46, 16).translate(0, 23, 0), ST.plain, '#f1f1ee'));
  g.add(mesh(new THREE.ConeGeometry(17, 20, 24).rotateX(Math.PI).translate(0, 56, 0), ST.plain, '#f4f4f2'));
  const ring = new THREE.Mesh(styled(new THREE.CylinderGeometry(17.2, 17.2, 2.2, 24, 1, true), ST.sign), bmat('#2f7fc1'));
  ring.position.y = 64.2;
  g.add(ring);
  g.add(mesh(new THREE.CylinderGeometry(17, 17, 4, 24).translate(0, 67.5, 0), ST.plain, '#e9e9e6'));
  g.add(mesh(new THREE.CylinderGeometry(1.2, 2, 14, 8).translate(0, 76, 0), ST.plain, '#d0d0d0'));
  g.scale.set(0.85, 61 / 83, 0.85);   // 61 m to the top of the mast
  return g;
}
function tvTower() {
  const g = site('tv');
  g.add(mesh(new THREE.CylinderGeometry(4.2, 8, 150, 16).translate(0, 75, 0), ST.plain, '#cfc8bb'));
  g.add(mesh(new THREE.CylinderGeometry(14, 10, 12, 20).translate(0, 128, 0), ST.glass, '#7c8f99', 0.9));
  g.add(mesh(new THREE.CylinderGeometry(15, 15, 2, 20).translate(0, 135, 0), ST.plain, '#d9d4c9'));
  g.add(mesh(new THREE.CylinderGeometry(0.6, 1.6, 34, 8).translate(0, 153, 0), ST.plain, '#c8c8c8'));   // antenna tip at 170 m
  const b = new THREE.Mesh(styled(new THREE.SphereGeometry(1, 8, 6), ST.lamp), bmat('#ff3030'));
  b.position.y = 170;
  g.add(b);
  return g;
}
function moi() {
  const g = site('moi');
  g.add(mesh(new THREE.CylinderGeometry(18, 22, 18, 4).rotateY(Math.PI / 4).translate(0, 9, 0), ST.stone, '#cbbfa3', 0.4));
  g.add(mesh(new THREE.CylinderGeometry(66, 30, 40, 4).rotateY(Math.PI / 4).translate(0, 38, 0), ST.stone, '#d4c7aa', 0.6));
  g.add(mesh(new THREE.CylinderGeometry(56, 66, 6, 4).rotateY(Math.PI / 4).translate(0, 61, 0), ST.glass, '#8a8572', 0.2));
  g.add(mesh(new THREE.BoxGeometry(300, 0.3, 300).translate(0, 0.15, 0), ST.slab, '#d4c9b3'));
  return g;
}
function library() {
  const g = site('library');
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#7a8a8f'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#f5f3ee'; x.lineWidth = 22;
  for (let i = -256; i < 512; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 256, 256); x.stroke(); x.beginPath(); x.moveTo(i, 256); x.lineTo(i + 256, 0); x.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1.4);
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.BoxGeometry(118, 30, 118).translate(0, 15, 0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  g.add(mesh(new THREE.CylinderGeometry(26, 26, 8, 32).translate(0, 34, 0), ST.plain, '#efeee9'));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 38, 0), new THREE.MeshStandardMaterial({ color: '#e9eef0', roughness: 0.3, metalness: 0.3 })));
  return g;
}

// ---------- At-Turaif, Diriyah (UNESCO) on its spur above Wadi Hanifa ----------
function turaif() {
  const g = site('turaif', TH - 0.3);
  const R = rng(1744);
  const plateau = new THREE.Mesh(styled(new THREE.CylinderGeometry(330, 380, 9, 40), ST.slab), bmat('#d6b98f'));
  plateau.position.y = 4.5;
  plateau.receiveShadow = true;
  g.add(plateau);
  const sink = localSink();
  const mudPal = ['#b48a5c', '#a77c50', '#c29b6c', '#9e744a'].map((c) => new THREE.Color(c));
  for (let i = 0; i < 260; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 290;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const sx = 8 + R() * 18, sz = 8 + R() * 18, h = 4 + Math.floor(R() * 3) * 3 + R() * 2;
    const c = mudPal[Math.floor(R() * mudPal.length)];
    const yaw = Math.floor(R() * 4) * 0.08;
    sink.boxes.boxW(x, z, sx, sz, 9, h, yaw, c, ST.mud, R());
    sink.boxes.boxW(x, z, sx + 0.3, sz + 0.3, 9 + h, 0.6, yaw, c.clone().multiplyScalar(0.92), ST.plain);
    for (const [mx, mz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) sink.caps.boxW(x + mx * (sx / 2 - 0.5), z + mz * (sz / 2 - 0.5), 1, 1, 9.6 + h, 1.5, yaw, c, 0);
    if (R() < 0.08) sink.boxes.boxW(x + sx / 2, z, 4, 4, 9, h + 7, yaw, c, ST.mud, R()); // watchtower
  }
  // Salwa Palace
  sink.boxes.boxW(0, 0, 90, 70, 9, 15, 0, new THREE.Color('#b9905f'), ST.mud, 0.4);
  for (const [x, z] of [[-45, -35], [45, -35], [-45, 35], [45, 35]]) sink.boxes.boxW(x, z, 7, 7, 9, 22, 0, new THREE.Color('#ae8455'), ST.mud, 0.6);
  for (let i = 0; i < 200; i++) { const a = R() * Math.PI * 2, r = 360 + R() * 260; sinkPalmLocal(sink, Math.cos(a) * r, Math.sin(a) * r, 8 + R() * 6, R); }
  sinkMeshes(sink, g, bmat('#ffffff'));
  return g;
}

// ---------- Wadi Hanifa palm groves along the valley ----------
import { WADI } from './geo.js';
function wadiGroves() {
  const g = new THREE.Group();
  const sink = localSink();
  const R = rng(5);
  // valley floor ribbon
  const pos = [], idx = [];
  for (let i = 0; i < WADI.length; i++) {
    const a = WADI[Math.max(0, i - 1)], b = WADI[Math.min(WADI.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    const nx = -dz / l, nz = dx / l, w = 230;
    pos.push(WADI[i].x + nx * w, 0.06, WADI[i].z + nz * w, WADI[i].x - nx * w, 0.06, WADI[i].z - nz * w);
    if (i < WADI.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const bed = new THREE.Mesh(styled(geo, ST.slab), bmat('#6f6b3e'));
  bed.receiveShadow = true;
  g.add(bed);
  // a thin stream down the middle
  const sp = [], si = [];
  for (let i = 0; i < WADI.length; i++) {
    const a = WADI[Math.max(0, i - 1)], b = WADI[Math.min(WADI.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    const nx = -dz / l, nz = dx / l, w = 9;
    sp.push(WADI[i].x + nx * w, 0.1, WADI[i].z + nz * w, WADI[i].x - nx * w, 0.1, WADI[i].z - nz * w);
    if (i < WADI.length - 1) { const k = i * 2; si.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setIndex(si);
  sg.computeVertexNormals();
  g.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: '#3d6b73', roughness: 0.1, metalness: 0.6 })));
  for (let i = 0; i < WADI.length - 1; i++) {
    const a = WADI[i], b = WADI[i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.floor(l / 9);
    for (let k = 0; k < n; k++) {
      const t = R();
      const nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
      const off = (R() * 2 - 1) * 210;
      if (Math.abs(off) < 14) continue;
      sinkPalmLocal(sink, a.x + (b.x - a.x) * t + nx * off, a.z + (b.z - a.z) * t + nz * off, 8 + R() * 7, R);
    }
  }
  sinkMeshes(sink, g, bmat('#ffffff'));
  return g;
}

// ---------- Tuwaiq escarpment on the western horizon ----------
function tuwaiq() {
  const pts = [];
  const R = rng(9);
  const geo = new THREE.PlaneGeometry(60000, 900, 200, 4);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i);
    const t = (y + 450) / 900;
    const h = t * (120 + 60 * Math.sin(x * 0.0007) + 30 * Math.sin(x * 0.0031 + 1.3));
    pa.setXYZ(i, x, h, -y);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#b08a5f', roughness: 1 }));
  m.rotation.y = Math.PI / 2 - 0.25;
  m.position.set(-24000, 0, 0);
  return m;
}

export function buildLandmarks(scene) {
  // the National Museum, King Fahd Library and the KAFD towers come from OpenStreetMap footprints
  const list = [kingdomCentre(), faisaliah(), kafd(), rafal(), masmak(), waterTower(), tvTower(), moi(), turaif(), wadiGroves(), tuwaiq()];
  for (const o of list) scene.add(o);
  return list;
}
// Colliders for walking/driving (world circles)
export const LANDMARK_COLLIDERS = [
  ['kingdom', 62, 302], ['faisaliah', 34, 267], ['rafal', 30, 308], ['masmak', 36, 18], ['water', 8, 61], ['tv', 9, 170], ['moi', 30, 64], ['kafd', 30, 385]
].map(([k, r, h]) => ({ x: PLACES[k].x, z: PLACES[k].z, r, h }));
