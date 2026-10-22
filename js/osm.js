// osm.js — loads the preprocessed OpenStreetMap extract (tools/build_osm.py) and answers spatial queries.
// Road classes: 0 motorway, 1 trunk, 2 primary, 3 secondary, 4 tertiary, 5 unclassified, 6 residential,
// 7 living street, 8 service, 9 motorway/trunk link, 10 other link, 11 pedestrian.
export const RC = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, unclassified: 5, residential: 6, living: 7, service: 8, mlink: 9, link: 10, pedestrian: 11 };
export const F = { oneway: 1, bridge: 2, tunnel: 4, lit: 8 };
const CELL = 200;
// road id and segment index share one Uint32 in the spatial grid: 10 bits for the segment (ways have <= 182 points)
export const SEG = 1024;
function b64(text) {
  const bin = atob(text.trim()), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export class OSM {
  async load(base, onProgress) {
    const meta = await (await fetch(base + 'riyadh.json')).json();
    this.meta = meta;
    this.names = meta.names;
    const files = Object.keys(meta.files);
    const bufs = {};
    let done = 0;
    await Promise.all(files.map(async (f) => {
      // the binary sections ship as base64 text (the host serves text, not raw binaries)
      const r = await fetch(base + f.replace(/\.bin$/, '.b64.txt'));
      if (!r.ok) throw new Error(f + ': HTTP ' + r.status);
      bufs[f] = b64(await r.text());
      onProgress?.(++done / files.length);
    }));
    const T = { uint32: Uint32Array, float32: Float32Array, uint16: Uint16Array, uint8: Uint8Array };
    this.s = {};
    for (const f of files) for (const [k, d] of Object.entries(meta.files[f])) this.s[k] = new T[d.type](bufs[f], d.offset, d.length);
    this.prepare();
    return this;
  }
  prepare() {
    const s = this.s;
    this.nRoads = s.roads.length / 4;
    this.nBld = s.buildings.length / 4;
    this.nFill = s.fillStyle.length;
    // cumulative length per road vertex (for markings, bridge ramps, traffic)
    this.rLen = new Float32Array(s.roadPts.length / 2);
    this.roadLen = new Float32Array(this.nRoads);
    for (let r = 0; r < this.nRoads; r++) {
      const st = s.roads[r * 4 + 2], n = s.roads[r * 4 + 3];
      let L = 0;
      this.rLen[st] = 0;
      for (let i = 1; i < n; i++) {
        const a = (st + i - 1) * 2, b = (st + i) * 2;
        L += Math.hypot(s.roadPts[b] - s.roadPts[a], s.roadPts[b + 1] - s.roadPts[a + 1]);
        this.rLen[st + i] = L;
      }
      this.roadLen[r] = L;
    }
    // bounds and grid
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const P = s.roadPts;
    for (let i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 1]); z1 = Math.max(z1, P[i + 1]); }
    this.bx0 = Math.floor(x0 / CELL) * CELL - CELL; this.bz0 = Math.floor(z0 / CELL) * CELL - CELL;
    this.gw = Math.ceil((x1 - this.bx0) / CELL) + 2; this.gh = Math.ceil((z1 - this.bz0) / CELL) + 2;
    this.segGrid = this.buildGrid((push) => {
      for (let r = 0; r < this.nRoads; r++) {
        const st = s.roads[r * 4 + 2], n = s.roads[r * 4 + 3];
        for (let i = 0; i < n - 1; i++) {
          const a = (st + i) * 2;
          const mx = (P[a] + P[a + 2]) / 2, mz = (P[a + 1] + P[a + 3]) / 2;
          const L = Math.hypot(P[a + 2] - P[a], P[a + 3] - P[a + 1]);
          // long segments go into every cell they cross
          const steps = Math.max(1, Math.ceil(L / (CELL * 0.5)));
          let last = -1;
          for (let k = 0; k <= steps; k++) {
            const t = k / steps, c = this.cell(P[a] + (P[a + 2] - P[a]) * t, P[a + 1] + (P[a + 3] - P[a + 1]) * t);
            if (c !== last) { push(c, r * SEG + i); last = c; }
          }
          void mx; void mz;
        }
      }
    });
    const B = s.bldPts;
    this.bldGrid = this.buildGrid((push) => {
      for (let b = 0; b < this.nBld; b++) {
        const st = s.buildings[b * 4 + 2], n = s.buildings[b * 4 + 3];
        let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
        for (let i = 0; i < n; i++) { const x = B[(st + i) * 2], z = B[(st + i) * 2 + 1]; a0 = Math.min(a0, x); a1 = Math.max(a1, x); c0 = Math.min(c0, z); c1 = Math.max(c1, z); }
        const i0 = this.ci(a0), i1 = this.ci(a1), j0 = this.cj(c0), j1 = this.cj(c1);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) push(j * this.gw + i, b);
      }
    });
    const FX = s.fillXZ;
    this.fillGrid = this.buildGrid((push) => { for (let f = 0; f < this.nFill; f++) push(this.cell(FX[f * 2], FX[f * 2 + 1]), f); });
    const LP = s.landPts, nl = s.land.length / 3;
    this.landGrid = this.buildGrid((push) => {
      for (let l = 0; l < nl; l++) {
        const st = s.land[l * 3 + 1], n = s.land[l * 3 + 2];
        let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
        for (let i = 0; i < n; i++) { const x = LP[(st + i) * 2], z = LP[(st + i) * 2 + 1]; a0 = Math.min(a0, x); a1 = Math.max(a1, x); c0 = Math.min(c0, z); c1 = Math.max(c1, z); }
        // land areas are assigned to the chunk of their centre so they are drawn once
        push(this.cell((a0 + a1) / 2, (c0 + c1) / 2), l);
      }
    });
  }
  ci(x) { return Math.max(0, Math.min(this.gw - 1, Math.floor((x - this.bx0) / CELL))); }
  cj(z) { return Math.max(0, Math.min(this.gh - 1, Math.floor((z - this.bz0) / CELL))); }
  cell(x, z) { return this.cj(z) * this.gw + this.ci(x); }
  // CSR grid: start offsets + packed items
  buildGrid(fill) {
    const counts = new Uint32Array(this.gw * this.gh + 1);
    fill((c) => counts[c + 1]++);
    for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
    const items = new Uint32Array(counts[counts.length - 1]);
    const at = counts.slice(0, -1);
    fill((c, v) => { items[at[c]++] = v; });
    return { start: counts, items };
  }
  *cellsIn(x0, z0, x1, z1) {
    const i0 = this.ci(x0), i1 = this.ci(x1), j0 = this.cj(z0), j1 = this.cj(z1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) yield j * this.gw + i;
  }
  forItems(grid, x0, z0, x1, z1, cb) {
    for (const c of this.cellsIn(x0, z0, x1, z1)) for (let k = grid.start[c]; k < grid.start[c + 1]; k++) cb(grid.items[k]);
  }

  // ---- roads
  road(r) {
    const s = this.s.roads, a = s[r * 4];
    return { id: r, cls: a & 255, flags: (a >> 8) & 255, lanes: (a >> 16) & 255, width: ((a >>> 24) * 2) / 10, name: s[r * 4 + 1], start: s[r * 4 + 2], n: s[r * 4 + 3] };
  }
  cls(r) { return this.s.roads[r * 4] & 255; }
  flags(r) { return (this.s.roads[r * 4] >> 8) & 255; }
  width(r) { return ((this.s.roads[r * 4] >>> 24) * 2) / 10; }
  nameOf(r) { const i = this.s.roads[r * 4 + 1] & 0xFFFF; return i === 0xFFFF ? null : this.names[i]; }
  // posted speed limit in km/h from OSM maxspeed, 0 when unknown
  maxspeed(r) { return this.s.roads[r * 4 + 1] >>> 16; }
  // height of a road at distance s along it: bridges rise from both ends to a 7 m deck
  roadY(r, sAlong) {
    const f = this.flags(r);
    if (!(f & F.bridge)) return 0;
    const L = this.roadLen[r], ramp = Math.min(110, L * 0.45);
    const k = Math.min(1, sAlong / ramp, (L - sAlong) / ramp);
    const e = Math.max(0, k);
    return 7.2 * e * e * (3 - 2 * e);
  }
  // nearest road segment to a point; filter(r) may reject roads
  nearestRoad(x, z, maxD = 60, filter) {
    let best = null, bd = maxD;
    const P = this.s.roadPts;
    this.forItems(this.segGrid, x - maxD, z - maxD, x + maxD, z + maxD, (v) => {
      const r = Math.floor(v / SEG), i = v % SEG;
      if (filter && !filter(r)) return;
      const st = this.s.roads[r * 4 + 2];
      const a = (st + i) * 2;
      const ax = P[a], az = P[a + 1], dx = P[a + 2] - ax, dz = P[a + 3] - az;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const px = ax + dx * t, pz = az + dz * t;
      const d = Math.hypot(x - px, z - pz) - this.width(r) / 2;
      if (d < bd) {
        bd = d;
        const L = Math.sqrt(L2);
        best = { road: r, seg: i, t, x: px, z: pz, dist: d, dirx: dx / L, dirz: dz / L, along: this.rLen[st + i] + L * t };
      }
    });
    return best;
  }
  // ---- buildings
  bld(b) {
    const s = this.s.buildings, a = s[b * 4];
    return { style: a & 255, height: (a >>> 8) / 10, seed: s[b * 4 + 1], start: s[b * 4 + 2], n: s[b * 4 + 3] };
  }
  insideBuilding(x, z, pad = 0) {
    let hit = false;
    const B = this.s.bldPts;
    this.forItems(this.bldGrid, x, z, x, z, (b) => {
      if (hit) return;
      const st = this.s.buildings[b * 4 + 2], n = this.s.buildings[b * 4 + 3];
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = B[(st + i) * 2], zi = B[(st + i) * 2 + 1], xj = B[(st + j) * 2], zj = B[(st + j) * 2 + 1];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) hit = true;
    });
    if (hit) return true;
    // generated villas: their whole walled plot blocks
    const FX = this.s.fillXZ, FD = this.s.fillDims;
    this.forItems(this.fillGrid, x - 30, z - 30, x + 30, z + 30, (f) => {
      if (hit) return;
      const fx = FX[f * 2], fz = FX[f * 2 + 1];
      const yaw = (FD[f * 4] / 256) * Math.PI * 2, w = FD[f * 4 + 1] / 4, d = FD[f * 4 + 2] / 4;
      const dx = x - fx, dz = z - fz, c = Math.cos(yaw), s = Math.sin(yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < w / 2 + pad && Math.abs(lz) < d / 2 + pad) hit = true;
    });
    return hit;
  }
  // height of the tallest mapped building or generated house covering a point
  roofAt(x, z) {
    let h = 0;
    const B = this.s.bldPts;
    this.forItems(this.bldGrid, x, z, x, z, (b) => {
      const st = this.s.buildings[b * 4 + 2], n = this.s.buildings[b * 4 + 3];
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = B[(st + i) * 2], zi = B[(st + i) * 2 + 1], xj = B[(st + j) * 2], zj = B[(st + j) * 2 + 1];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) h = Math.max(h, (this.s.buildings[b * 4] >>> 8) / 10);
    });
    const FX = this.s.fillXZ, FD = this.s.fillDims;
    this.forItems(this.fillGrid, x - 30, z - 30, x + 30, z + 30, (f) => {
      const dx = x - FX[f * 2], dz = z - FX[f * 2 + 1], yaw = (FD[f * 4] / 256) * Math.PI * 2, c = Math.cos(yaw), sn = Math.sin(yaw);
      if (Math.abs(dx * c - dz * sn) < FD[f * 4 + 1] / 8 && Math.abs(dx * sn + dz * c) < FD[f * 4 + 2] / 8) h = Math.max(h, FD[f * 4 + 3] / 4 + 2 + 3);
    });
    return h;
  }
  fill(f) {
    const FX = this.s.fillXZ, FD = this.s.fillDims, FS = this.s.fillStyle[f];
    return { x: FX[f * 2], z: FX[f * 2 + 1], yaw: (FD[f * 4] / 256) * Math.PI * 2, w: FD[f * 4 + 1] / 4, d: FD[f * 4 + 2] / 4, h: FD[f * 4 + 3] / 4 + 2, style: FS & 15, seed: (FS >> 4) / 255 };
  }
}
