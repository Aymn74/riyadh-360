// city.js — streams the city in chunks: detailed blocks near the player, a coarse silhouette to the horizon.
import * as THREE from 'three';
import { TH, toWorld, toGrid, blocksIn, rng, hash2, ROADS_U, ROADS_V, EXT, inMask } from './geo.js';
import { ST, U, makeBuildingMaterial, palmGeometries, palmTrunkMat, palmCrownMat, poolMat, poolGeo } from './materials.js';

const C = Math.cos(TH), S = Math.sin(TH);
const DETAIL = 800, COARSE = 2000;

export const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
export const domeGeo = new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
export const capGeo = new THREE.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
export const palm = palmGeometries();
export const matDetail = makeBuildingMaterial({ coarse: false });
const matCoarse = makeBuildingMaterial({ coarse: true });
export const domeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1 });
export const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });

const col = (hex) => new THREE.Color(hex);
const PAL = {
  villa: ['#efe7d8', '#e8dcc4', '#ddcaa8', '#cfb690', '#f4f0e8', '#cbb99d', '#e3d3b6', '#c4a77f', '#d8d2c6'].map(col),
  apt: ['#d9c7a6', '#c9b28c', '#e0d4bf', '#bfa883', '#d0c3ae', '#b99c76', '#e8e0d0'].map(col),
  shop: ['#d6cab4', '#c8b79a', '#e3dccd', '#b7a789', '#cfc0a4'].map(col),
  glass: ['#5e8c95', '#4f6f8f', '#8a7a62', '#9aa4ab', '#5f7d6a', '#6d7f8c', '#45607a'].map(col),
  stone: ['#d8ccb4', '#c4b294', '#e2d9c6', '#b8a587', '#cdbfa6'].map(col),
  mud: ['#b08458', '#a47950', '#c09a6e', '#9c7048', '#b88f63'].map(col),
  dome: ['#f2efe8', '#e9e4d6', '#7fa38a', '#c9b48a', '#9fb3c2'].map(col)
};
const SLAB = { paving: col('#cbbfa8'), park: col('#6c8a3a'), sand: col('#c9a97a'), plaza: col('#d8cdb9'), farm: col('#5f6a32'), old: col('#b9a07c') };
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ---------- instance sink ----------
export class Batch {
  constructor() { this.m = []; this.c = []; this.st = []; this.sd = []; }
  // axis-aligned in grid: centre (u,v), sizes du (along u), dv (along v), base y0, height h
  box(u, v, du, dv, y0, h, color, style, seed = 0) {
    const w = toWorld(u, v);
    this.m.push(C * du, 0, -S * du, 0, 0, h, 0, 0, S * dv, 0, C * dv, 0, w.x, y0, w.z, 1);
    this.c.push(color.r, color.g, color.b);
    this.st.push(style); this.sd.push(seed);
  }
  // free orientation (yaw around y), world centre
  boxW(x, z, sx, sz, y0, h, yaw, color, style, seed = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    this.m.push(c * sx, 0, -s * sx, 0, 0, h, 0, 0, s * sz, 0, c * sz, 0, x, y0, z, 1);
    this.c.push(color.r, color.g, color.b);
    this.st.push(style); this.sd.push(seed);
  }
  get count() { return this.st.length; }
  mesh(geo, mat, withStyle = true) {
    if (!this.count) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, this.count);
    mesh.instanceMatrix.array.set(this.m);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.c), 3);
    if (withStyle) {
      geo = geo.clone();
      geo.userData.owned = true;
      geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(this.st), 1));
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(this.sd), 1));
      mesh.geometry = geo;
    }
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox?.();
    return mesh;
  }
}
export class Sink {
  constructor(lod) { this.lod = lod; this.boxes = new Batch(); this.domes = new Batch(); this.caps = new Batch(); this.palms = new Batch(); this.lights = new Batch(); }
  light(u, v, r, col) { const w = toWorld(u, v); this.lights.boxW(w.x, w.z, r * 2, r * 2, 0.27, 1, 0, col, 0); }
  palm(u, v, h, r) {
    const w = toWorld(u, v);
    const yaw = r() * Math.PI * 2, s = h * (0.9 + r() * 0.2);
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    this.palms.m.push(c * s, 0, -sn * s, 0, 0, h, 0, 0, sn * s, 0, c * s, 0, w.x, 0.2, w.z, 1);
    const g = 0.75 + r() * 0.4;
    this.palms.c.push(g, g * (0.95 + r() * 0.1), g * 0.85);
    this.palms.st.push(0); this.palms.sd.push(0);
  }
}

