// traffic.js — cars on the arterials (lane following + signals), traffic lights, and car models.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROADS_U, ROADS_V, TH, toWorld, toGrid, EXT, hash2, rng } from './geo.js';
import { U, poolMat, poolGeo } from './materials.js';

// ---------- car models (forward = +x), with a 'part' attribute: 0 paint, 1 glass, 2 rubber, 3 headlamp, 4 tail lamp, 5 trim ----------
function part(geo, id) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.deleteAttribute('uv');
  geo.setAttribute('part', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(id), 1));
  return geo;
}
export function buildCarGeometry(type = 'suv') {
  // side profile (x forward, y up), extruded across the width with rounded edges; wheel arches cut out
  const P = {
    suv: { L: 4.95, W: 1.96, y0: 0.42, belt: 1.2, roof: 1.86, gx: -2.7, pts: [[2.475, 0.95], [2.36, 1.09], [1.45, 1.2], [0.72, 1.82], [-2.22, 1.86], [-2.475, 1.72]] },
    sedan: { L: 4.85, W: 1.84, y0: 0.34, belt: 1.03, roof: 1.47, gx: -2.2, pts: [[2.425, 0.82], [2.28, 0.95], [1.18, 1.03], [0.42, 1.46], [-1.18, 1.47], [-2.07, 1.07], [-2.425, 1.02]] },
    pickup: { L: 5.3, W: 1.88, y0: 0.45, belt: 1.18, roof: 1.8, gx: -0.15, pts: [[2.65, 0.97], [2.5, 1.1], [1.65, 1.18], [1.2, 1.78], [0.05, 1.8], [-0.02, 1.18], [-2.65, 1.18]] }
  }[type];
  const { L, W, y0 } = P;
  const xw = L * 0.31, wr = 0.38, ar = 0.47;
  const sh = new THREE.Shape();
  sh.moveTo(L / 2, y0);
  for (const [x, y] of P.pts) sh.lineTo(x, y);
  sh.lineTo(-L / 2, y0);
  sh.lineTo(-xw - ar, y0);
  sh.absarc(-xw, wr, ar, Math.PI, 0, true);
  sh.lineTo(xw - ar, y0);
  sh.absarc(xw, wr, ar, Math.PI, 0, true);
  sh.lineTo(L / 2, y0);
  let body = new THREE.ExtrudeGeometry(sh, { depth: W - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 2, curveSegments: 6 });
  body.translate(0, 0, -(W - 0.16) / 2);
  // tumblehome: the glasshouse leans inwards
  const pa = body.attributes.position;
  for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); if (y > P.belt) pa.setZ(i, pa.getZ(i) * (1 - 0.14 * Math.min(1, (y - P.belt) / (P.roof - P.belt)))); }
  body.computeVertexNormals();
  const parts = [part(body, 0)];
  if (type === 'pickup') parts.push(part(new THREE.BoxGeometry(2.45, 0.1, W - 0.25).translate(-1.33, 0.86, 0), 5));
  const tyre = new THREE.CylinderGeometry(wr, wr, 0.26, 16).rotateX(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(wr * 0.62, wr * 0.62, 0.27, 12).rotateX(Math.PI / 2);
  for (const [x, z] of [[xw, W / 2 - 0.16], [xw, -W / 2 + 0.16], [-xw, W / 2 - 0.16], [-xw, -W / 2 + 0.16]]) {
    parts.push(part(tyre.clone().translate(x, wr, z), 2));
    parts.push(part(rim.clone().translate(x, wr, z + Math.sign(z) * 0.01), 6));
  }
  const fy = P.pts[0][1] - 0.14;
  for (const z of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(0.1, 0.13, 0.42).translate(L / 2 + 0.03, fy, z * (W / 2 - 0.32)), 3));
    parts.push(part(new THREE.BoxGeometry(0.1, 0.18, 0.34).translate(-L / 2 - 0.03, P.pts[P.pts.length - 1][1] - 0.2, z * (W / 2 - 0.27)), 4));
  }
  parts.push(part(new THREE.BoxGeometry(0.1, 0.2, W * 0.55).translate(L / 2 + 0.04, y0 + 0.22, 0), 5));
  const g = mergeGeometries(parts);
  const n = g.attributes.position.count;
  g.setAttribute('glassBand', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [P.belt, P.roof, P.gx][i % 3]), 3));
  return g;
}
export function makeCarMaterial({ instanced = true } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float part; attribute vec3 glassBand; varying float vPart; varying vec3 vCarP; varying vec3 vBand;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = part; vCarP = position; vBand = glassBand;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart; varying vec3 vCarP; varying vec3 vBand; uniform float uNight; float cGlass; vec3 cEm;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  cGlass = 0.0; cEm = vec3(0.0);
  float pp = floor(vPart + 0.5);
  if (pp == 0.0 && vCarP.y > vBand.x + 0.03 && vCarP.y < vBand.y - 0.07 && vCarP.x > vBand.z) pp = 1.0;
  if (pp == 1.0) { diffuseColor.rgb = vec3(0.04, 0.06, 0.08); cGlass = 1.0; }
  else if (pp == 6.0) diffuseColor.rgb = vec3(0.62, 0.63, 0.65);
  else if (pp == 0.0) diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.3, 0.75, vCarP.y));
  else if (pp == 2.0) diffuseColor.rgb = vec3(0.03);
  else if (pp == 3.0) { diffuseColor.rgb = vec3(0.95); cEm = vec3(1.0, 0.95, 0.85) * (0.3 + 6.0 * uNight); }
  else if (pp == 4.0) { diffuseColor.rgb = vec3(0.6, 0.02, 0.02); cEm = vec3(1.0, 0.05, 0.03) * (0.4 + 3.5 * uNight); }
  else if (pp == 5.0) diffuseColor.rgb = vec3(0.12);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  if (pp == 2.0 || pp == 5.0) { roughnessFactor = 0.9; metalnessFactor = 0.0; }
  if (pp == 6.0) { roughnessFactor = 0.3; metalnessFactor = 0.9; }
  if (pp == 0.0) { roughnessFactor = 0.22; metalnessFactor = 0.55; }
  roughnessFactor = mix(roughnessFactor, 0.05, cGlass); metalnessFactor = mix(metalnessFactor, 0.9, cGlass);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += cEm;');
  };
  m.customProgramCacheKey = () => 'car';
  return m;
}

