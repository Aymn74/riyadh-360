// player.js — the three ways to get around: on foot (thobe & shemagh), a white Land Cruiser, a helicopter.
import * as THREE from 'three';
import { TH } from './geo.js';
import { F } from './osm.js';
import { LANDMARK_COLLIDERS } from './landmarks.js';

function shemaghTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f1ec'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#c0242b';
  for (let i = 0; i < 64; i += 8) for (let j = 0; j < 64; j += 8) if (((i + j) / 8) % 2 === 0) x.fillRect(i + 1, j + 1, 5, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

function buildPerson() {
  const g = new THREE.Group();
  const thobe = new THREE.MeshStandardMaterial({ color: '#f6f5f1', roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: '#b98a66', roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.38, 14).translate(0, 0.69, 0), thobe);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.2, 0.25, 14).translate(0, 1.5, 0), thobe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12).translate(0, 1.72, 0), skin);
  const ghutra = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 16, 1, true).translate(0, 1.66, -0.02), new THREE.MeshStandardMaterial({ map: shemaghTexture(), side: THREE.DoubleSide, roughness: 0.8 }));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.76, 0), ghutra.material);
  const agal = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.022, 6, 18).rotateX(Math.PI / 2).translate(0, 1.82, 0), new THREE.MeshStandardMaterial({ color: '#101010' }));
  const armGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.62, 8).translate(0, -0.31, 0);
  const armL = new THREE.Mesh(armGeo, thobe), armR = new THREE.Mesh(armGeo, thobe);
  armL.position.set(0, 1.55, 0.25); armR.position.set(0, 1.55, -0.25);
  g.add(body, chest, head, ghutra, cap, agal, armL, armR);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { armL, armR, body };
  return g;
}