// ---------- street lighting ----------
const ART_LIGHT = new THREE.Color(1.0, 0.9, 0.74).multiplyScalar(0.17);
const LOCAL_LIGHT = new THREE.Color(1.0, 0.7, 0.4).multiplyScalar(0.26);
const POLE_C = new THREE.Color('#6d7176'), LAMP_C = new THREE.Color('#fff1cf');
// lamps stand on the u0 and v0 kerbs of each block, so every local street is lit from one side
function streetLamps(sink, r, kind) {
  const old = kind === 'old';
  const step = old ? 16 : 22, H = old ? 4.2 : 7.5;
  const lampAt = (u, v, du, dv) => {
    if (!old) {
      sink.boxes.box(u, v, 0.18, 0.18, 0.22, H, POLE_C, ST.plain);
      sink.boxes.box(u + du * 0.8, v + dv * 0.8, du ? 1.6 : 0.14, dv ? 1.6 : 0.14, 0.22 + H, 0.12, POLE_C, ST.plain);
    }
    sink.boxes.box(u + du * 1.5, v + dv * 1.5, 0.55, 0.55, 0.22 + H - 0.22, 0.2, LAMP_C, ST.lamp);
    sink.light(u + du * 3.2, v + dv * 3.2, old ? 7 : 11, LOCAL_LIGHT);
  };
  for (let a = r.u0 + 9; a < r.u1 - 4; a += step) lampAt(a, r.v0 + 0.9, 0, -1);
  for (let b = r.v0 + 9; b < r.v1 - 4; b += step) lampAt(r.u0 + 0.9, b, -1, 0);
}