const PAINT = [
  ['#f2f2ef', 44], ['#c9cdd1', 14], ['#16181b', 12], ['#6c7076', 8], ['#c8b79a', 6], ['#1e2f4f', 4], ['#7d1b1f', 3], ['#3c4a3f', 2], ['#b0a17f', 3], ['#e7e2d4', 4]
].flatMap(([c, n]) => Array(n).fill(new THREE.Color(c)));

// ---------- signals ----------
const CYCLE = 50;
function junctionPhase(ju, jv, t) {
  const off = hash2(Math.round(ju.c), Math.round(jv.c)) * CYCLE;
  const p = (t + off) % CYCLE;
  // 'u' = roads of constant u (NNW traffic) get the first half
  if (p < 21) return { u: 'G', v: 'R' };
  if (p < 24) return { u: 'A', v: 'R' };
  if (p < 25) return { u: 'R', v: 'R' };
  if (p < 46) return { u: 'R', v: 'G' };
  if (p < 49) return { u: 'R', v: 'A' };
  return { u: 'R', v: 'R' };
}

const WINDOW = 2800, LANE_W = 3.6, SPACING = 230;

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.types = ['suv', 'sedan', 'pickup'].map((t) => buildCarGeometry(t));
    this.mat = makeCarMaterial();
    this.MAX = 3600;
    this.meshes = this.types.map((g) => {
      const m = new THREE.InstancedMesh(g, this.mat, this.MAX);
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAX * 3), 3);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    });
    this.beamOff = new THREE.Matrix4().makeTranslation(11, 0.3, 0).multiply(new THREE.Matrix4().makeScale(19, 1, 7));
    this.beams = new THREE.InstancedMesh(poolGeo, poolMat, this.MAX);
    this.beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAX * 3).fill(0.3), 3);
    this.beams.count = 0; this.beams.frustumCulled = false; this.beams.renderOrder = 3;
    scene.add(this.beams);
    this.bm = new THREE.Matrix4();
    this.lanes = new Map(); // key -> lane {road, axis, dir, k, off, cars: []}
    this.buildSignals();
    this.mtx = new THREE.Matrix4();
  }
  buildSignals() {
    this.junctions = [];
    for (const ru of ROADS_U) for (const rv of ROADS_V) this.junctions.push({ ru, rv });
    const n = this.junctions.length * 4;
    const pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 6, 0.25).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: 0.6 }), n);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.5, 0.5).translate(0, 6.6, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
    head.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const m = new THREE.Matrix4();
    let i = 0;
    this.heads = [];
    for (const j of this.junctions) {
      // one head on each corner, serving the approach on its right
      const corners = [[1, -1, 'u'], [-1, 1, 'u'], [1, 1, 'v'], [-1, -1, 'v']];
      for (const [su, sv, axis] of corners) {
        const w = toWorld(j.ru.c + su * (j.ru.w / 2 + 2), j.rv.c + sv * (j.rv.w / 2 + 2));
        m.makeTranslation(w.x, 0, w.z);
        pole.setMatrixAt(i, m); head.setMatrixAt(i, m);
        this.heads.push({ j, axis });
        i++;
      }
    }
    pole.computeBoundingSphere(); head.computeBoundingSphere();
    this.scene.add(pole, head);
    this.headMesh = head;
  }
  laneKey(road, axis, dir, k) { return axis + road.c.toFixed(0) + ':' + dir + ':' + k; }
  activate(focusG) {
    // keep lanes on arterials within reach of the player; drop the rest
    const keep = new Set();
    const consider = (roads, axis) => {
      for (const road of roads) {
        const d = Math.abs((axis === 'u' ? focusG.u : focusG.v) - road.c);
        if (d > 2600) continue;
        for (const dir of [1, -1]) for (let k = 0; k < road.lanes; k++) {
          const key = this.laneKey(road, axis, dir, k);
          keep.add(key);
          if (!this.lanes.has(key)) this.spawnLane(key, road, axis, dir, k, focusG);
        }
      }
    };
    consider(ROADS_U, 'u'); consider(ROADS_V, 'v');
    for (const key of [...this.lanes.keys()]) if (!keep.has(key)) this.lanes.delete(key);
  }
  spawnLane(key, road, axis, dir, k, focusG) {
    const side = axis === 'u' ? dir : -dir;
    const off = side * (road.median / 2 + LANE_W * (k + 0.5));
    const tf = axis === 'u' ? focusG.v : focusG.u;
    const R = rng(Math.floor(Math.abs(road.c) * 7 + k * 31 + (dir > 0 ? 3 : 0)));
    const cars = [];
    const vmax = road.kind === 'freeway' ? 22 : road.kind === 'major' ? 16 : 13;
    const share = k === road.lanes - 1 ? 0.55 : k === 0 ? 1.15 : 0.85;   // inner lanes busier than the kerb lane
    for (let t = tf - WINDOW; t < tf + WINDOW; t += SPACING / share * (0.45 + R() * 1.4)) {
      cars.push({ t, v: vmax * 0.7, v0: vmax * (0.8 + R() * 0.35) - k * 0.6, type: R() < 0.45 ? 0 : R() < 0.75 ? 1 : 2, color: PAINT[Math.floor(R() * PAINT.length)] });
    }
    this.lanes.set(key, { road, axis, dir, k, off, cars, lo: axis === 'u' ? EXT.v0 : EXT.u0, hi: axis === 'u' ? EXT.v1 : EXT.u1 });
  }
  signalFor(lane, t) {
    // nearest junction ahead within 70 m: returns the stop-line distance if it is not green
    const cross = lane.axis === 'u' ? ROADS_V : ROADS_U;
    let best = Infinity;
    for (const r of cross) {
      const stop = r.c - lane.dir * (r.w / 2 + 5);
      const d = (stop - t) * lane.dir;
      if (d < -1 || d > 70) continue;
      const j = lane.axis === 'u' ? junctionPhase(lane.road, r, this.time) : junctionPhase(r, lane.road, this.time);
      const s = j[lane.axis];
      if (s === 'R' || (s === 'A' && d > 12)) best = Math.min(best, Math.max(0, d));
    }
    return best;
  }
  update(dt, focus, player) {
    this.time += dt;
    const g = toGrid(focus.x, focus.z);
    this.activateTimer = (this.activateTimer || 0) - dt;
    if (this.activateTimer <= 0) { this.activate(g); this.activateTimer = 1.0; }
    const counts = [0, 0, 0];
    let nb = 0;
    const m = this.mtx;
    const pg = player ? toGrid(player.x, player.z) : null;
    for (const lane of this.lanes.values()) {
      const cars = lane.cars;
      const tf = lane.axis === 'u' ? g.v : g.u;
      // order front to back in the driving direction
      cars.sort((a, b) => (b.t - a.t) * lane.dir);
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        let gap = 1e9;
        if (i > 0) gap = (cars[i - 1].t - c.t) * lane.dir - 5.5;
        gap = Math.min(gap, this.signalFor(lane, c.t));
        // yield to the player's vehicle if it sits in this lane
        if (pg) {
          const pt = lane.axis === 'u' ? pg.v : pg.u, po = (lane.axis === 'u' ? pg.u : pg.v) - lane.road.c;
          if (Math.abs(po - lane.off) < 2.4) { const d = (pt - c.t) * lane.dir - 5; if (d > 0) gap = Math.min(gap, d); }
        }
        const sStar = 2.5 + c.v * 1.3 + (c.v * c.v) / 10;
        const acc = 2.2 * (1 - (c.v / c.v0) ** 4 - (sStar / Math.max(gap, 0.5)) ** 2);
        c.v = Math.max(0, c.v + Math.max(-9, acc) * dt);
        c.t += c.v * dt * lane.dir;
        // wrap within the moving window
        const rel = (c.t - tf) * lane.dir;
        if (rel > WINDOW) c.t = tf - lane.dir * WINDOW;
        else if (rel < -WINDOW - 50) c.t = tf + lane.dir * (WINDOW - 10);
        if (c.t < lane.lo || c.t > lane.hi) c.t = lane.dir > 0 ? Math.max(lane.lo, tf - WINDOW) : Math.min(lane.hi, tf + WINDOW);
        // instance
        const u = lane.axis === 'u' ? lane.road.c + lane.off : c.t;
        const v = lane.axis === 'u' ? c.t : lane.road.c + lane.off;
        const w = toWorld(u, v);
        const dx = w.x - focus.x, dz = w.z - focus.z;
        if (dx * dx + dz * dz > 2400 * 2400) continue;
        const yaw = lane.axis === 'u' ? TH + (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : TH + (lane.dir > 0 ? 0 : Math.PI);
        const mesh = this.meshes[c.type];
        const n = counts[c.type];
        if (n >= this.MAX) continue;
        m.makeRotationY(yaw); m.setPosition(w.x, 0, w.z);
        mesh.setMatrixAt(n, m);
        if (U.uNight.value > 0.05 && nb < this.MAX) { this.bm.multiplyMatrices(m, this.beamOff); this.beams.setMatrixAt(nb++, this.bm); }
        mesh.instanceColor.setXYZ(n, c.color.r, c.color.g, c.color.b);
        counts[c.type]++;
      }
    }
    this.beams.count = nb; this.beams.instanceMatrix.needsUpdate = true;
    this.meshes.forEach((mesh, i) => { mesh.count = counts[i]; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; });
    // signal heads
    const G = [0.1, 1.6, 0.4], A = [1.8, 1.0, 0.05], Rr = [1.8, 0.08, 0.05];
    this.heads.forEach((h, i) => {
      const s = junctionPhase(h.j.ru, h.j.rv, this.time)[h.axis];
      const c = s === 'G' ? G : s === 'A' ? A : Rr;
      this.headMesh.instanceColor.setXYZ(i, c[0], c[1], c[2]);
    });
    this.headMesh.instanceColor.needsUpdate = true;
    return counts[0] + counts[1] + counts[2];
  }
  // world-space traffic cars near a point (for simple collision)
  nearby(x, z, r) {
    const out = [];
    const g = toGrid(x, z);
    for (const lane of this.lanes.values()) {
      const across = (lane.axis === 'u' ? g.u : g.v) - lane.road.c;
      if (Math.abs(across - lane.off) > r) continue;
      for (const c of lane.cars) {
        const along = (lane.axis === 'u' ? g.v : g.u) - c.t;
        if (Math.abs(along) < r) out.push({ lane, car: c, along, across: across - lane.off });
      }
    }
    return out;
  }
}