// a white Land Cruiser LC300 (4.95 x 1.98 x 1.93 m), nose towards +x.
// The body is lofted from rounded cross-sections, so it has real curvature, tumblehome and wheel arches.
const lerpT = (tab, x) => {
  if (x <= tab[0][0]) return tab[0].slice(1);
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) {
    const [x0, ...a] = tab[i - 1], [x1, ...b] = tab[i], t = (x - x0) / (x1 - x0), u = t * t * (3 - 2 * t);
    return a.map((v, k) => v + (b[k] - v) * u);
  }
  return tab[tab.length - 1].slice(1);
};
// a closed loft through sections of equal point count; colour per vertex; flat end caps
function loft(xs, section, colorAt) {
  const pos = [], col = [], idx = [];
  let n = 0;
  for (const x of xs) { const ring = section(x); n = ring.length; for (const [z, y] of ring) { pos.push(x, y, z); const c = colorAt(x, y, z); col.push(c.r, c.g, c.b); } }
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = a + n, d = b + n;
    idx.push(a, c, b, b, c, d);
  }
  for (const [i, flip] of [[0, true], [xs.length - 1, false]]) {
    let cy = 0, cz = 0; for (let j = 0; j < n; j++) { cz += pos[(i * n + j) * 3 + 2]; cy += pos[(i * n + j) * 3 + 1]; }
    const ci = pos.length / 3; pos.push(xs[i], cy / n, cz / n); col.push(col[i * n * 3], col[i * n * 3 + 1], col[i * n * 3 + 2]);
    for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + (j + 1) % n; if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// rounded box section: half widths at bottom and top (tumblehome), corner radii, extra points to pin colour bands
function roundSection(y0, y1, hwB, hwT, rB, rT, bands = []) {
  const pts = [];
  const arc = (cz, cy, r, a0, a1, k) => { for (let i = 0; i <= k; i++) { const a = a0 + (a1 - a0) * (i / k); pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  rB = Math.min(rB, (y1 - y0) * 0.45); rT = Math.min(rT, (y1 - y0) * 0.45);
  // band points are always emitted (clamped) so every section has the same point count
  const side = (s) => { const lo = y0 + rB + 0.002, hi = y1 - rT - 0.002; const ys = bands.map((b, i) => Math.min(hi - (bands.length - i) * 0.001, Math.max(lo + i * 0.001, b))); return s > 0 ? ys : ys.slice().reverse(); };
  arc(hwB - rB, y0 + rB, rB, -Math.PI / 2, 0, 3);                                   // bottom right
  for (const y of side(1)) pts.push([hwB + (hwT - hwB) * (y - y0) / (y1 - y0), y]);
  arc(hwT - rT, y1 - rT, rT, 0, Math.PI / 2, 5);                                     // top right
  arc(-hwT + rT, y1 - rT, rT, Math.PI / 2, Math.PI, 5);                              // top left
  for (const y of side(-1)) pts.push([-(hwB + (hwT - hwB) * (y - y0) / (y1 - y0)), y]);
  arc(-hwB + rB, y0 + rB, rB, Math.PI, Math.PI * 1.5, 3);                            // bottom left
  return pts;
}
export function buildCar() {
  const g = new THREE.Group();
  const WHITE = new THREE.Color('#f2f2ef'), CLAD = new THREE.Color('#2a2b2d'), GLASS = new THREE.Color('#0d1419'), PILLAR = new THREE.Color('#121315');
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.12, envMapIntensity: 1.3 });
  const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.35, envMapIntensity: 1.8 });
  const trim = new THREE.MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#e2e5e8', roughness: 0.12, metalness: 1.0 });
  const head = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e0', emissiveIntensity: 1.4, roughness: 0.15 });
  const tail = new THREE.MeshStandardMaterial({ color: '#6a0808', emissive: '#ff2414', emissiveIntensity: 0.8, roughness: 0.25 });
  const WX = [1.47, -1.43], AR = 0.5;
  // lower body: [x, sill, top, half width bottom, half width top, top radius]
  const BODY = [[-2.48, 0.56, 1.18, 0.88, 0.84, 0.10], [-2.44, 0.44, 1.27, 0.97, 0.93, 0.13], [-2.25, 0.42, 1.30, 0.99, 0.95, 0.14], [0.9, 0.42, 1.29, 0.99, 0.95, 0.14],
    [1.6, 0.42, 1.24, 0.99, 0.94, 0.15], [2.15, 0.43, 1.17, 0.97, 0.92, 0.16], [2.38, 0.46, 1.08, 0.93, 0.88, 0.15], [2.48, 0.58, 0.99, 0.84, 0.8, 0.12]];
  const archAt = (x) => { let y = 0; for (const wx of WX) { const d = Math.abs(x - wx); if (d < AR) y = Math.max(y, Math.sqrt(AR * AR - d * d) + 0.4 - 0.42); } return y; };
  const xs = []; for (let x = -2.48; x <= 2.4801; x += 0.04) xs.push(+x.toFixed(3));
  const body = loft(xs, (x) => {
    const [y0, y1, hb, ht, rT] = lerpT(BODY, x);
    return roundSection(Math.max(y0, 0.42 + archAt(x) * 0.999), y1, hb, ht, 0.06, rT, [0.62, 0.66]);
  }, (x, y) => (y < 0.64 || Math.abs(x) > 2.4 && y < 0.72 ? CLAD : WHITE));
  // glasshouse: [x, belt, roof, half width at belt, half width at roof]; roof skin and D pillars stay white
  const GH = [[-2.42, 1.26, 1.62, 0.92, 0.80], [-2.36, 1.26, 1.83, 0.93, 0.80], [-2.2, 1.27, 1.89, 0.93, 0.81], [0.05, 1.27, 1.9, 0.93, 0.81],
    [0.4, 1.27, 1.77, 0.93, 0.80], [0.8, 1.27, 1.52, 0.93, 0.84], [1.08, 1.26, 1.3, 0.93, 0.9]];
  const ghx = []; for (let x = -2.42; x <= 1.0801; x += 0.035) ghx.push(+x.toFixed(3));
  const gh = loft(ghx, (x) => { const [yb, yr, hb, hr] = lerpT(GH, x); return roundSection(yb, yr, hb, hr, 0.02, 0.09, [1.3, 1.34]); },
    (x, y, z) => {
      const yr = lerpT(GH, x)[1];
      if (y > yr - 0.07 && Math.abs(z) < 0.74) return WHITE;                 // roof skin
      if (y < 1.31) return PILLAR;                                            // window surround
      if (x < -1.98 && x > -2.34 && Math.abs(z) > 0.6) return WHITE;          // D pillar
      if (Math.abs(x + 0.35) < 0.06 || Math.abs(x + 1.42) < 0.06) return PILLAR;   // B and C pillars
      return GLASS;
    });
  const bm = new THREE.Mesh(body, bodyMat), gm = new THREE.Mesh(gh, glassMat);
  bm.castShadow = gm.castShadow = true;
  g.add(bm, gm);
  // dark underbody seen through the arches
  const under = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 1.4), trim); under.position.set(0, 0.62, 0); g.add(under);
  // wheels: tyre with rounded shoulders, six-spoke alloy
  const tyreGeo = new THREE.LatheGeometry([[0.25, -0.14], [0.37, -0.14], [0.405, -0.11], [0.415, 0], [0.405, 0.11], [0.37, 0.14], [0.25, 0.14]].map(([r, y]) => new THREE.Vector2(r, y)), 28).rotateX(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.92 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#c4c8cc', roughness: 0.28, metalness: 0.9 });
  const rimDisk = new THREE.CylinderGeometry(0.26, 0.26, 0.2, 24).rotateX(Math.PI / 2);
  const spoke = new THREE.BoxGeometry(0.42, 0.06, 0.04);
  const wheels = [];
  for (const x of WX) for (const z of [-0.84, 0.84]) {
    const w = new THREE.Group(), spin = new THREE.Group();
    const t = new THREE.Mesh(tyreGeo, tyreMat); t.castShadow = true;
    spin.add(t, new THREE.Mesh(rimDisk, new THREE.MeshStandardMaterial({ color: '#2a2c2f', roughness: 0.5, metalness: 0.6 })));
    for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(spoke, rimMat); sp.rotation.z = k * Math.PI / 6 * 2 / 2; sp.position.z = Math.sign(z) * 0.11; spin.add(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12).rotateX(Math.PI / 2), chrome); hub.position.z = Math.sign(z) * 0.125; spin.add(hub);
    w.add(spin); w.position.set(x, 0.415, z); g.add(w); wheels.push({ w, spin });
    // black arch flare
    const flare = new THREE.Mesh(new THREE.TorusGeometry(AR + 0.02, 0.045, 6, 20, Math.PI), trim);
    flare.position.set(x, 0.4, Math.sign(z) * 0.975); g.add(flare);
  }
  g.userData.wheels = wheels;
  // face: big grille with chrome surround and bars, slim headlamps, bumper
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 1.08), trim); grille.position.set(2.47, 0.8, 0); g.add(grille);
  for (const y of [0.64, 0.98]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 1.12), chrome); b.position.set(2.49, y, 0); g.add(b); }
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 1.04), chrome); b.position.set(2.495, 0.7 + k * 0.075, 0); g.add(b); }
  const fb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 1.7), trim); fb.position.set(2.45, 0.52, 0); g.add(fb);
  const rb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 1.75), trim); rb.position.set(-2.46, 0.54, 0); g.add(rb);
  for (const z of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.36), head); h.position.set(2.42, 1.03, z * 0.7); h.rotation.y = z * 0.25; g.add(h);
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.3), head); drl.position.set(2.44, 0.96, z * 0.68); g.add(drl);
    const fog = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), head); fog.position.set(2.5, 0.54, z * 0.72); g.add(fog);
    // tail lamps wrap the rear corners
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.2), tail); t1.position.set(-2.45, 1.08, z * 0.8); g.add(t1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), tail); t2.position.set(-2.35, 1.18, z * 0.965); g.add(t2);
    // mirrors on stalks
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), new THREE.MeshStandardMaterial({ color: '#f2f2ef', roughness: 0.3 })); mir.position.set(0.9, 1.38, z * 1.1); g.add(mir);
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.16), trim); stalk.position.set(0.95, 1.32, z * 0.98); g.add(stalk);
    // door handles, side step, roof rail
    for (const x of [0.15, -1.0]) { const dh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.03), chrome); dh.position.set(x, 1.12, z * 0.985); g.add(dh); }
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.05, 0.16), trim); step.position.set(-0.03, 0.36, z * 0.93); g.add(step);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.05, 0.05), trim); rail.position.set(-1.0, 1.93, z * 0.7); g.add(rail);
  }
  // tailgate glass, leaning in towards the roof, and a small roof spoiler above it
  const rg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.44, 1.46), glassMat.clone()); rg.material.vertexColors = false; rg.material.color.copy(GLASS);
  rg.position.set(-2.405, 1.58, 0); rg.rotation.z = -0.26; g.add(rg);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 1.5), bodyMat.clone()); spoiler.material.vertexColors = false; spoiler.material.color.copy(WHITE);
  spoiler.position.set(-2.36, 1.86, 0); spoiler.rotation.z = 0.12; g.add(spoiler);
  // chrome strip and "LAND CRUISER" bar on the tailgate
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 1.1), chrome); strip.position.set(-2.475, 1.16, 0); g.add(strip);
  // rear plate: Saudi format, KSA / السعودية
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 96);
  x.strokeStyle = '#111'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 92);
  x.fillStyle = '#111'; x.font = '700 30px sans-serif'; x.textAlign = 'center';
  x.fillText('٧٤٢٠  ر ي ض', 100, 40); x.fillText('7420  R Y D', 100, 82);
  x.fillStyle = '#0a7a3a'; x.fillRect(206, 4, 46, 88);
  x.fillStyle = '#fff'; x.font = '700 16px sans-serif'; x.fillText('KSA', 229, 82);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.2), new THREE.MeshBasicMaterial({ map: tex }));
  plate.position.set(-2.53, 0.8, 0); plate.rotation.y = -Math.PI / 2;
  g.add(plate);
  // headlight cones at night
  const spot = new THREE.SpotLight('#fff3dc', 0, 140, 0.62, 0.45, 1.1);
  spot.position.set(2.4, 1.0, 0);
  spot.target.position.set(24, -0.5, 0);
  g.add(spot, spot.target);
  g.userData.spot = spot;
  g.userData.lights = { head, tail };
  return g;
}