// ---------- block generators ----------
function slab(sink, r, color, h = 0.22) {
  sink.boxes.box((r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, r.u1 - r.u0, r.v1 - r.v0, 0, h, color, ST.slab);
}
const inset = (r, d) => ({ u0: r.u0 + d, u1: r.u1 - d, v0: r.v0 + d, v1: r.v1 - d });

function villas(sink, r, R, seed) {
  const du = r.u1 - r.u0, dv = r.v1 - r.v0;
  // plots in two rows along the long side
  const longU = du >= dv;
  const L = longU ? du : dv, D = longU ? dv : du;
  const rows = D > 34 ? 2 : 1;
  const n = Math.max(1, Math.round(L / (20 + R() * 6)));
  const pw = L / n, pd = D / rows;
  for (let row = 0; row < rows; row++) for (let k = 0; k < n; k++) {
    const a = (longU ? r.u0 : r.v0) + (k + 0.5) * pw;
    const b = (longU ? r.v0 : r.u0) + (row + 0.5) * pd;
    const pu = longU ? a : b, pv = longU ? b : a;
    const su = (longU ? pw : pd) - 0.6, sv = (longU ? pd : pw) - 0.6;
    const c = pick(R, PAL.villa);
    const wallC = c.clone().multiplyScalar(0.94);
    if (R() < 0.08) { // an empty plot inside the neighbourhood
      sink.boxes.box(pu, pv, su, sv, 0.22, 0.05, SLAB.sand, ST.slab);
      continue;
    }
    sink.boxes.box(pu, pv, su, sv, 0.22, 3.0, wallC, ST.wall);
    // house sits towards the back of the plot (away from the street)
    const back = row === 0 ? -1 : 1;
    const hu = su * (0.62 + R() * 0.15), hv = sv * (0.6 + R() * 0.14);
    const ou = longU ? (R() - 0.5) * (su - hu) * 0.5 : back * (su - hu) * 0.35;
    const ov = longU ? back * (sv - hv) * 0.35 : (R() - 0.5) * (sv - hv) * 0.5;
    const floors = R() < 0.18 ? 3 : 2;
    const h = floors * 3.7 + 0.7 + R() * 0.5;
    const sd = R();
    sink.boxes.box(pu + ou, pv + ov, hu, hv, 0.22, h, c, ST.villa, sd);
    // parapet band and the stair house on the roof
    sink.boxes.box(pu + ou, pv + ov, hu + 0.3, hv + 0.3, 0.22 + h - 0.6, 0.6, c.clone().multiplyScalar(0.9), ST.plain);
    if (R() < 0.85) sink.boxes.box(pu + ou + hu * 0.22, pv + ov - hv * 0.2, Math.min(5, hu * 0.35), Math.min(4.5, hv * 0.3), 0.22 + h, 2.9, c, ST.plain);
    if (R() < 0.5) sink.boxes.box(pu + ou - hu * 0.3, pv + ov + hv * 0.28, 1.4, 1.4, 0.22 + h, 1.2, col('#f5f5f2'), ST.plain);
    if (R() < 0.45) sink.palm(pu - ou * 1.6, pv - ov * 1.6, 7 + R() * 5, R);
  }
}

function apartments(sink, r, R, seed, low = false) {
  const du = r.u1 - r.u0, dv = r.v1 - r.v0;
  const longU = du >= dv;
  const n = Math.max(1, Math.round((longU ? du : dv) / (24 + R() * 14)));
  const step = (longU ? du : dv) / n;
  for (let k = 0; k < n; k++) {
    const a = (longU ? r.u0 : r.v0) + (k + 0.5) * step;
    const su = longU ? step - 3 : du - 2, sv = longU ? dv - 2 : step - 3;
    const pu = longU ? a : (r.u0 + r.u1) / 2, pv = longU ? (r.v0 + r.v1) / 2 : a;
    const floors = low ? 2 + Math.floor(R() * 2) : 3 + Math.floor(R() * 3);
    const h = floors * 3.2 + 0.8;
    const c = pick(R, PAL.apt);
    sink.boxes.box(pu, pv, su, sv, 0.22, h, c, ST.apt, R());
    sink.boxes.box(pu, pv, su + 0.3, sv + 0.3, 0.22 + h - 0.6, 0.6, c.clone().multiplyScalar(0.88), ST.plain);
    sink.boxes.box(pu + su * 0.25, pv, Math.min(6, su * 0.3), Math.min(5, sv * 0.3), 0.22 + h, 3, c, ST.plain);
    for (let t = 0; t < 3; t++) if (R() < 0.7) sink.boxes.box(pu - su * 0.3 + t * 2.2, pv + sv * 0.3, 1.5, 1.5, 0.22 + h, 1.3, col('#f4f4f0'), ST.plain);
  }
}

function shops(sink, r, R, front) {
  // a row of two/three-storey shops facing the arterial, apartments behind
  const depth = Math.min(20, (front.axis === 'u' ? r.u1 - r.u0 : r.v1 - r.v0) * 0.5);
  let strip, rest;
  if (front.axis === 'u') {
    strip = front.side < 0 ? { ...r, u1: r.u0 + depth } : { ...r, u0: r.u1 - depth };
    rest = front.side < 0 ? { ...r, u0: r.u0 + depth + 4 } : { ...r, u1: r.u1 - depth - 4 };
  } else {
    strip = front.side < 0 ? { ...r, v1: r.v0 + depth } : { ...r, v0: r.v1 - depth };
    rest = front.side < 0 ? { ...r, v0: r.v0 + depth + 4 } : { ...r, v1: r.v1 - depth - 4 };
  }
  const along = front.axis === 'u' ? 'v' : 'u';
  const L = along === 'u' ? strip.u1 - strip.u0 : strip.v1 - strip.v0;
  let x = 0;
  while (x < L - 6) {
    const w = Math.min(L - x, 14 + R() * 22);
    const floors = 2 + Math.floor(R() * 2);
    const h = floors * 4.0 + 0.6;
    const c = pick(R, PAL.shop);
    const mid = x + w / 2;
    if (along === 'u') sink.boxes.box(strip.u0 + mid, (strip.v0 + strip.v1) / 2, w - 0.8, strip.v1 - strip.v0, 0.22, h, c, ST.shop, R());
    else sink.boxes.box((strip.u0 + strip.u1) / 2, strip.v0 + mid, strip.u1 - strip.u0, w - 0.8, 0.22, h, c, ST.shop, R());
    x += w;
  }
  if ((rest.u1 - rest.u0) > 12 && (rest.v1 - rest.v0) > 12) {
    if (R() < 0.5) apartments(sink, rest, R, 0, true); else villas(sink, rest, R, 0);
  }
}

function towers(sink, r, R, zone) {
  const du = r.u1 - r.u0, dv = r.v1 - r.v0;
  const cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
  // podium
  const podH = 8 + Math.floor(R() * 3) * 4;
  const stoneC = pick(R, PAL.stone);
  sink.boxes.box(cu, cv, du * 0.86, dv * 0.82, 0.22, podH, stoneC, ST.stone, R());
  const n = du > 80 && R() < 0.6 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const tu = n === 1 ? cu + (R() - 0.5) * du * 0.2 : r.u0 + du * (k === 0 ? 0.27 : 0.73);
    const tv = cv + (R() - 0.5) * dv * 0.2;
    const fu = Math.min(du / n * 0.62, 22 + R() * 22), fv = Math.min(dv * 0.66, 22 + R() * 22);
    let h;
    if (zone === 'kafd') h = 90 + Math.pow(R(), 1.4) * 210;
    else if (zone === 'cbd') h = 35 + Math.pow(R(), 2.2) * 150;
    else h = 24 + Math.pow(R(), 1.6) * 60;
    const glass = R() < (zone === 'suburb' ? 0.45 : 0.68);
    const c = glass ? pick(R, PAL.glass) : pick(R, PAL.stone);
    const style = glass ? ST.glass : ST.stone;
    const sd = R();
    if (h > 90 && R() < 0.55) {
      // setback tower: shaft + narrower top
      const h1 = h * (0.62 + R() * 0.15);
      sink.boxes.box(tu, tv, fu, fv, 0.22, h1, c, style, sd);
      sink.boxes.box(tu, tv, fu * 0.72, fv * 0.72, 0.22 + h1, h - h1, c, style, sd);
      sink.boxes.box(tu, tv, fu * 0.5, fv * 0.5, 0.22 + h, 4 + R() * 10, c.clone().multiplyScalar(0.8), ST.plain);
    } else {
      sink.boxes.box(tu, tv, fu, fv, 0.22, h, c, style, sd);
      sink.boxes.box(tu, tv, fu * 0.6, fv * 0.6, 0.22 + h, 3.5, c.clone().multiplyScalar(0.75), ST.plain);
    }
    if (h > 120 && R() < 0.5) sink.boxes.box(tu, tv, fu + 0.4, fv + 0.4, 0.22 + h - 6, 1.4, col('#ffffff'), ST.led, R());
    if (h > 60 && R() < 0.4) sink.boxes.box(tu, tv, 0.6, 0.6, 0.22 + h + 3, 10 + R() * 16, col('#c8c8c8'), ST.plain);
  }
}

