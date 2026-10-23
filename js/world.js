// world.js — builds Riyadh from the OpenStreetMap extract in 1 km chunks: road ribbons, pavements, extruded
// buildings, parks and water, generated infill villas, mosques, metro viaducts, then (near the camera)
// street lamps with light pools, palms and the small rooftop and compound details.
import * as THREE from 'three';
import { ST, makeBuildingMaterial, makeRoadMaterial, makeWalkMaterial, makeLandMaterial, landColor, poolMat, poolGeo, palmTrunkMat, palmCrownMat, holeMat, skipHoles } from './materials.js';
import { Batch, boxGeo, capGeo, domeGeo, palm, domeMat, capMat } from './city.js';
import { RC, F } from './osm.js';
import { rng } from './geo.js';

const CH = 1000;
const col = (h) => new THREE.Color(h);
const PAL = {
  0: ['#efe7d8', '#e8dcc4', '#ddcaa8', '#cfb690', '#f4f0e8', '#cbb99d', '#e3d3b6', '#c4a77f', '#d8d2c6'].map(col),
  2: ['#d6cab4', '#c8b79a', '#e3dccd', '#b7a789', '#cfc0a4'].map(col),
  3: ['#d9c7a6', '#c9b28c', '#e0d4bf', '#bfa883', '#d0c3ae', '#b99c76', '#e8e0d0'].map(col),
  4: ['#5e8c95', '#4f6f8f', '#8a7a62', '#9aa4ab', '#5f7d6a', '#6d7f8c', '#45607a'].map(col),
  5: ['#d8ccb4', '#c4b294', '#e2d9c6', '#b8a587', '#cdbfa6'].map(col),
  6: ['#b08458', '#a47950', '#c09a6e', '#9c7048', '#b88f63'].map(col),
  8: ['#c9c2b4', '#bdb5a6', '#d4cfc4', '#a9a296'].map(col),
  9: ['#f1ede3', '#e9e4d6', '#d8ccb4'].map(col)
};
const DOME = ['#f2efe8', '#e9e4d6', '#7fa38a', '#c9b48a', '#9fb3c2'].map(col);
const pal = (st, seed) => { const p = PAL[st] || PAL[3]; return p[Math.floor(seed * p.length) % p.length]; };
const WHITE = col('#f4f4f0'), POLE = col('#6d7176'), LAMP = col('#fff1cf'), DECK = col('#d7d3ca');
const ART_LIGHT = new THREE.Color(1.0, 0.9, 0.74).multiplyScalar(0.42), LOCAL_LIGHT = new THREE.Color(1.0, 0.72, 0.42).multiplyScalar(0.48);

const roadMat = makeRoadMaterial(), walkMat = skipHoles(makeWalkMaterial()), landMat = skipHoles(makeLandMaterial());
const CONCRETE = col('#b9b2a6'), TUNNEL_WALL = col('#cfc9bd'), TUNNEL_LAMP = col('#fff4dc');
const bldMat = makeBuildingMaterial({ always: true, fac: true });
const boxMat = makeBuildingMaterial({ always: true });