function buildHeli() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: '#1f6b44', roughness: 0.35, metalness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.4, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: '#16222b', roughness: 0.05, metalness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16).scale(2.6, 1.25, 1.2), paint);
  body.position.y = 1.9;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(1.4, 1.0, 1.05), glass);
  nose.position.set(1.4, 2.0, 0);
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.01, 24, 4, 0, Math.PI * 2, 1.45, 0.25).scale(2.6, 1.25, 1.2), white);
  stripe.position.y = 1.9;
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, 6, 10).rotateZ(Math.PI / 2), paint);
  boom.position.set(-4.6, 2.3, 0);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.12), paint);
  fin.position.set(-7.4, 3.0, 0);
  const rotor = new THREE.Group();
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.32), dark); b.rotation.y = (k * Math.PI) / 4 * 2 / 2 * 1; b.rotation.y = k * Math.PI / 4 * 2; rotor.add(b); }
  rotor.position.y = 3.45;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), dark);
  mast.position.y = 3.2;
  const tail = new THREE.Group();
  for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.16), dark); b.rotation.x = k * Math.PI / 2; tail.add(b); }
  tail.position.set(-7.5, 3.1, 0.18);
  const skidGeo = new THREE.CylinderGeometry(0.07, 0.07, 4.4, 8).rotateZ(Math.PI / 2);
  for (const z of [-0.95, 0.95]) {
    const s = new THREE.Mesh(skidGeo, dark); s.position.set(0, 0.12, z); g.add(s);
    for (const x of [-0.9, 0.9]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), dark); l.position.set(x, 0.5, z * 0.9); g.add(l); }
  }
  g.add(body, nose, stripe, boom, fin, rotor, mast, tail);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { rotor, tail };
  return g;
}

