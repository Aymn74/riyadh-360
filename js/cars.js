// cars.js — traffic on the real road network: cars follow ways, keep their lane, turn at junctions.
import * as THREE from 'three';
import { buildCarGeometry, makeCarMaterial } from './traffic.js';
import { U, poolMat, poolGeo } from './materials.js';
import { RC, F } from './osm.js';

const DRIVE = new Set([RC.motorway, RC.trunk, RC.primary, RC.secondary, RC.tertiary, RC.mlink, RC.link, RC.unclassified, RC.residential]);
const SPAWN = new Set([RC.motorway, RC.trunk, RC.primary, RC.secondary, RC.tertiary, RC.mlink, RC.link]);
const PAINT = [['#f2f2ef', 44], ['#c9cdd1', 14], ['#16181b', 12], ['#6c7076', 8], ['#c8b79a', 6], ['#1e2f4f', 4], ['#7d1b1f', 3], ['#3c4a3f', 2], ['#b0a17f', 3], ['#e7e2d4', 4]]
  .flatMap(([c, n]) => Array(n).fill(new THREE.Color(c)));
const nodeKey = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);

export class Cars {
  constructor(scene, osm, count = 170) {
    this.osm = osm; this.N = count;
    const s = osm.s, P = s.roadPts;
    this.nodes = new Map();
    for (let r = 0; r < osm.nRoads; r++) {
      if (!DRIVE.has(osm.cls(r))) continue;
      const st = s.roads[r * 4 + 2], n = s.roads[r * 4 + 3];
      for (const [end, i] of [[0, st], [1, st + n - 1]]) {
        const k = nodeKey(P[i * 2], P[i * 2 + 1]);
        let l = this.nodes.get(k); if (!l) this.nodes.set(k, (l = []));
        l.push({ r, end });
      }
    }
    this.meshes = ['suv', 'sedan', 'pickup'].map((t) => {
      const m = new THREE.InstancedMesh(buildCarGeometry(t), makeCarMaterial(), count);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      m.count = 0; m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
      scene.add(m);
      return m;
    });
    // a short, faint pool hugging the bumper, so from behind it never reads as an oncoming car
    this.beamOff = new THREE.Matrix4().makeTranslation(7.5, 0.3, 0).multiply(new THREE.Matrix4().makeScale(10, 1, 4));
    this.beams = new THREE.InstancedMesh(poolGeo, poolMat, count);
    this.beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(0.12), 3);
    this.beams.count = 0; this.beams.frustumCulled = false; this.beams.renderOrder = 3;
    scene.add(this.beams);
    this.cars = [];
    this.m = new THREE.Matrix4(); this.bm = new THREE.Matrix4();
  }
  segOf(c) {
    const s = this.osm.s, P = s.roadPts, st = s.roads[c.r * 4 + 2];
    const a = (st + c.i) * 2;
    return [P[a], P[a + 1], P[a + 2], P[a + 3]];
  }
  place(c, focus) {
    const osm = this.osm;
    for (let tries = 0; tries < 30; tries++) {
      const ang = Math.random() * Math.PI * 2, rad = 150 + Math.random() * 1100;
      const hit = osm.nearestRoad(focus.x + Math.cos(ang) * rad, focus.z + Math.sin(ang) * rad, 120, (r) => SPAWN.has(osm.cls(r)) && !(osm.flags(r) & F.tunnel));
      if (!hit) continue;
      // keep spawns apart (and away from the player) so no two cars ever start inside each other
      if (this.cars.some((o) => o !== c && o.ok && o.wx !== undefined && (o.wx - hit.x) ** 2 + (o.wz - hit.z) ** 2 < 400)) continue;
      if ((hit.x - focus.x) ** 2 + (hit.z - focus.z) ** 2 < 60 * 60) continue;
      const r = hit.road, ow = osm.flags(r) & F.oneway;
      const lanes = Math.max(1, (osm.s.roads[r * 4] >> 16) & 255);
      Object.assign(c, { r, i: hit.seg, t: hit.t, dir: ow ? 1 : Math.random() < 0.5 ? 1 : -1, lane: Math.floor(Math.random() * lanes), v: 8, ok: true });
      const cls = osm.cls(r);
      c.v0 = this.limit(r) * (0.85 + Math.random() * 0.2);
      const [x0, z0, x1, z1] = this.segOf(c); c.t *= Math.hypot(x1 - x0, z1 - z0);
      c.wx = hit.x; c.wz = hit.z; c.ux = hit.dirx * c.dir; c.uz = hit.dirz * c.dir;
      return;
    }
    c.ok = false;
  }
  // the posted limit (OSM maxspeed) or a typical Riyadh value for the road class, in m/s
  limit(r) {
    const ms = this.osm.maxspeed(r);
    if (ms >= 20) return ms / 3.6;
    const c = this.osm.cls(r);
    return (c === RC.motorway ? 110 : c === RC.trunk ? 90 : c === RC.primary ? 70 : c === RC.secondary ? 60 : c <= RC.tertiary ? 50 : c === RC.mlink ? 60 : c === RC.link ? 45 : 40) / 3.6;
  }
  // choose a way leaving the junction at the end of the current one
  next(c) {
    const osm = this.osm, s = osm.s, P = s.roadPts;
    const st = s.roads[c.r * 4 + 2], n = s.roads[c.r * 4 + 3];
    const endIdx = c.dir > 0 ? st + n - 1 : st;
    const prevIdx = c.dir > 0 ? st + n - 2 : st + 1;
    const ex = P[endIdx * 2], ez = P[endIdx * 2 + 1];
    const hx = ex - P[prevIdx * 2], hz = ez - P[prevIdx * 2 + 1], hl = Math.hypot(hx, hz) || 1;
    const opts = [];
    for (const o of this.nodes.get(nodeKey(ex, ez)) || []) {
      if (o.r === c.r) continue;
      const ow = osm.flags(o.r) & F.oneway;
      if (o.end === 1 && ow) continue;
      const ost = s.roads[o.r * 4 + 2], on = s.roads[o.r * 4 + 3];
      const a = o.end === 0 ? ost : ost + on - 1, b = o.end === 0 ? ost + 1 : ost + on - 2;
      const dx = P[b * 2] - P[a * 2], dz = P[b * 2 + 1] - P[a * 2 + 1], dl = Math.hypot(dx, dz) || 1;
      const straight = (hx * dx + hz * dz) / (hl * dl);
      if (straight < -0.6) continue;   // no U-turns
      opts.push({ o, straight: straight + (osm.cls(o.r) <= osm.cls(c.r) ? 0.3 : 0) });
    }
    if (!opts.length) return false;
    opts.sort((a, b) => b.straight - a.straight);
    const pick = Math.random() < 0.65 ? opts[0] : opts[Math.floor(Math.random() * opts.length)];
    const { o } = pick;
    const on = s.roads[o.r * 4 + 3];
    const lanes = Math.max(1, (s.roads[o.r * 4] >> 16) & 255);
    c.r = o.r; c.dir = o.end === 0 ? 1 : -1; c.i = o.end === 0 ? 0 : on - 2; c.t = 0; c.lane = Math.min(c.lane, lanes - 1);
    c.v0 = this.limit(o.r) * (0.85 + Math.random() * 0.2);
    return true;
  }
  progress(c) {
    const osm = this.osm, st = osm.s.roads[c.r * 4 + 2];
    const [x0, z0, x1, z1] = this.segOf(c);
    const along = osm.rLen[st + c.i] + (c.dir > 0 ? c.t : Math.hypot(x1 - x0, z1 - z0) - c.t);
    return c.dir > 0 ? along : osm.roadLen[c.r] - along;
  }
  update(dt, focus, player) {
    const osm = this.osm;
    while (this.cars.length < this.N) { const c = { type: Math.random() < 0.45 ? 0 : Math.random() < 0.75 ? 1 : 2, color: PAINT[Math.floor(Math.random() * PAINT.length)] }; this.place(c, focus); this.cars.push(c); }
    // group by road + direction + lane for car following
    const groups = new Map();
    for (const c of this.cars) {
      if (!c.ok) continue;
      c.p = this.progress(c);
      const k = c.r * 64 + (c.dir > 0 ? 32 : 0) + c.lane;
      let g = groups.get(k); if (!g) groups.set(k, (g = [])); g.push(c);
    }
    for (const g of groups.values()) { g.sort((a, b) => b.p - a.p); for (let i = 0; i < g.length; i++) g[i].lead = i ? g[i - 1] : null; }
    const counts = [0, 0, 0];
    let nb = 0;
    const night = U.uNight.value > 0.6;
    for (const c of this.cars) {
      if (!c.ok) { this.place(c, focus); continue; }
      let gap = c.lead ? c.lead.p - c.p - 6 : 200;
      const [x0, z0, x1, z1] = this.segOf(c);
      const L = Math.hypot(x1 - x0, z1 - z0) || 0.01;
      const ux = (x1 - x0) / L * c.dir, uz = (z1 - z0) / L * c.dir;
      const tt = c.dir > 0 ? c.t : L - c.t;
      let x = x0 + (x1 - x0) * (tt / L), z = z0 + (z1 - z0) * (tt / L);
      if (c.wx !== undefined) {
        // anything in a cone ahead (other cars at merges and junctions, the player) makes this car brake
        const cx0 = c.wx, cz0 = c.wz, cux = c.ux, cuz = c.uz;
        const look = (ox, oz, wide) => {
          const dx = ox - cx0, dz = oz - cz0, ahead = dx * cux + dz * cuz;
          if (ahead <= 0 || ahead > 35) return;
          const lat = Math.abs(-dx * cuz + dz * cux);
          if (lat < wide + ahead * 0.06) gap = Math.min(gap, ahead - 6.5);
        };
        for (const o of this.cars) if (o !== c && o.ok && o.wx !== undefined && Math.abs(o.wx - cx0) < 36 && Math.abs(o.wz - cz0) < 36) look(o.wx, o.wz, 2.3);
        if (player) look(player.x, player.z, 2.8);
      }
      const sStar = 2.5 + c.v * 1.3 + (c.v * c.v) / 10;
      const acc = 2.2 * (1 - (c.v / c.v0) ** 4 - (sStar / Math.max(gap, 0.5)) ** 2);
      c.v = Math.max(0, c.v + Math.max(-9, acc) * dt);
      c.t += c.v * dt;
      // walk along the way, then hop to the next one
      let guard = 0;
      while (c.ok && guard++ < 8) {
        const [a0, b0, a1, b1] = this.segOf(c);
        const Ls = Math.hypot(a1 - a0, b1 - b0);
        if (c.t <= Ls) break;
        c.t -= Ls;
        const n = osm.s.roads[c.r * 4 + 3];
        if (c.dir > 0 && c.i < n - 2) c.i++;
        else if (c.dir < 0 && c.i > 0) c.i--;
        else if (!this.next(c)) { c.ok = false; }
      }
      if (!c.ok || (x - focus.x) ** 2 + (z - focus.z) ** 2 > 1900 ** 2) { this.place(c, focus); continue; }
      // lateral lane offset to the right of travel
      const hw = osm.width(c.r) / 2, lanes = Math.max(1, (osm.s.roads[c.r * 4] >> 16) & 255);
      const ow = osm.flags(c.r) & F.oneway;
      const off = ow ? -hw + (c.lane + 0.5) * (2 * hw / lanes) : (c.lane + 0.5) * (hw / lanes);
      x += -uz * off; z += ux * off;
      const y = osm.roadY(c.r, c.dir > 0 ? c.p : osm.roadLen[c.r] - c.p) + 0.12;
      if (player && (x - player.x) ** 2 + (z - player.z) ** 2 < 16) { c.wx = x; c.wz = z; c.ux = ux; c.uz = uz; continue; }
      const mesh = this.meshes[c.type], k = counts[c.type]++;
      this.m.makeRotationY(Math.atan2(-uz, ux)); this.m.setPosition(x, y, z);
      mesh.setMatrixAt(k, this.m);
      mesh.instanceColor.setXYZ(k, c.color.r, c.color.g, c.color.b);
      if (night) { this.bm.multiplyMatrices(this.m, this.beamOff); this.beams.setMatrixAt(nb++, this.bm); }
      c.wx = x; c.wz = z; c.ux = ux; c.uz = uz;
    }
    this.meshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
    this.beams.count = nb; this.beams.instanceMatrix.needsUpdate = true;
  }
  nearby(x, z, r) {
    const out = [];
    for (const c of this.cars) if (c.ok && c.wx !== undefined && Math.abs(c.wx - x) < r && Math.abs(c.wz - z) < r) out.push(c);
    return out;
  }
}
