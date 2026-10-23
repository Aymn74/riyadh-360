// najdi.js — wall textures and a small builder for the Najdi buildings of old Riyadh and Diriyah:
// mud and limestone walls with their triangular vents and merlons, round and square towers, floodlit at night.
import * as THREE from 'three';
import { U } from './materials.js';

// one texture tile is 8 m wide and one 4 m storey high
const TW = 8, TH = 4, PX = 32;
const KINDS = {
  mud: { base: '#c39a6b', roof: '#b58d61', flood: 0.5 },
  fort: { base: '#b98f62', roof: '#a98157', flood: 0.6 },
  stone: { base: '#cdb08a', roof: '#c2a57f', flood: 0.75 },
  red: { base: '#9c4a3a', roof: '#d9cbb4', flood: 0.45 },
  souq: { base: '#c7a173', roof: '#b8956a', flood: 0.3 },
  membrane: { base: '#1d2a33', roof: '#e4e1da', flood: 0.2 },
  museum: { base: '#d2b285', roof: '#d8c5a4', flood: 0.7 }
};

function noisy(x, w, h, base, R) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const l = R() < 0.5;
    x.fillStyle = l ? `rgba(255,240,215,${0.04 + R() * 0.06})` : `rgba(60,35,15,${0.04 + R() * 0.07})`;
    x.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 2);
  }
  // faint rain streaks
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(70,45,25,${0.03 + R() * 0.04})`; x.fillRect(R() * w, 0, 1 + R() * 2, h * (0.3 + R() * 0.7)); }
}
const Y = (m) => TH * PX - m * PX;   // canvas y of a height in metres
function tri(x, cx, y, w, h) { x.beginPath(); x.moveTo((cx - w / 2) * PX, Y(y)); x.lineTo((cx + w / 2) * PX, Y(y)); x.lineTo(cx * PX, Y(y + h)); x.closePath(); x.fill(); }
function rect(x, x0, y0, w, h) { x.fillRect(x0 * PX, Y(y0 + h), w * PX, h * PX); }
function vents(c, e, xs, y, s = 0.34) {
  for (const cx of xs) { c.fillStyle = '#2a1a0f'; tri(c, cx, y, s, s * 1.1); e.fillStyle = 'rgba(255,150,60,0.7)'; tri(e, cx, y, s * 0.7, s * 0.8); }
}

function paint(kind) {
  const w = TW * PX, h = TH * PX;
  const cv = document.createElement('canvas'), ev = document.createElement('canvas');
  cv.width = ev.width = w; cv.height = ev.height = h;
  const c = cv.getContext('2d'), e = ev.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, w, h);
  let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  noisy(c, w, h, KINDS[kind].base, R);
  if (kind === 'mud' || kind === 'fort') {
    c.fillStyle = 'rgba(60,35,15,0.18)'; rect(c, 0, 0, TW, 0.25);          // damp plinth
    if (kind === 'mud') {
      // a small window with a palm-wood shutter, and the trio of triangular vents above
      c.fillStyle = '#dcbb8d'; rect(c, 3.45, 1.05, 1.1, 1.45);
      c.fillStyle = '#3d2716'; rect(c, 3.55, 1.15, 0.9, 1.25);
      c.fillStyle = '#5a3b22'; rect(c, 3.98, 1.15, 0.05, 1.25);
      e.fillStyle = 'rgba(255,170,80,0.5)'; rect(e, 3.6, 1.2, 0.8, 1.15);
      vents(c, e, [1.4, 1.85, 2.3, 5.7, 6.15, 6.6], 3.05);
    } else {
      vents(c, e, [1.8, 2.25, 5.75, 6.2], 2.75, 0.3);
      // ends of the wooden beams that carry the roof
      c.fillStyle = '#5b3c22';
      for (let i = 0.5; i < TW; i += 1.0) rect(c, i, 3.55, 0.14, 0.14);
    }
  } else if (kind === 'stone') {
    // limestone courses, tall slit windows with a pointed head, the vent trio above
    c.fillStyle = 'rgba(90,65,40,0.16)';
    for (let y = 0.6; y < TH; y += 0.6) rect(c, 0, y, TW, 0.04);
    for (let y = 0, k = 0; y < TH; y += 0.6, k++) for (let x = (k % 2) * 0.6; x < TW; x += 1.2) rect(c, x, y, 0.04, 0.6);
    c.fillStyle = '#2b2118'; rect(c, 3.65, 0.9, 0.7, 2.0); tri(c, 4.0, 2.9, 0.7, 0.42);
    e.fillStyle = 'rgba(255,190,110,0.75)'; rect(e, 3.72, 0.95, 0.56, 1.9); tri(e, 4.0, 2.85, 0.56, 0.36);
    vents(c, e, [1.5, 1.95, 2.4, 5.6, 6.05, 6.5], 3.3, 0.3);
    c.fillStyle = 'rgba(255,245,225,0.14)'; rect(c, 0, 3.85, TW, 0.15);
  } else if (kind === 'red') {
    // red plaster, white bands and tall white-framed windows
    c.fillStyle = '#efe6d6'; rect(c, 0, 0, TW, 0.25); rect(c, 0, 3.78, TW, 0.22);
    for (const x0 of [1.35, 5.35]) {
      c.fillStyle = '#efe6d6'; rect(c, x0 - 0.14, 0.86, 1.58, 2.28);
      c.fillStyle = '#26303a'; rect(c, x0, 1.0, 1.3, 2.0);
      c.fillStyle = '#efe6d6'; rect(c, x0 + 0.62, 1.0, 0.06, 2.0); rect(c, x0, 2.3, 1.3, 0.06);
      e.fillStyle = 'rgba(255,200,130,0.65)'; rect(e, x0 + 0.05, 1.05, 1.2, 1.9);
    }
  } else if (kind === 'souq') {
    // two shopfronts full of goods, a sign band, and a strip of mud wall above
    const goods = ['#8c2f2a', '#c6862e', '#3b5e7a', '#6b2f52', '#d8c9a3', '#2f5a3a', '#9a5a2a'];
    for (const x0 of [0.3, 4.3]) {
      c.fillStyle = '#20160e'; rect(c, x0, 0.1, 3.4, 2.6);
      for (let i = 0; i < 14; i++) { c.fillStyle = goods[Math.floor(R() * goods.length)]; rect(c, x0 + 0.1 + R() * 2.9, 0.15 + R() * 1.9, 0.25 + R() * 0.5, 0.3 + R() * 0.6); }
      e.fillStyle = 'rgba(255,200,120,0.9)'; rect(e, x0, 0.1, 3.4, 2.6);
      c.fillStyle = R() < 0.5 ? '#1f5f45' : '#e9e2d2'; rect(c, x0, 2.85, 3.4, 0.5);
      c.fillStyle = 'rgba(30,30,30,0.6)'; for (let i = 0; i < 5; i++) rect(c, x0 + 0.4 + i * 0.55, 3.0, 0.35, 0.18);
      e.fillStyle = 'rgba(160,255,200,0.35)'; rect(e, x0, 2.85, 3.4, 0.5);
    }
    vents(c, e, [1.6, 2.0, 5.6, 6.0], 3.5, 0.26);
  }
  else if (kind === 'membrane') {
    // King Fahd Library: white fabric diamonds on steel cables in front of the dark glass
    const dia = (x, cx, inset) => { x.beginPath(); x.moveTo(cx, inset); x.lineTo(cx + w / 4 - inset, h / 2); x.lineTo(cx, h - inset); x.lineTo(cx - w / 4 + inset, h / 2); x.closePath(); x.fill(); };
    c.fillStyle = '#f4f2ec';
    for (const cx of [0, w / 2, w]) dia(c, cx, 5);
    for (const cx of [w / 4, w * 3 / 4]) { c.save(); c.translate(0, h / 2); dia(c, cx, 5); c.translate(0, -h); dia(c, cx, 5); c.restore(); }
    c.strokeStyle = 'rgba(150,155,160,0.8)'; c.lineWidth = 2;
    for (let y = 16; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    e.fillStyle = 'rgba(255,225,170,0.6)'; e.fillRect(0, 0, w, h);
    e.fillStyle = '#000';
    for (const cx of [0, w / 2, w]) dia(e, cx, 3);
    for (const cx of [w / 4, w * 3 / 4]) { e.save(); e.translate(0, h / 2); dia(e, cx, 3); e.translate(0, -h); dia(e, cx, 3); e.restore(); }
  } else if (kind === 'museum') {
    // smooth sand-coloured limestone in wide courses, a deep shadow joint at every storey
    c.fillStyle = 'rgba(90,65,40,0.12)';
    for (let y = 1.0; y < TH; y += 1.0) rect(c, 0, y, TW, 0.05);
    for (let y = 0, k = 0; y < TH; y += 1.0, k++) for (let x = (k % 2) * 1.0; x < TW; x += 2.0) rect(c, x, y, 0.05, 1.0);
    c.fillStyle = 'rgba(60,40,20,0.22)'; rect(c, 0, 3.9, TW, 0.1);
  }
  const mk = (cnv) => { const t = new THREE.CanvasTexture(cnv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  const map = mk(cv); map.colorSpace = THREE.SRGBColorSpace;
  return { map, emi: mk(ev) };
}

const mats = new Map();
export function najdiMat(kind) {
  if (mats.has(kind)) return mats.get(kind);
  const { map, emi } = paint(kind);
  const k = KINDS[kind];
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffffff, roughness: 0.93 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    // lit windows only after dark, and warm floodlights washing up the walls from the ground
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying float vWY;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance *= smoothstep(0.45, 1.0, uNight) * 1.6;
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.8, 0.55) * ${k.flood.toFixed(2)} * uNight * (0.35 + 0.65 * exp(-vWY / 14.0));`);
  };
  m.customProgramCacheKey = () => 'najdi' + kind;
  mats.set(kind, m);
  return m;
}
const flat = new Map();
export function flatMat(color, flood = 0.3) {
  const key = color + flood;
  if (flat.has(key)) return flat.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.8, 0.55) * ${flood.toFixed(2)} * uNight;`);
  };
  m.customProgramCacheKey = () => 'najdiflat' + flood;
  flat.set(key, m);
  return m;
}

export function inside(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function centroid(ring) { let x = 0, z = 0; for (const p of ring) { x += p[0]; z += p[1]; } return [x / ring.length, z / ring.length]; }
export function rectRing(cx, cz, w, d, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + (a * w / 2) * c + (b * d / 2) * s, cz - (a * w / 2) * s + (b * d / 2) * c]);
}

// Collects textured walls (one material per wall kind) and flat roofs, merlons and trim
export class Najdi {
  constructor() { this.walls = new Map(); this.flats = new Map(); }
  buf(map, key) { if (!map.has(key)) map.set(key, { p: [], n: [], u: [] }); return map.get(key); }
  // a triangle whose front face looks along n
  tri(b, a, c2, c3, n, ua, ub, uc) {
    const ux = c2[0] - a[0], uy = c2[1] - a[1], uz = c2[2] - a[2], vx = c3[0] - a[0], vy = c3[1] - a[1], vz = c3[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    let P = [a, c2, c3], Q = [ua, ub, uc];
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { P = [a, c3, c2]; Q = [ua, uc, ub]; }
    for (let i = 0; i < 3; i++) { b.p.push(...P[i]); b.n.push(...n); if (Q[i]) b.u.push(...Q[i]); }
  }
  quad(b, a0, b0, b1, a1, n, uv) {
    this.tri(b, a0, b0, b1, n, uv && uv[0], uv && uv[1], uv && uv[2]);
    this.tri(b, a0, b1, a1, n, uv && uv[0], uv && uv[2], uv && uv[3]);
  }
  // walls of a closed ring from y0 to y1; the top can shrink towards the centroid (tapered towers)
  prism(ring, y0, y1, kind, { taper = 1, roof = true, roofY, inward = false } = {}) {
    const b = this.buf(this.walls, kind), [cx, cz] = centroid(ring);
    const top = ring.map(([x, z]) => [cx + (x - cx) * taper, cz + (z - cz) * taper]);
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      const [ax, az] = ring[i], [bx, bz] = ring[j], [tax, taz] = top[i], [tbx, tbz] = top[j];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      let nx = (bz - az) / L, nz = -(bx - ax) / L;
      if (inside(ring, (ax + bx) / 2 + nx * 0.05, (az + bz) / 2 + nz * 0.05) !== inward) { nx = -nx; nz = -nz; }
      const tilt = (1 - taper) * Math.hypot((ax + bx) / 2 - cx, (az + bz) / 2 - cz) / (y1 - y0);
      const nl = Math.hypot(1, tilt), n = [nx / nl, tilt / nl, nz / nl];
      const u0 = s / TW, u1 = (s + L) / TW, v0 = y0 / TH, v1 = y1 / TH;
      this.quad(b, [ax, y0, az], [bx, y0, bz], [tbx, y1, tbz], [tax, y1, taz], n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      s += L;
    }
    if (roof) this.cap(top, roofY ?? y1, KINDS[kind].roof);
    return top;
  }
  cap(ring, y, color, holeRings = []) {
    const b = this.buf(this.flats, color);
    const outer = ring.map(([x, z]) => new THREE.Vector2(x, z)), holes = holeRings.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
    let faces = [];
    try { faces = THREE.ShapeUtils.triangulateShape(outer, holes); } catch (e) { /* skip */ }
    const pts = outer.concat(...holes);
    for (const [i, j, k] of faces) this.tri(b, [pts[i].x, y, pts[i].y], [pts[j].x, y, pts[j].y], [pts[k].x, y, pts[k].y], [0, 1, 0]);
  }
  // a flat-coloured box (trim, doors, beams); yaw turns it about its centre
  box(cx, cz, w, d, y0, y1, color, yaw = 0) {
    const r = rectRing(cx, cz, w, d, yaw), b = this.buf(this.flats, color);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % 4];
      const L = Math.hypot(bx - ax, bz - az); let nx = (bz - az) / L, nz = -(bx - ax) / L;
      if (inside(r, (ax + bx) / 2 + nx * 0.01, (az + bz) / 2 + nz * 0.01)) { nx = -nx; nz = -nz; }
      this.quad(b, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [nx, 0, nz]);
    }
    this.cap(r, y1, color);
  }
  // a textured beam between two points: bridges and walls along a line
  slab(ax, az, bx, bz, width, y0, y1, kind) {
    const L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(-(bz - az), bx - ax);
    const r = rectRing((ax + bx) / 2, (az + bz) / 2, L, width, yaw);
    this.prism(r, y0, y1, kind);
    return r;
  }
  // a round tower, slightly tapered
  drum(cx, cz, r0, r1, y0, y1, kind, seg = 18) {
    const ring = [];
    for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; ring.push([cx + Math.cos(a) * r0, cz + Math.sin(a) * r0]); }
    return this.prism(ring, y0, y1, kind, { taper: r1 / r0 });
  }
  // Najdi merlons: triangular teeth along the parapet of a ring, with taller horns at its corners
  merlons(ring, y, color, { step = 1.7, w = 0.95, h = 1.25, t = 0.5, horns = true, closed = true } = {}) {
    const b = this.buf(this.flats, color);
    const tooth = (x, z, dx, dz, ww, hh) => {
      const px = -dz, pz = dx;                    // across the wall
      const A = [x - dx * ww / 2, z - dz * ww / 2], B = [x + dx * ww / 2, z + dz * ww / 2];
      for (const sd of [1, -1]) {
        const ox = px * t / 2 * sd, oz = pz * t / 2 * sd;
        this.tri(b, [A[0] + ox, y, A[1] + oz], [B[0] + ox, y, B[1] + oz], [x + ox, y + hh, z + oz], [px * sd, 0, pz * sd]);
      }
      // the two sloping faces
      for (const [P, sgn] of [[A, -1], [B, 1]]) {
        const n = [dx * sgn * hh, ww / 2, dz * sgn * hh], l = Math.hypot(...n);
        this.quad(b, [P[0] + px * t / 2, y, P[1] + pz * t / 2], [P[0] - px * t / 2, y, P[1] - pz * t / 2], [x - px * t / 2, y + hh, z - pz * t / 2], [x + px * t / 2, y + hh, z + pz * t / 2], n.map((v) => v / l));
      }
    };
    for (let i = 0; i < ring.length - (closed ? 0 : 1); i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      const n = Math.max(1, Math.floor(L / step));
      for (let k = 0; k < n; k++) { const f = (k + 0.5) / n; tooth(ax + dx * L * f, az + dz * L * f, dx, dz, w, h); }
      if (horns) tooth(ax, az, dx, dz, w * 0.9, h * 1.9);
    }
  }
  // inset copy of a ring (for courtyards and parapets)
  static inset(ring, d) {
    const [cx, cz] = centroid(ring);
    return ring.map(([x, z]) => { const l = Math.hypot(x - cx, z - cz) || 1; return [x - (x - cx) / l * d, z - (z - cz) / l * d]; });
  }
  build() {
    const g = new THREE.Group();
    const add = (b, mat) => {
      if (!b.p.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      if (b.u.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    for (const [k, b] of this.walls) add(b, najdiMat(k));
    for (const [c, b] of this.flats) add(b, flatMat(c));
    return g;
  }
}