const MODES = {
  person: { ar: 'مشي', label: 'سيرًا على الأقدام' },
  car: { ar: 'قيادة', label: 'لاندكروزر أبيض' },
  heli: { ar: 'طيران', label: 'هليكوبتر' }
};

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.models = { person: buildPerson(), car: buildCar(), heli: buildHeli() };
    for (const m of Object.values(this.models)) { m.visible = false; scene.add(m); }
    this.pos = new THREE.Vector3();
    this.yaw = TH + Math.PI / 2; // facing NNW along King Fahd Rd
    this.speed = 0;
    this.vy = 0;
    this.alt = 0;
    this.steer = 0;
    this.walkPhase = 0;
    this.mode = 'car';
    this.gy = 0;
    this.osm = null;
    this.setMode('car');
  }
  get modeInfo() { return MODES[this.mode]; }
  setMode(mode) {
    const prevAlt = this.alt;
    this.mode = mode;
    for (const [k, m] of Object.entries(this.models)) m.visible = k === mode;
    this.speed = 0; this.vy = 0;
    if (mode === 'heli') this.alt = Math.max(prevAlt, 120);
    else this.alt = 0;
    if (mode !== 'heli') this.unstick();
  }
  teleport(x, z, yaw) {
    this.pos.set(x, 0, z);
    if (yaw !== undefined) this.yaw = yaw;
    this.speed = 0;
    this.gy = 0;
    if (this.mode === 'heli') this.alt = 160;
    this.unstick();
  }
  canStand(x, z) {
    for (const c of LANDMARK_COLLIDERS) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return false;
    if (!this.osm) return true;
    // on a bridge deck nothing below matters; below grade only the roadway itself is open
    if (this.gy > 2) return true;
    if (this.gy < -1.2) { const h = this.osm.nearestRoad(x, z, 4, (r) => { const p = this.osm.profile(r); return p && p.H < 0; }); return !!(h && h.dist < -0.3); }
    return !this.osm.insideBuilding(x, z, this.mode === 'car' ? 1.2 : 0.3);
  }
  // top of whatever stands at a point (mapped buildings, generated houses, landmarks)
  roofAt(x, z) {
    let h = 0;
    for (const c of LANDMARK_COLLIDERS) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) h = Math.max(h, c.h || 0);
    if (this.osm) h = Math.max(h, this.osm.roofAt(x, z));
    return h;
  }
  // follow bridge decks when already near their height, otherwise stay on the ground
  groundAt(x, z) {
    if (!this.osm) return 0;
    const osm = this.osm;
    const hit = osm.nearestRoad(x, z, 3, (r) => osm.profile(r));
    if (hit && hit.dist < 0.5) {
      const y = osm.roadY(hit.road, hit.along) + 0.12;
      if (Math.abs(y - this.gy) < 2.5) return y;
    }
    return 0;
  }
  // after a teleport/mode change, walk outwards in a spiral until the spot is free
  unstick() {
    if (this.mode === 'heli' || this.canStand(this.pos.x, this.pos.z)) return;
    for (let r = 4; r < 400; r += 4) for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      if (this.canStand(x, z)) { this.pos.x = x; this.pos.z = z; return; }
    }
  }
  update(dt, input, traffic) {
    const fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0) + (input.ay || 0) + (input.pedal || 0);
    const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0) + (input.ax || 0);
    const boost = input.boost;
    const p = this.pos;
    if (this.mode === 'person') {
      const target = fwd * (boost ? 4.2 : 1.4);   // 15 km/h jog, 5 km/h walk
      this.speed += (target - this.speed) * Math.min(1, dt * 8);
      this.yaw += turn * dt * 2.6;
      if (input.jump && this.alt <= 0.001) this.vy = 2.97;   // about 0.45 m
      this.vy -= 9.8 * dt; this.alt = Math.max(0, this.alt + this.vy * dt);
      if (this.alt === 0) this.vy = Math.max(0, this.vy);
      this.walkPhase += Math.abs(this.speed) * dt * 4.2;
      this.move(dt);
      const m = this.models.person;
      const sw = Math.sin(this.walkPhase) * Math.min(1, Math.abs(this.speed) / 3);
      m.userData.armL.rotation.z = sw * 0.5; m.userData.armR.rotation.z = -sw * 0.5;
      this.gy = this.groundAt(p.x, p.z);
      m.position.set(p.x, this.gy + this.alt + Math.abs(Math.sin(this.walkPhase)) * 0.04 * Math.min(1, Math.abs(this.speed)), p.z);
      m.rotation.set(0, this.yaw, 0);
    } else if (this.mode === 'car') {
      // exploration driving: smooth throttle, speed-sensitive steering, gentle lane keeping, no crashes
      const maxV = boost ? 44.4 : 33.3;   // 160 / 120 km/h
      const v0 = Math.abs(this.speed);
      let acc;
      // throttle: about 10 s from 0 to 100 km/h, tapering towards top speed
      if (fwd > 0.05) acc = (this.speed < -0.3 ? 9 : 3.6 * (1 - Math.max(0, this.speed) / (maxV * 1.05)) + 0.4) * fwd;
      // brakes: ~9 m/s2, so 100 km/h stops in about 40 m; once stopped, the same pedal backs up
      else if (fwd < -0.05) acc = this.speed > 0.5 ? 9 * fwd : 4 * fwd;
      // coasting: rolling resistance plus air drag (100 km/h rolls on for about half a minute)
      else acc = -Math.sign(this.speed) * Math.min(v0 / Math.max(dt, 1e-3), 0.25 + 0.0007 * v0 * v0);
      // the touch brake pedal only stops the car (backing up is the reverse gear's job)
      if (input.hold) acc = -Math.sign(this.speed) * Math.min(v0 / Math.max(dt, 1e-3), 9);
      this.speed = THREE.MathUtils.clamp(this.speed + acc * dt, -8, Math.max(maxV, this.speed));
      if (this.speed > maxV) this.speed += (maxV - this.speed) * Math.min(1, dt * 0.8);
      this.lastAcc = acc;
      // the steering wheel: a touch wheel sets it directly; keys turn it at a steady rate (full lock in about
      // a quarter of a second) and it springs back to centre faster than it goes out
      const want = THREE.MathUtils.clamp(turn, -1, 1);
      const out = Math.abs(want) > Math.abs(this.steer) && want * this.steer >= 0;
      const rate = input.analog ? 14 : out ? 4.5 : 7;
      this.steer += THREE.MathUtils.clamp(want - this.steer, -rate * dt, rate * dt);
      const v = Math.abs(this.speed);
      // bicycle model: 2.85 m wheelbase and 35° at the front wheels on full lock (a 4 m turning radius, tight
      // enough for a U-turn in a street), and never more yaw than about 1.25 g of grip allows, so a motorway
      // exit can be taken at 70 km/h
      const delta = this.steer * 0.62;
      let yawRate = (v * Math.tan(delta)) / 2.85;
      const grip = 12.3 / Math.max(v, 0.5);
      yawRate = THREE.MathUtils.clamp(yawRate, -grip, grip);
      this.yaw += yawRate * dt * Math.sign(this.speed || 1);
      this.steerIdle = Math.abs(turn) < 0.05 ? (this.steerIdle || 0) + dt : 0;
      // lane keeping only after a second hands-off, so it never pulls the car away from an exit being taken
      if (this.steerIdle > 1 && v > 6 && this.osm && this.gy < 2) this.laneKeep(dt);
      this.move(dt);
      const m = this.models.car;
      this.gy += (this.groundAt(p.x, p.z) - this.gy) * Math.min(1, dt * 10);
      // body roll and pitch for weight
      this.pitch = (this.pitch || 0) + ((acc * 0.003) - (this.pitch || 0)) * Math.min(1, dt * 4);
      m.position.set(p.x, this.gy, p.z);
      m.rotation.set(0, this.yaw, 0);
      m.rotateZ(THREE.MathUtils.clamp(this.pitch, -0.03, 0.03));
      m.rotateX(-this.steer * Math.min(1, v / 25) * 0.035);
      m.userData.lights.tail.emissiveIntensity = acc < -1 && this.speed > 0.5 ? 2.6 : 0.8;   // brake lights
      this.wheelRot = ((this.wheelRot || 0) - this.speed * dt / 0.4) % (Math.PI * 2);
      for (const [i, { w, spin }] of m.userData.wheels.entries()) { w.rotation.y = i < 2 ? delta : 0; spin.rotation.z = this.wheelRot; }
    } else {
      const maxV = boost ? 70 : 50;   // 250 / 180 km/h
      const target = fwd * maxV;
      this.speed += (target - this.speed) * Math.min(1, dt * 0.9);
      this.yaw += turn * dt * 1.1;
      const climb = (input.jump ? 1 : 0) - (input.descend ? 1 : 0) + (input.az || 0);
      this.vy += (climb * (boost ? 12 : 8) - this.vy) * Math.min(1, dt * 2.5);
      const nx = p.x + Math.cos(this.yaw) * this.speed * dt, nz = p.z - Math.sin(this.yaw) * this.speed * dt;
      const floorHere = this.roofAt(p.x, p.z) + 3, floorNext = this.roofAt(nx, nz) + 3;
      if (this.alt < floorNext - 1.5) { this.speed *= 0.2; }   // a wall ahead: stop instead of flying through it
      else { p.x = nx; p.z = nz; }
      this.alt = THREE.MathUtils.clamp(this.alt + this.vy * dt, Math.max(2, Math.min(floorHere, floorNext)), 1400);
      const m = this.models.heli;
      m.position.set(p.x, this.alt, p.z);
      m.rotation.set(-turn * 0.18 * Math.min(1, this.speed / 30), this.yaw, -this.speed / maxV * 0.16 * (fwd ? 1 : 0.3), 'YXZ');
      m.userData.rotor.rotation.y += dt * 38;
      m.userData.tail.rotation.z += dt * 60;
    }
  }
  move(dt) {
    const p = this.pos;
    const dx = Math.cos(this.yaw) * this.speed * dt, dz = -Math.sin(this.yaw) * this.speed * dt;
    if (this.canStand(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; return; }
    // glide along walls instead of bouncing off them
    if (this.canStand(p.x + dx, p.z)) { p.x += dx; this.speed *= 1 - Math.min(1, dt * 1.5); return; }
    if (this.canStand(p.x, p.z + dz)) { p.z += dz; this.speed *= 1 - Math.min(1, dt * 1.5); return; }
    this.speed *= 1 - Math.min(1, dt * 6);
  }
  // when the driver is not steering, ease the heading onto the road direction (within 17 degrees)
  laneKeep(dt) {
    const hit = this.osm.nearestRoad(this.pos.x, this.pos.z, 4);
    if (!hit || hit.dist > 0) return;
    let ry = Math.atan2(-hit.dirz, hit.dirx);
    let d = Math.atan2(Math.sin(ry - this.yaw), Math.cos(ry - this.yaw));
    if (Math.abs(d) > Math.PI / 2) { ry += Math.PI; d = Math.atan2(Math.sin(ry - this.yaw), Math.cos(ry - this.yaw)); }
    if (Math.abs(d) < 0.3) this.yaw += d * Math.min(1, dt * 0.9);
  }
  get height() { return this.mode === 'heli' ? this.alt : this.gy + (this.mode === 'car' ? 1.3 : 1.6 + this.alt); }
}