// ---------------------------------------------------------------- geometry helpers
class Geo {
  constructor(attrs) { this.a = {}; for (const [k, n] of Object.entries(attrs)) this.a[k] = { n, v: [] }; this.idx = []; this.count = 0; }
  vert(vals) { for (const k in vals) this.a[k].v.push(...vals[k]); return this.count++; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  build() {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    for (const [k, { n, v }] of Object.entries(this.a)) g.setAttribute(k, new THREE.Float32BufferAttribute(v, n));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export class World {
  constructor(scene, osm) {
    this.scene = scene; this.osm = osm;
    this.chunks = new Map();
    // per-chunk index of road pieces: segments are owned by the chunk of their midpoint
    this.segByChunk = new Map();
    const s = osm.s, P = s.roadPts;
    for (let r = 0; r < osm.nRoads; r++) {
      const st = s.roads[r * 4 + 2], n = s.roads[r * 4 + 3];
      for (let i = 0; i < n - 1; i++) {
        const a = (st + i) * 2;
        const key = this.key((P[a] + P[a + 2]) / 2, (P[a + 1] + P[a + 3]) / 2);
        let l = this.segByChunk.get(key); if (!l) this.segByChunk.set(key, (l = []));
        l.push(r, i);
      }
    }
    this.bldByChunk = this.bucket(osm.nBld, (b) => { const st = s.buildings[b * 4 + 2]; return [s.bldPts[st * 2], s.bldPts[st * 2 + 1]]; });
    this.fillByChunk = this.bucket(osm.nFill, (f) => [s.fillXZ[f * 2], s.fillXZ[f * 2 + 1]]);
    const nl = s.land.length / 3;
    this.landByChunk = this.bucket(nl, (l) => { const st = s.land[l * 3 + 1], n = s.land[l * 3 + 2]; let x = 0, z = 0; for (let i = 0; i < n; i++) { x += s.landPts[(st + i) * 2]; z += s.landPts[(st + i) * 2 + 1]; } return [x / n, z / n]; });
    const nm = s.mosques.length / 7;
    this.mosqueByChunk = this.bucket(nm, (m) => [s.mosques[m * 7 + 4], s.mosques[m * 7 + 5]]);
    this.railSegByChunk = new Map();
    const RP = s.railPts;
    for (let r = 0; r < s.rail.length / 3; r++) {
      if (!(s.rail[r * 3] & F.bridge)) continue;
      const st = s.rail[r * 3 + 1], n = s.rail[r * 3 + 2];
      for (let i = 0; i < n - 1; i++) {
        const a = (st + i) * 2, key = this.key((RP[a] + RP[a + 2]) / 2, (RP[a + 1] + RP[a + 3]) / 2);
        let l = this.railSegByChunk.get(key); if (!l) this.railSegByChunk.set(key, (l = []));
        l.push(a);
      }
    }
    this.stats = { chunks: 0, near: 0 };
  }
  key(x, z) { return Math.floor(x / CH) + ',' + Math.floor(z / CH); }
  bucket(n, at) {
    const m = new Map();
    for (let i = 0; i < n; i++) { const [x, z] = at(i); const k = this.key(x, z); let l = m.get(k); if (!l) m.set(k, (l = [])); l.push(i); }
    return m;
  }

  // ---------------------------------------------------------------- base layer (seen from far)
  buildBase(key) {
    const osm = this.osm, s = osm.s, P = s.roadPts;
    const g = new THREE.Group();
    const boxes = new Batch(), domes = new Batch(), caps = new Batch();
    // roads: contiguous runs of segments of one way
    const road = new Geo({ position: 3, normal: 3, aRoad: 4, aRoad2: 2 });
    const walk = new Geo({ position: 3, normal: 3, aRoad: 4, aRoad2: 2 });
    const segs = this.segByChunk.get(key) || [];
    const runs = [];
    for (let k = 0; k < segs.length; k += 2) {
      const r = segs[k], i = segs[k + 1];
      const last = runs[runs.length - 1];
      if (last && last.r === r && last.i1 === i) last.i1 = i + 1; else runs.push({ r, i0: i, i1: i + 1 });
    }
    const holes = new Geo({ position: 3 });
    for (const run of runs) this.ribbon(run, road, walk, boxes, holes);
    // buildings
    const bg = new Geo({ position: 3, normal: 3, color: 3, aFac: 4, aStyle: 1, aSeed: 1 });
    for (const b of this.bldByChunk.get(key) || []) this.extrude(b, bg, boxes);
    // land use
    const lg = new Geo({ position: 3, normal: 3, color: 3 });
    for (const l of this.landByChunk.get(key) || []) this.landArea(l, lg);
    // generated villas, shops and apartments: the main volume only
    for (const f of this.fillByChunk.get(key) || []) this.fillBase(f, boxes);
    // mosques: minaret, balcony, green ring, cap and dome
    const M = s.mosques;
    for (const m of this.mosqueByChunk.get(key) || []) {
      const mx = M[m * 7], mz = M[m * 7 + 1], mh = M[m * 7 + 2], dr = M[m * 7 + 3], cx = M[m * 7 + 4], cz = M[m * 7 + 5], h = M[m * 7 + 6];
      const R = rng(Math.floor(mx * 13) ^ Math.floor(mz * 7));
      const c = pal(9, R());
      boxes.boxW(mx, mz, 3.4, 3.4, 0, mh, 0.3, c, ST.plain);
      boxes.boxW(mx, mz, 4.4, 4.4, mh * 0.72, 0.8, 0.3, c.clone().multiplyScalar(0.92), ST.plain);
      boxes.boxW(mx, mz, 3.6, 3.6, mh - 1.0, 0.7, 0.3, col('#88ffaa'), ST.green);
      caps.boxW(mx, mz, 3.2, 3.2, mh, 4.5, 0.3, c, 0);
      if (dr > 3) { boxes.boxW(cx, cz, dr * 1.7, dr * 1.7, h, 2.0, 0.3, c, ST.plain); domes.boxW(cx, cz, dr, dr, h + 2.0, dr * (0.9 + R() * 0.4), 0, DOME[Math.floor(R() * DOME.length)], 0); }
    }
    // elevated metro: deck and piers
    const RP = s.railPts;
    for (const a of this.railSegByChunk.get(key) || []) {
      const x0 = RP[a], z0 = RP[a + 1], x1 = RP[a + 2], z1 = RP[a + 3];
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.5) continue;
      const yaw = Math.atan2(-(z1 - z0), x1 - x0);
      boxes.boxW((x0 + x1) / 2, (z0 + z1) / 2, L + 0.4, 9, 11, 1.8, yaw, DECK, ST.plain);
      for (let t = 0; t < L; t += 32) boxes.boxW(x0 + (x1 - x0) * (t / L), z0 + (z1 - z0) * (t / L), 2.4, 2.4, 0, 11, yaw, DECK, ST.plain);
    }
    const add = (geo, mat, cast = false) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = cast; g.add(m); return m; };
    const hm = add(holes.build(), holeMat); if (hm) { hm.renderOrder = -5; hm.receiveShadow = false; }
    add(walk.build(), walkMat);
    add(road.build(), roadMat);
    add(lg.build(), landMat);
    add(bg.build(), bldMat, true);
    const addI = (b, geo, mat, style = true) => { const m = b.mesh(geo, mat, style); if (m) { m.castShadow = m.receiveShadow = true; g.add(m); } };
    addI(boxes, boxGeo, boxMat);
    addI(domes, domeGeo, domeMat, false);
    addI(caps, capGeo, capMat, false);
    return g;
  }
  ribbon(run, road, walk, boxes, holes) {
    const osm = this.osm, s = osm.s, P = s.roadPts;
    const r = run.r, st = s.roads[r * 4 + 2];
    const cls = osm.cls(r), flags = osm.flags(r), hw = osm.width(r) / 2;
    const lanes = (s.roads[r * 4] >> 16) & 255;
    const L = osm.roadLen[r];
    const pk = cls + 16 * flags;
    const yBase = 0.12 + (12 - cls) * 0.004;
    const pts = [];
    for (let i = run.i0; i <= run.i1; i++) pts.push([P[(st + i) * 2], P[(st + i) * 2 + 1], osm.rLen[st + i]]);
    const n = pts.length;
    const nor = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      // miter: scale the offset by 1/cos of the half angle, clamped
      let k = 1;
      if (i > 0 && i < n - 1) {
        const ax = pts[i][0] - pts[i - 1][0], az = pts[i][1] - pts[i - 1][1], la = Math.hypot(ax, az) || 1;
        const c = (ax / la) * dx + (az / la) * dz; k = 1 / Math.max(0.5, c);
      }
      nor.push([-dz * k, dx * k]);   // right-hand side
    }
    const prof = osm.profile(r);
    const bridge = prof && prof.H > 0, sunken = prof && prof.H < 0, covered = sunken && (flags & F.tunnel);
    const emit = (geo, half, y0, isWalk) => {
      const base = geo.count;
      for (let i = 0; i < n; i++) {
        const [x, z, al] = pts[i], [nx, nz] = nor[i];
        const y = y0 + osm.roadY(r, al);
        geo.vert({ position: [x - nx * half, y, z - nz * half], normal: [0, 1, 0], aRoad: [-half, al, hw, lanes], aRoad2: [L, pk] });
        geo.vert({ position: [x + nx * half, y, z + nz * half], normal: [0, 1, 0], aRoad: [half, al, hw, lanes], aRoad2: [L, pk] });
      }
      for (let i = 0; i < n - 1; i++) { const a = base + i * 2; geo.tri(a, a + 1, a + 2); geo.tri(a + 1, a + 3, a + 2); }
      void isWalk;
    };
    emit(road, hw, yBase, false);
    if (!prof && cls >= RC.primary && cls <= RC.living) emit(walk, hw + 3.4, 0.07, true);
    if (sunken) this.sunken(r, pts, hw, covered, boxes, holes);
    if (bridge) {
      // deck edges and piers
      for (let i = 0; i < n - 1; i++) {
        const [x0, z0, a0] = pts[i], [x1, z1, a1] = pts[i + 1];
        const Ls = Math.hypot(x1 - x0, z1 - z0); if (Ls < 0.5) continue;
        const yaw = Math.atan2(-(z1 - z0), x1 - x0);
        const ym = Math.min(osm.roadY(r, a0), osm.roadY(r, a1));
        if (ym < 1.2) continue;
        for (const sd of [-1, 1]) {
          const ox = -(z1 - z0) / Ls * (hw + 0.25) * sd, oz = (x1 - x0) / Ls * (hw + 0.25) * sd;
          boxes.boxW((x0 + x1) / 2 + ox, (z0 + z1) / 2 + oz, Ls + 0.2, 0.5, ym - 1.2, 2.1, yaw, DECK, ST.plain);
        }
        boxes.boxW((x0 + x1) / 2, (z0 + z1) / 2, Ls + 0.2, hw * 2, ym - 1.3, 1.2, yaw, DECK.clone().multiplyScalar(0.8), ST.plain);
        for (let t = 8; t < Ls; t += 30) {
          const yy = osm.roadY(r, a0 + t);
          if (yy > 2) boxes.boxW(x0 + (x1 - x0) * t / Ls, z0 + (z1 - z0) * t / Ls, 1.8, hw * 1.3, 0, yy - 1.3, yaw, DECK, ST.plain);
        }
      }
    }
  }
  // a road below grade: an open trench with retaining walls, then (for tunnels) a portal and a lit, covered tube
  sunken(r, pts, hw, covered, boxes, holes) {
    const osm = this.osm;
    const COVER = 6.0;   // depth at which the roof closes over the road
    let prevClosed = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0, a0] = pts[i], [x1, z1, a1] = pts[i + 1];
      const Ls = Math.hypot(x1 - x0, z1 - z0); if (Ls < 0.3) continue;
      const ux = (x1 - x0) / Ls, uz = (z1 - z0) / Ls, nx = -uz, nz = ux;
      const yaw = Math.atan2(-uz, ux);
      // split long segments so walls follow the slope
      const parts = Math.max(1, Math.ceil(Ls / 10));
      for (let k = 0; k < parts; k++) {
        const t0 = (k / parts) * Ls, t1 = ((k + 1) / parts) * Ls, sl = t1 - t0;
        const ya = osm.roadY(r, a0 + t0), yb = osm.roadY(r, a0 + t1);
        const lo = Math.min(ya, yb), depth = -(ya + yb) / 2;
        if (depth < 0.3) { prevClosed = false; continue; }
        const mx = x0 + ux * (t0 + t1) / 2, mz = z0 + uz * (t0 + t1) / 2;
        const closed = covered && depth >= COVER;
        for (const sd of [-1, 1]) {
          const ox = nx * (hw + 0.45) * sd, oz = nz * (hw + 0.45) * sd;
          if (closed) boxes.boxW(mx + ox, mz + oz, sl + 0.1, 0.9, lo - 0.3, 6.3 + 0.3, yaw, TUNNEL_WALL, ST.plain);
          else boxes.boxW(mx + ox, mz + oz, sl + 0.1, 0.9, lo - 0.3, -lo + 1.2, yaw, CONCRETE, ST.plain);   // retaining wall + parapet
        }
        if (closed) {
          const ym = (ya + yb) / 2;
          boxes.boxW(mx, mz, sl + 0.1, hw * 2 + 1.8, ym + 6.0, 0.7, yaw, TUNNEL_WALL, ST.plain);   // roof
          if (k % 2 === 0) for (const sd of [-0.5, 0.5]) boxes.boxW(mx + nx * hw * sd, mz + nz * hw * sd, 2.4, 0.5, ym + 5.75, 0.25, yaw, TUNNEL_LAMP, ST.tunnelLamp);
        } else {
          // the opening in the ground over the trench
          const w = hw + 0.95, ax = x0 + ux * t0, az = z0 + uz * t0, bx = x0 + ux * t1, bz = z0 + uz * t1;
          const base = holes.count;
          holes.vert({ position: [ax - nx * w, 0.0, az - nz * w] }); holes.vert({ position: [ax + nx * w, 0.0, az + nz * w] });
          holes.vert({ position: [bx - nx * w, 0.0, bz - nz * w] }); holes.vert({ position: [bx + nx * w, 0.0, bz + nz * w] });
          holes.tri(base, base + 1, base + 2); holes.tri(base + 1, base + 3, base + 2);
        }
        // portal: a concrete header above the tunnel mouth where the roof begins or ends
        if (prevClosed !== null && closed !== prevClosed) {
          const px = x0 + ux * t0, pz = z0 + uz * t0, y = ya;
          boxes.boxW(px, pz, 1.2, hw * 2 + 2.6, y + 5.9, -(y + 5.9) + 0.9, yaw, CONCRETE, ST.plain);
        }
        prevClosed = closed;
      }
    }
  }
  extrude(b, geo, boxes) {
    const osm = this.osm, s = osm.s, B = s.bldPts;
    const a = s.buildings[b * 4], seed = s.buildings[b * 4 + 1], st = s.buildings[b * 4 + 2], n = s.buildings[b * 4 + 3];
    const style = a & 255, h = (a >>> 8) / 10;
    const sd = (seed % 10007) / 10007;
    const c = pal(style, sd);
    const ring = [];
    for (let i = 0; i < n; i++) ring.push([B[(st + i) * 2], B[(st + i) * 2 + 1]]);
    for (let i = 0; i < n; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      const nx = dz / L, nz = -dx / L;
      const v = (x, y, z, hc) => geo.vert({ position: [x, y, z], normal: [nx, 0, nz], color: [c.r, c.g, c.b], aFac: [hc, L, h, 0], aStyle: [style], aSeed: [sd] });
      const a0 = v(ax, 0, az, 0), b0 = v(bx, 0, bz, L), b1 = v(bx, h, bz, L), a1 = v(ax, h, az, 0);
      geo.tri(a0, b1, b0); geo.tri(a0, a1, b1);
    }
    // roof
    const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { faces = []; }
    const roofC = c.clone().multiplyScalar(0.86);
    const base = geo.count;
    for (const [x, z] of ring) geo.vert({ position: [x, h, z], normal: [0, 1, 0], color: [roofC.r, roofC.g, roofC.b], aFac: [0, -1, h, 0], aStyle: [style], aSeed: [sd] });
    for (const [i, j, k] of faces) {
      // keep the roof facing up
      const ax = ring[i][0], az = ring[i][1], bx = ring[j][0], bz = ring[j][1], cx = ring[k][0], cz = ring[k][1];
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (ny > 0) geo.tri(base + i, base + j, base + k); else geo.tri(base + i, base + k, base + j);
    }
    // a crown on towers
    if (h > 40) {
      let cx = 0, cz = 0; for (const [x, z] of ring) { cx += x; cz += z; } cx /= n; cz /= n;
      const e = ring.reduce((m, [x, z]) => Math.max(m, Math.hypot(x - cx, z - cz)), 0) * 0.5;
      const ang = Math.atan2(-(ring[1][1] - ring[0][1]), ring[1][0] - ring[0][0]);
      boxes.boxW(cx, cz, e, e, h, 3 + sd * 8, ang, c.clone().multiplyScalar(0.75), ST.plain);
      if (sd > 0.55) boxes.boxW(cx, cz, 0.6, 0.6, h + 3, 10 + sd * 18, 0, col('#c8c8c8'), ST.plain);
    }
  }
  landArea(l, geo) {
    const s = this.osm.s, LP = s.landPts;
    const k = s.land[l * 3], st = s.land[l * 3 + 1], n = s.land[l * 3 + 2];
    const ring = []; for (let i = 0; i < n; i++) ring.push(new THREE.Vector2(LP[(st + i) * 2], LP[(st + i) * 2 + 1]));
    let faces; try { faces = THREE.ShapeUtils.triangulateShape(ring, []); } catch (e) { return; }
    const c = landColor(k), y = 0.05 + k * 0.004;
    const base = geo.count;
    for (const p of ring) geo.vert({ position: [p.x, y, p.y], normal: [0, 1, 0], color: [c.r, c.g, c.b] });
    for (const [i, j, m] of faces) {
      const ny = (ring[j].y - ring[i].y) * (ring[m].x - ring[i].x) - (ring[j].x - ring[i].x) * (ring[m].y - ring[i].y);
      if (ny > 0) geo.tri(base + i, base + j, base + m); else geo.tri(base + i, base + m, base + j);
    }
  }
  // local plot frame: x along the street, z away from it (front at z = -d/2)
  plot(f) {
    const p = this.osm.fill(f);
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    p.at = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
    return p;
  }
  fillBase(f, boxes) {
    const p = this.plot(f);
    const c = pal(p.style, p.seed);
    if (p.style === 2) {
      const [x, z] = p.at(0, -p.d * 0.08);
      boxes.boxW(x, z, p.w, p.d * 0.84, 0, p.h, p.yaw, c, ST.shop, p.seed);
    } else if (p.style === 3) {
      const [x, z] = p.at(0, p.d * 0.04);
      boxes.boxW(x, z, p.w * 0.9, p.d * 0.78, 0, p.h, p.yaw, c, ST.apt, p.seed);
    } else {
      const [x, z] = p.at((p.seed - 0.5) * p.w * 0.12, p.d * 0.12);
      boxes.boxW(x, z, p.w * 0.68, p.d * 0.58, 0, p.h, p.yaw, c, ST.villa, p.seed);
    }
  }

  // ---------------------------------------------------------------- near layer (details, lights, palms)
  buildNear(key) {
    const osm = this.osm, s = osm.s, P = s.roadPts;
    const g = new THREE.Group();
    const boxes = new Batch(), palms = new Batch(), lights = new Batch();
    const [ci, cj] = key.split(',').map(Number);
    const R = rng((ci * 73856093) ^ (cj * 19349663));
    const palmAt = (x, z, h) => {
      const yaw = R() * Math.PI * 2, sc = h * (0.9 + R() * 0.2), c = Math.cos(yaw), sn = Math.sin(yaw);
      palms.m.push(c * sc, 0, -sn * sc, 0, 0, h, 0, 0, sn * sc, 0, c * sc, 0, x, 0.1, z, 1);
      const v = 0.75 + R() * 0.4; palms.c.push(v, v * (0.95 + R() * 0.1), v * 0.85); palms.st.push(0); palms.sd.push(0);
    };
    // compound walls, parapets, stair houses and water tanks of the generated plots
    for (const f of this.fillByChunk.get(key) || []) {
      const p = this.plot(f);
      const c = pal(p.style, p.seed);
      if (p.style === 0) {
        boxes.boxW(p.x, p.z, p.w - 0.4, p.d - 0.4, 0, 3.0, p.yaw, c.clone().multiplyScalar(0.94), ST.wall, p.seed);
        const [hx, hz] = p.at((p.seed - 0.5) * p.w * 0.12, p.d * 0.12);
        boxes.boxW(hx, hz, p.w * 0.68 + 0.3, p.d * 0.58 + 0.3, p.h - 0.6, 0.6, p.yaw, c.clone().multiplyScalar(0.9), ST.plain);
        const [ax, az] = p.at(p.w * 0.12, p.d * 0.2);
        boxes.boxW(ax, az, 4.2, 3.8, p.h, 2.9, p.yaw, c, ST.plain);
        if (p.seed > 0.4) { const [tx, tz] = p.at(-p.w * 0.18, p.d * 0.3); boxes.boxW(tx, tz, 1.4, 1.4, p.h, 1.2, p.yaw, WHITE, ST.plain); }
        if (R() < 0.45) { const [px, pz] = p.at((R() - 0.5) * p.w * 0.7, -p.d * 0.36); palmAt(px, pz, 6 + R() * 5); }
      } else if (p.style === 3) {
        const [x, z] = p.at(0, p.d * 0.04);
        boxes.boxW(x, z, p.w * 0.9 + 0.3, p.d * 0.78 + 0.3, p.h - 0.6, 0.6, p.yaw, c.clone().multiplyScalar(0.88), ST.plain);
        boxes.boxW(x, z, 5, 4.5, p.h, 3, p.yaw, c, ST.plain);
      }
    }
    // rooftop stair houses on mapped villas and apartments
    const B = s.bldPts;
    for (const b of this.bldByChunk.get(key) || []) {
      const a = s.buildings[b * 4], style = a & 255, h = (a >>> 8) / 10;
      if (!(style === 0 || style === 3) || h > 30) continue;
      const st = s.buildings[b * 4 + 2], n = s.buildings[b * 4 + 3];
      let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += B[(st + i) * 2]; cz += B[(st + i) * 2 + 1]; } cx /= n; cz /= n;
      const ang = Math.atan2(-(B[(st + 1) * 2 + 1] - B[st * 2 + 1]), B[(st + 1) * 2] - B[st * 2]);
      const sd = (s.buildings[b * 4 + 1] % 10007) / 10007;
      boxes.boxW(cx, cz, 3.8, 3.4, h, 2.8, ang, pal(style, sd), ST.plain);
      if (sd > 0.5) boxes.boxW(cx + 3, cz + 2, 1.4, 1.4, h, 1.2, ang, WHITE, ST.plain);
    }
    // street lamps, light pools and palms along the real streets
    const onRoad = (x, z, m = 1.0) => { const h = osm.nearestRoad(x, z, 4, (rr) => osm.cls(rr) !== RC.pedestrian && !(osm.flags(rr) & F.tunnel)); return h && h.dist < m; };
    const segs = this.segByChunk.get(key) || [];
    for (let k = 0; k < segs.length; k += 2) {
      const r = segs[k], i = segs[k + 1];
      const cls = osm.cls(r), flags = osm.flags(r);
      if (cls === RC.service || cls === RC.pedestrian) continue;
      const st = s.roads[r * 4 + 2], a = (st + i) * 2;
      const x0 = P[a], z0 = P[a + 1], x1 = P[a + 2], z1 = P[a + 3];
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 4) continue;
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = -uz, nz = ux;   // n = right-hand side
      const hw = osm.width(r) / 2, s0 = osm.rLen[st + i], WL = osm.roadLen[r];
      const major = cls <= RC.secondary || cls === RC.mlink;
      const oneway = flags & F.oneway;
      const spacing = major ? 34 : 30;
      const sides = oneway ? (major ? [-1] : [1]) : (cls <= RC.tertiary ? [-1, 1] : [1]);
      const phase = (r * 7.31) % spacing;
      for (let t = ((phase - s0) % spacing + spacing) % spacing; t < L; t += spacing) {
        const al = s0 + t;
        if (al < 12 || al > WL - 12) continue;
        const y = osm.roadY(r, al);
        const px = x0 + ux * t, pz = z0 + uz * t;
        for (const sd of sides) {
          const off = hw + (major && oneway ? 1.6 : 1.1);
          const lx = px + nx * off * sd, lz = pz + nz * off * sd;
          if (onRoad(lx, lz)) continue;   // never stand a pole on another carriageway
          const H = major ? 11 : 7.5;
          const yaw = Math.atan2(-uz, ux);
          boxes.boxW(lx, lz, 0.26, 0.26, y, H, yaw, POLE, ST.plain);
          const ax = px + nx * (off - 1.3) * sd, az = pz + nz * (off - 1.3) * sd;
          boxes.boxW((lx + ax) / 2, (lz + az) / 2, 0.14, 2.6, y + H, 0.14, yaw, POLE, ST.plain);
          boxes.boxW(ax, az, 0.6, 1.0, y + H - 0.25, 0.22, yaw, LAMP, ST.lamp);
          const lpx = px + nx * (off - 3.5) * sd, lpz = pz + nz * (off - 3.5) * sd;
          lights.boxW(lpx, lpz, major ? 38 : 28, major ? 38 : 28, y + 0.15, 1, 0, major ? ART_LIGHT : LOCAL_LIGHT, 0);
        }
        // palms between the lamps on the big roads (in the median of dual carriageways)
        if (cls >= RC.trunk && cls <= RC.secondary && y < 0.5) {
          const tt = t + spacing / 2; if (tt < L) {
            const qx = x0 + ux * tt, qz = z0 + uz * tt;
            for (const sd of oneway ? [-1] : [-1, 1]) { const mx = qx + nx * (hw + 2.4) * sd, mz = qz + nz * (hw + 2.4) * sd; if (!onRoad(mx, mz, 2.2)) palmAt(mx, mz, 8 + R() * 3); }
          }
        }
      }
    }
    // parks: palms scattered over the green
    const LP = s.landPts;
    for (const l of this.landByChunk.get(key) || []) {
      const kind = s.land[l * 3]; if (kind !== 1 && kind !== 3) continue;
      const st = s.land[l * 3 + 1], n = s.land[l * 3 + 2];
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < n; i++) { const x = LP[(st + i) * 2], z = LP[(st + i) * 2 + 1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const tries = Math.min(260, ((x1 - x0) * (z1 - z0)) / (kind === 3 ? 90 : 180));
      for (let t = 0; t < tries; t++) {
        const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = LP[(st + i) * 2], zi = LP[(st + i) * 2 + 1], xj = LP[(st + j) * 2], zj = LP[(st + j) * 2 + 1];
          if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
        }
        if (inside) palmAt(x, z, 7 + R() * 6);
      }
    }
    const addI = (b, geo, mat, style = true) => { const m = b.mesh(geo, mat, style); if (m) { m.castShadow = m.receiveShadow = true; g.add(m); } return m; };
    addI(boxes, boxGeo, boxMat);
    addI(palms, palm.trunk, palmTrunkMat, false);
    addI(palms, palm.crown, palmCrownMat, false);
    const lm = lights.mesh(poolGeo, poolMat, false);
    if (lm) { lm.renderOrder = 2; g.add(lm); }
    return g;
  }

  // ---------------------------------------------------------------- streaming
  update(focus, nearR, farR, budgetMs = 6) {
    const want = [];
    const i0 = Math.floor((focus.x - farR) / CH), i1 = Math.floor((focus.x + farR) / CH);
    const j0 = Math.floor((focus.z - farR) / CH), j1 = Math.floor((focus.z + farR) / CH);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const dx = Math.max(i * CH - focus.x, 0, focus.x - (i + 1) * CH), dz = Math.max(j * CH - focus.z, 0, focus.z - (j + 1) * CH);
      const d = Math.hypot(dx, dz);
      const key = i + ',' + j;
      let c = this.chunks.get(key);
      if (d < farR && (!c || !c.base)) want.push({ d, key, kind: 'base' });
      if (d < nearR && c && c.base && !c.near) want.push({ d: d - 300, key, kind: 'near' });
      if (c) {
        if (c.base) c.base.visible = d < farR + 200;
        if (c.near) c.near.visible = d < nearR + 200;
      }
    }
    for (const [key, c] of this.chunks) {
      const [i, j] = key.split(',').map(Number);
      const dx = Math.max(i * CH - focus.x, 0, focus.x - (i + 1) * CH), dz = Math.max(j * CH - focus.z, 0, focus.z - (j + 1) * CH);
      const d = Math.hypot(dx, dz);
      if (c.near && d > nearR + 1500) { this.dispose(c.near); c.near = null; }
      if (c.base && d > farR + 3000) { this.dispose(c.base); c.base = null; }
    }
    want.sort((a, b) => a.d - b.d);
    // a gap right next to the camera (after a teleport or a camera cut) is filled faster
    if (want.length && want[0].d < 1200) budgetMs = Math.max(budgetMs, 18);
    const t0 = performance.now();
    let built = 0;
    for (const w of want) {
      if (built > 0 && performance.now() - t0 > budgetMs) break;
      let c = this.chunks.get(w.key); if (!c) this.chunks.set(w.key, (c = {}));
      if (w.kind === 'base' && !c.base) { c.base = this.buildBase(w.key); this.scene.add(c.base); }
      else if (w.kind === 'near' && !c.near) { c.near = this.buildNear(w.key); this.scene.add(c.near); }
      built++;
    }
    this.stats.chunks = [...this.chunks.values()].filter((c) => c.base).length;
    this.stats.near = [...this.chunks.values()].filter((c) => c.near).length;
    return want.length - built;
  }
  dispose(grp) {
    this.scene.remove(grp);
    grp.traverse((o) => { if (o.geometry && (o.geometry.userData.owned || !o.isInstancedMesh)) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
  }
}