function oldTown(sink, r, R) {
  const du = r.u1 - r.u0, dv = r.v1 - r.v0;
  const nu = Math.max(1, Math.round(du / (11 + R() * 6))), nv = Math.max(1, Math.round(dv / (11 + R() * 6)));
  for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) {
    if (R() < 0.08) continue;
    const su = du / nu, sv = dv / nv;
    const pu = r.u0 + (a + 0.5) * su, pv = r.v0 + (b + 0.5) * sv;
    const h = 4 + Math.floor(R() * 3) * 3.1 + R();
    const c = R() < 0.75 ? pick(R, PAL.mud) : pick(R, PAL.apt);
    sink.boxes.box(pu, pv, su - 0.5, sv - 0.5, 0.22, h, c, ST.mud, R());
    // Najdi parapet with corner merlons
    sink.boxes.box(pu, pv, su - 0.2, sv - 0.2, 0.22 + h, 0.7, c.clone().multiplyScalar(0.92), ST.plain);
    if (R() < 0.6) for (const [mu, mv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      sink.caps.box(pu + mu * (su / 2 - 0.6), pv + mv * (sv / 2 - 0.6), 1.0, 1.0, 0.92 + h, 1.4, c, 0);
  }
}

function mosque(sink, r, R, small = false) {
  const du = r.u1 - r.u0, dv = r.v1 - r.v0;
  const cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
  const s = Math.min(du, dv) * (small ? 0.8 : 0.62);
  const h = small ? 6 : 8 + R() * 2;
  const c = R() < 0.6 ? col('#f1ede3') : pick(R, PAL.stone);
  sink.boxes.box(cu, cv, s, s, 0.22, h, c, ST.mosque, R());
  sink.boxes.box(cu, cv, s + 0.4, s + 0.4, 0.22 + h - 0.5, 0.5, c.clone().multiplyScalar(0.9), ST.plain);
  const dr = s * (0.26 + R() * 0.08);
  sink.boxes.box(cu, cv, dr * 1.7, dr * 1.7, 0.22 + h, 2.2, c, ST.plain);
  sink.domes.box(cu, cv, dr, dr, 0.22 + h + 2.2, dr * (0.9 + R() * 0.4), pick(R, PAL.dome), 0);
  // minaret on the qibla-side corner
  const mh = (small ? 16 : 24) + R() * 14;
  const mu = cu + s / 2 + 1.6, mv = cv - s / 2 + 1.6;
  sink.boxes.box(mu, mv, 3.4, 3.4, 0.22, mh, c, ST.plain);
  sink.boxes.box(mu, mv, 4.4, 4.4, 0.22 + mh * 0.7, 0.8, c.clone().multiplyScalar(0.92), ST.plain);
  sink.boxes.box(mu, mv, 3.6, 3.6, 0.22 + mh - 1.0, 0.7, col('#88ffaa'), ST.green);
  sink.caps.box(mu, mv, 3.2, 3.2, 0.22 + mh, 4.5, c, 0);
}

function parkFill(sink, r, R, density = 1, farm = false) {
  const du = r.u1 - r.u0, dv = r.v1 - r.v0;
  const sp = farm ? 9 : 14;
  for (let a = r.u0 + 5; a < r.u1 - 4; a += sp) for (let b = r.v0 + 5; b < r.v1 - 4; b += sp)
    if (R() < 0.75 * density) sink.palm(a + (R() - 0.5) * 3, b + (R() - 0.5) * 3, farm ? 8 + R() * 6 : 6 + R() * 7, R);
}

function genBlock(sink, sb, ku, kv, r, info) {
  const R = rng(info.seed);
  const coarse = sink.lod === 'coarse';
  const k = info.kind;
  if (k === 'desert') {
    if (inMask(toWorld(info.cu, info.cv).x, toWorld(info.cu, info.cv).z)) slab(sink, r, SLAB.sand, 0.05);
    return;
  }
  if (k === 'wadi') { slab(sink, r, SLAB.farm, 0.08); if (!coarse) parkFill(sink, r, R, 0.9, true); return; }
  if (k === 'park') { slab(sink, r, SLAB.park); if (!coarse) parkFill(sink, inset(r, 2), R, 0.6); return; }
  if (k === 'vacant') { slab(sink, r, SLAB.sand, 0.08); return; }
  if (k === 'plaza') {
    slab(sink, r, SLAB.plaza);
    if (!coarse) for (let a = r.u0 + 6; a < r.u1 - 4; a += 18) { sink.palm(a, r.v0 + 5, 9, R); sink.palm(a, r.v1 - 5, 9, R); }
    return;
  }
  slab(sink, r, k === 'old' ? SLAB.old : SLAB.paving);
  if (!coarse) streetLamps(sink, r, k);
  const inner = inset(r, k === 'old' ? 1.2 : 4.2);
  if (inner.u1 - inner.u0 < 6 || inner.v1 - inner.v0 < 6) return;
  if (coarse && k !== 'tower') {
    // one silhouette box per block — the detail pass replaces it near the player
    const hh = { villa: 8.5, apt: 14, commercial: 10, old: 7, mosque: 9 }[k] || 8;
    const pal = { villa: PAL.villa, apt: PAL.apt, commercial: PAL.shop, old: PAL.mud, mosque: PAL.stone }[k] || PAL.villa;
    const sty = { villa: ST.apt, apt: ST.apt, commercial: ST.apt, old: ST.mud, mosque: ST.plain }[k];
    sink.boxes.box((inner.u0 + inner.u1) / 2, (inner.v0 + inner.v1) / 2, inner.u1 - inner.u0, inner.v1 - inner.v0, 0.22, hh * (0.8 + R() * 0.4), pick(R, pal), sty, R());
    return;
  }
  if (k === 'villa') villas(sink, inner, R, info.seed);
  else if (k === 'apt') apartments(sink, inner, R, info.seed);
  else if (k === 'commercial') {
    const f = info.front;
    const front = f.u0 ? { axis: 'u', side: -1 } : f.u1 ? { axis: 'u', side: 1 } : f.v0 ? { axis: 'v', side: -1 } : { axis: 'v', side: 1 };
    shops(sink, inner, R, front);
  } else if (k === 'tower') towers(sink, inner, R, info.zone);
  else if (k === 'old') oldTown(sink, inner, R);
  else if (k === 'mosque') mosque(sink, inner, R, info.zone === 'old');
}

// ---------- arterial furniture: medians, palms, lamps, lane paint ----------
const PAINT_W = col('#e8e6df'), PAINT_Y = col('#d9b23a'), MEDIAN = col('#c3b8a4'), POLE = col('#8d9196'), LAMP = col('#fff4d6'), KERB = col('#a8a092');
function crossRoads(axis) { return axis === 'u' ? ROADS_V : ROADS_U; }
function inJunction(axis, t, pad) {
  for (const r of crossRoads(axis)) if (Math.abs(t - r.c) < r.w / 2 + pad) return true;
  return false;
}
function roadFurniture(sink, road, axis, t0, t1, coarse) {
  // t runs along the road (v for axis 'u' roads, u for axis 'v' roads); o is across
  const at = (o, t) => (axis === 'u' ? [road.c + o, t] : [t, road.c + o]);
  const box = (o, t, so, stl, y0, h, c, style) => {
    const [u, v] = at(o, t);
    if (axis === 'u') sink.boxes.box(u, v, so, stl, y0, h, c, style); else sink.boxes.box(u, v, stl, so, y0, h, c, style);
  };
  const R = rng(Math.floor(road.c * 13 + t0));
  const half = road.median / 2;
  const laneW = 3.6;
  // median segments between junctions
  const segs = [];
  let s = null;
  for (let t = t0; t <= t1; t += 4) {
    const j = inJunction(axis, t, 4);
    if (!j && s === null) s = t;
    if ((j || t + 4 > t1) && s !== null) { if (t - s > 8) segs.push([s, t]); s = null; }
  }
  for (const [a, b] of segs) {
    box(0, (a + b) / 2, road.median - 1.2, b - a, 0, 0.35, MEDIAN, ST.median);
    if (road.service) for (const sd of [-1, 1]) {
      const o = sd * (half + road.lanes * laneW + 1.6);
      box(o, (a + b) / 2, 2.4, b - a, 0, 0.5, KERB, ST.median);
    }
    if (coarse) continue;
    for (let t = a + 6; t < b - 4; t += road.kind === 'minor' ? 30 : 18) sink.palm(...at(0, t), 9 + R() * 3, R);
    for (let t = a + 12; t < b - 4; t += 30) {
      box(0, t, 0.35, 0.35, 0.35, 11, POLE, ST.plain);
      box(0, t, half * 2 + 4, 0.25, 11, 0.25, POLE, ST.plain);
      for (const sd of [-1, 1]) { box(sd * (half + 2), t, 1.2, 0.6, 10.75, 0.3, LAMP, ST.lamp); sink.light(...at(sd * (half + 5), t), 16, ART_LIGHT); }
    }
  }
  if (coarse) return;
  // lane paint
  for (let t = t0; t < t1; t += 9) {
    if (inJunction(axis, t, 2)) continue;
    for (const sd of [-1, 1]) {
      for (let k = 1; k < road.lanes; k++) box(sd * (half + k * laneW), t + 1.5, 0.15, 3, 0.02, 0.03, PAINT_W, ST.paint);
      box(sd * (half + 0.35), t + 4.5, 0.15, 9, 0.02, 0.03, PAINT_Y, ST.paint);
      box(sd * (half + road.lanes * laneW - 0.3), t + 4.5, 0.15, 9, 0.02, 0.03, PAINT_W, ST.paint);
    }
  }
  // zebra crossings at each junction
  for (const r of crossRoads(axis)) {
    if (r.c < t0 || r.c >= t1) continue;
    for (const sd of [-1, 1]) {
      const t = r.c + sd * (r.w / 2 + 3);
      for (let o = -road.w / 2 + 2; o < road.w / 2 - 1; o += 1.6) if (Math.abs(o) > half) box(o, t, 0.8, 3.5, 0.02, 0.03, PAINT_W, ST.paint);
    }
  }
}

// ---------- chunk manager ----------
export class City {
  constructor(scene) {
    this.scene = scene;
    this.detail = new Map();
    this.coarse = new Map();
    this.queue = [];
    this.stats = { detail: 0, coarse: 0 };
  }
  buildChunk(ci, cj, lod) {
    const size = lod === 'coarse' ? COARSE : DETAIL;
    const u0 = ci * size, v0 = cj * size, u1 = u0 + size, v1 = v0 + size;
    const sink = new Sink(lod);
    blocksIn(u0, u1, v0, v1, (sb, ku, kv, r, info) => genBlock(sink, sb, ku, kv, r, info));
    for (const rd of ROADS_U) if (rd.c >= u0 && rd.c < u1) roadFurniture(sink, rd, 'u', Math.max(v0, EXT.v0), Math.min(v1, EXT.v1), lod === 'coarse');
    for (const rd of ROADS_V) if (rd.c >= v0 && rd.c < v1) roadFurniture(sink, rd, 'v', Math.max(u0, EXT.u0), Math.min(u1, EXT.u1), lod === 'coarse');
    const g = new THREE.Group();
    const add = (m, shadow = true) => { if (m) { m.castShadow = shadow; m.receiveShadow = true; g.add(m); } };
    if (lod === 'coarse') {
      add(sink.boxes.mesh(boxGeo, matCoarse), false);
    } else {
      add(sink.boxes.mesh(boxGeo, matDetail));
      add(sink.domes.mesh(domeGeo, domeMat, false));
      add(sink.caps.mesh(capGeo, capMat, false));
      add(sink.palms.mesh(palm.trunk, palmTrunkMat, false));
      add(sink.palms.mesh(palm.crown, palmCrownMat, false));
      const lm = sink.lights.mesh(poolGeo, poolMat, false);
      if (lm) { lm.renderOrder = 2; g.add(lm); g.userData.pools = lm; }
    }
    g.userData = { ci, cj, lod, n: sink.boxes.count + sink.palms.count };
    return g;
  }
  update(focus, detailR, coarseR, budgetMs = 7) {
    const g = toGrid(focus.x, focus.z);
    U.uFocus.value.set(focus.x, focus.z);
    U.uDetailR.value = detailR;
    const want = [];
    const scan = (size, R, map, lod) => {
      const a0 = Math.floor((g.u - R) / size), a1 = Math.floor((g.u + R) / size);
      const b0 = Math.floor((g.v - R) / size), b1 = Math.floor((g.v + R) / size);
      for (let i = a0; i <= a1; i++) for (let j = b0; j <= b1; j++) {
        if ((i + 1) * size < EXT.u0 || i * size > EXT.u1 || (j + 1) * size < EXT.v0 || j * size > EXT.v1) continue;
        const du = Math.max(i * size - g.u, 0, g.u - (i + 1) * size), dv = Math.max(j * size - g.v, 0, g.v - (j + 1) * size);
        const d = Math.hypot(du, dv);
        const key = i + ',' + j;
        if (d < R && !map.has(key)) want.push({ d: d + (lod === 'coarse' ? 400 : 0), i, j, lod, key });
      }
      // release far chunks
      for (const [key, grp] of map) {
        const { ci, cj } = grp.userData;
        const du = Math.max(ci * size - g.u, 0, g.u - (ci + 1) * size), dv = Math.max(cj * size - g.v, 0, g.v - (cj + 1) * size);
        if (Math.hypot(du, dv) > R + size) {
          this.scene.remove(grp);
          grp.traverse((o) => { if (o.isInstancedMesh) { if (o.geometry.userData.owned) o.geometry.dispose(); o.dispose(); } });
          map.delete(key);
        }
      }
    };
    scan(DETAIL, detailR + 60, this.detail, 'detail');
    scan(COARSE, coarseR, this.coarse, 'coarse');
    want.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    let built = 0;
    for (const w of want) {
      if (built > 0 && performance.now() - t0 > budgetMs) break;
      const map = w.lod === 'coarse' ? this.coarse : this.detail;
      const grp = this.buildChunk(w.i, w.j, w.lod);
      this.scene.add(grp);
      map.set(w.key, grp);
      built++;
    }
    this.stats.detail = this.detail.size; this.stats.coarse = this.coarse.size;
    return want.length - built;
  }
}
