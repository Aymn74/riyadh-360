// guide.js — a tourist guide: floating landmark labels, an info card, road routing with a guidance arrow, and arrival notes.
import * as THREE from 'three';
import { PLACES } from './geo.js';
import { F, RC } from './osm.js';

// [key, label height above ground (m), short description]
const SPOTS = [
  ['kingdom', 302, 'ناطحة سحاب بارتفاع 302 م اكتملت عام 2002، ويعلو قمتها جسر زجاجي معلّق يطل على المدينة.'],
  ['faisaliah', 267, 'أول ناطحة سحاب في المملكة، اكتملت عام 2000 بارتفاع 267 م، وتعلوها كرة زجاجية فيها مطعم.'],
  ['kafd', 385, 'مركز الملك عبدالله المالي، وفيه برج صندوق الاستثمارات العامة، أعلى مباني الرياض بارتفاع 385 م.'],
  ['rafal', 308, 'برج سكني بارتفاع 308 م على طريق الملك فهد شمالاً، اكتمل عام 2014.'],
  ['masmak', 22, 'قلعة من الطين بُنيت نحو عام 1865، واسترداد الملك عبدالعزيز لها عام 1902 كان بداية توحيد المملكة.'],
  ['museum', 24, 'افتُتح عام 1999 في مركز الملك عبدالعزيز التاريخي بالمربع، ويروي تاريخ الجزيرة العربية والمملكة.'],
  ['water', 64, 'برج مياه الرياض بشكله المميز، من معالم السبعينيات قرب حي المربع.'],
  ['tv', 172, 'برج التلفزيون بارتفاع 170 م، افتُتح عام 1978.'],
  ['moi', 66, 'مقر وزارة الداخلية بتصميمه الشبيه بهرم مقلوب، من أبرز المباني المعمارية في الرياض.'],
  ['library', 32, 'مكتبة الملك فهد الوطنية، تكسوها أشرعة من القماش مستوحاة من الخيمة العربية.'],
  ['turaif', 26, 'عاصمة الدولة السعودية الأولى في الدرعية، ومسجّلة في قائمة التراث العالمي لليونسكو منذ 2010.'],
  ['tahlia', 14, 'من أشهر شوارع الرياض للمقاهي والمطاعم والتسوق.'],
  ['malazPark', 14, 'منتزه كبير في الملز يشتهر بنوافيره الراقصة.'],
  ['salam', 14, 'من أكبر الحدائق في وسط الرياض، وفيها بحيرة واسعة.']
];
export const GUIDE = SPOTS.map(([key, h, desc]) => ({ key, h, desc, ...PLACES[key] }));

const DRIVE = new Set([RC.motorway, RC.trunk, RC.primary, RC.secondary, RC.tertiary, RC.unclassified, RC.residential, RC.living, RC.mlink, RC.link]);

// ---------------------------------------------------------------- routing over the road graph (A*)
class Router {
  constructor(osm) {
    this.osm = osm;
    const s = osm.s;
    this.ok = !!(s.rNodes && s.rEdges);
    if (!this.ok) return;
    const N = s.rNodes.length / 2, E = s.rEdges.length / 3;
    this.N = N;
    // CSR adjacency, both directions unless one-way
    const deg = new Uint32Array(N + 1);
    for (let e = 0; e < E; e++) {
      const u = s.rEdges[e * 3], v = s.rEdges[e * 3 + 1], r = s.rEdges[e * 3 + 2];
      deg[u]++; if (!(osm.flags(r) & F.oneway)) deg[v]++;
    }
    const off = new Uint32Array(N + 1);
    for (let i = 0; i < N; i++) off[i + 1] = off[i] + deg[i];
    const to = new Uint32Array(off[N]), edge = new Int32Array(off[N]), fill = off.slice(0, N);
    for (let e = 0; e < E; e++) {
      const u = s.rEdges[e * 3], v = s.rEdges[e * 3 + 1], r = s.rEdges[e * 3 + 2];
      to[fill[u]] = v; edge[fill[u]++] = e + 1;                                         // +e: forward along the way
      if (!(osm.flags(r) & F.oneway)) { to[fill[v]] = u; edge[fill[v]++] = -(e + 1); }   // -e: against it
    }
    Object.assign(this, { off, to, edge });
    // edges of each way, to find where a position sits
    this.byRoad = new Map();
    for (let e = 0; e < E; e++) { const r = s.rEdges[e * 3 + 2]; let l = this.byRoad.get(r); if (!l) this.byRoad.set(r, (l = [])); l.push(e); }
  }
  // where a point meets the network: the edge it lies on and the distance along its way
  attach(x, z) {
    const osm = this.osm;
    const hit = osm.nearestRoad(x, z, 150, (r) => DRIVE.has(osm.cls(r)) && this.byRoad.has(r)) || osm.nearestRoad(x, z, 600, (r) => DRIVE.has(osm.cls(r)) && this.byRoad.has(r));
    if (!hit) return null;
    const A = osm.s.rAlong;
    for (const e of this.byRoad.get(hit.road)) {
      const a0 = A[e * 2], a1 = A[e * 2 + 1];
      if (hit.along >= Math.min(a0, a1) - 0.5 && hit.along <= Math.max(a0, a1) + 0.5) return { e, r: hit.road, along: hit.along, x: hit.x, z: hit.z };
    }
    return null;
  }
  edgeLen(e) { const A = this.osm.s.rAlong; return Math.abs(A[e * 2 + 1] - A[e * 2]); }
  route(x0, z0, x1, z1) {
    if (!this.ok) return null;
    const a = this.attach(x0, z0), b = this.attach(x1, z1);
    if (!a || !b) return null;
    const s = this.osm.s, A = s.rAlong, NP = s.rNodes;
    if (a.e === b.e && (b.along >= a.along || !(this.osm.flags(a.r) & F.oneway))) return { pieces: [[a.r, a.along, b.along]], end: b };
    const N = this.N, g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), via = new Int32Array(N);
    const heap = [], push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const h = (n) => Math.hypot(NP[n * 2] - x1, NP[n * 2 + 1] - z1);
    // start: both ends of the start edge (only forwards on one-way roads)
    const ua = s.rEdges[a.e * 3], va = s.rEdges[a.e * 3 + 1], a0 = A[a.e * 2], a1 = A[a.e * 2 + 1];
    const startCost = [[va, Math.abs(a1 - a.along), 1]];
    if (!(this.osm.flags(a.r) & F.oneway)) startCost.push([ua, Math.abs(a.along - a0), -1]);
    for (const [n, c] of startCost) { if (c < g[n]) { g[n] = c; from[n] = -2; push(n, c + h(n)); } }
    // goal: either end of the goal edge, plus the remaining piece
    const ub = s.rEdges[b.e * 3], vb = s.rEdges[b.e * 3 + 1], b0 = A[b.e * 2], b1 = A[b.e * 2 + 1];
    const goal = new Map([[ub, Math.abs(b.along - b0)]]);
    if (!(this.osm.flags(b.r) & F.oneway)) goal.set(vb, Math.abs(b1 - b.along));
    let best = Infinity, bestN = -1, it = 0;
    while (heap.length && it++ < 400000) {
      const [f, n] = pop();
      if (f >= best) break;
      if (goal.has(n) && g[n] + goal.get(n) < best) { best = g[n] + goal.get(n); bestN = n; }
      for (let k = this.off[n]; k < this.off[n + 1]; k++) {
        const m = this.to[k], e = Math.abs(this.edge[k]) - 1;
        // highways are preferred a little, as a driver would
        const c = this.osm.cls(s.rEdges[e * 3 + 2]), w = c <= RC.trunk ? 0.8 : c <= RC.secondary ? 0.9 : 1;
        const ng = g[n] + this.edgeLen(e) * w;
        if (ng < g[m]) { g[m] = ng; from[m] = n; via[m] = this.edge[k]; push(m, ng + h(m) * 0.8); }
      }
    }
    if (bestN < 0) return null;
    // walk back
    const pieces = [];
    const endAlong = bestN === ub ? b0 : b1;
    pieces.push([b.r, endAlong, b.along]);
    let n = bestN;
    while (from[n] >= 0) {
      const sgn = via[n] > 0 ? 1 : -1, e = Math.abs(via[n]) - 1;
      const r = s.rEdges[e * 3 + 2], e0 = A[e * 2], e1 = A[e * 2 + 1];
      pieces.push(sgn > 0 ? [r, e0, e1] : [r, e1, e0]);
      n = from[n];
    }
    pieces.push(n === va ? [a.r, a.along, a1] : [a.r, a.along, a0]);
    pieces.reverse();
    return { pieces, end: b };
  }
}

// points of a way between two distances along it (in either direction), with deck/tunnel height
function slice(osm, r, a, b, out) {
  const s = osm.s, st = s.roads[r * 4 + 2], n = s.roads[r * 4 + 3], P = s.roadPts, L = osm.rLen;
  const at = (d) => {
    let i = 0; while (i < n - 2 && L[st + i + 1] < d) i++;
    const l0 = L[st + i], l1 = L[st + i + 1], t = Math.max(0, Math.min(1, (d - l0) / Math.max(1e-6, l1 - l0)));
    return [P[(st + i) * 2] + (P[(st + i + 1) * 2] - P[(st + i) * 2]) * t, P[(st + i) * 2 + 1] + (P[(st + i + 1) * 2 + 1] - P[(st + i) * 2 + 1]) * t, osm.roadY(r, d)];
  };
  const lo = Math.min(a, b), hi = Math.max(a, b), mid = [];
  for (let i = 0; i < n; i++) { const d = L[st + i]; if (d > lo && d < hi) mid.push([P[(st + i) * 2], P[(st + i) * 2 + 1], osm.roadY(r, d)]); }
  if (a > b) mid.reverse();
  out.push(at(a), ...mid, at(b));
}

// ---------------------------------------------------------------- UI
const CSS = `
#guide-labels { position: fixed; inset: 0; pointer-events: none; z-index: 5; overflow: hidden; }
.g-pin { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); pointer-events: auto; cursor: pointer; display: grid; justify-items: center; gap: 2px; border: 0; background: none; padding: 0; color: #fff; font: inherit; will-change: transform; }
.g-pin b { background: rgba(20,16,12,0.72); border: 1px solid rgba(240,200,120,0.55); border-radius: 999px; padding: 3px 10px 4px; font-size: 13px; font-weight: 700; white-space: nowrap; backdrop-filter: blur(6px); }
.g-pin small { font-size: 11.5px; font-weight: 700; color: #f3d79a; text-shadow: 0 1px 2px #000, 0 0 6px #000; }
.g-pin i { width: 2px; height: 18px; background: linear-gradient(#f3d79a, transparent); }
.g-pin.dest b { background: #0d6efd; border-color: #fff; }
#guide-card { position: fixed; z-index: 30; right: 16px; bottom: 16px; width: min(360px, calc(100vw - 32px)); background: rgba(26,21,16,0.94); color: #fbf6ec; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 14px 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.45); backdrop-filter: blur(10px); }
#guide-card h3 { margin: 0; font-size: 19px; } #guide-card .en { font-size: 12.5px; opacity: .75; direction: ltr; text-align: right; }
#guide-card p { margin: 10px 0 12px; font-size: 14px; line-height: 1.7; }
#guide-card .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#guide-card .dist { margin-inline-start: auto; font-size: 12.5px; opacity: .8; }
.g-btn { height: 38px; padding: 0 14px; border-radius: 9px; border: 0; cursor: pointer; font: 600 14px inherit; font-family: inherit; }
.g-go { background: #1f9d63; color: #fff; } .g-tour { width: 100%; margin-top: 10px; height: 44px; font-size: 15px; } .g-alt { background: rgba(255,255,255,0.1); color: #fbf6ec; }
.g-x { position: absolute; top: 8px; left: 8px; width: 32px; height: 32px; border-radius: 8px; border: 0; background: transparent; color: #fbf6ec; font-size: 20px; cursor: pointer; }
#guide-list { max-height: 50vh; overflow: auto; display: grid; gap: 4px; margin-top: 8px; }
#guide-list button { display: flex; justify-content: space-between; gap: 10px; text-align: right; background: rgba(255,255,255,0.05); color: #fbf6ec; border: 0; border-radius: 8px; padding: 9px 10px; cursor: pointer; font: inherit; font-size: 14px; }
#guide-list span { opacity: .7; font-size: 12px; direction: ltr; }
#guide-nav { position: fixed; z-index: 12; left: 0; right: 0; margin: 0 auto; width: fit-content; top: calc(env(safe-area-inset-top, 0px) + 84px); display: flex; align-items: center; gap: 10px; background: #0d5ea8; color: #fff; border: 2px solid #fff; border-radius: 12px; padding: 6px 8px 6px 14px; box-shadow: 0 6px 20px rgba(0,0,0,0.35); max-width: calc(100vw - 32px); }
#guide-nav svg { width: 34px; height: 34px; flex: none; transition: transform .15s linear; }
#guide-nav .t { display: grid; line-height: 1.25; min-width: 0; } #guide-nav .t b { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } #guide-nav .t span { font-size: 12px; opacity: .9; }
#guide-nav button { width: 30px; height: 30px; border-radius: 8px; border: 0; background: rgba(255,255,255,0.15); color: #fff; font-size: 16px; cursor: pointer; }
#guide-toast { position: fixed; z-index: 13; left: 0; right: 0; margin: 0 auto; top: calc(env(safe-area-inset-top, 0px) + 150px); width: min(380px, calc(100vw - 32px)); background: rgba(26,21,16,0.92); color: #fbf6ec; border-radius: 12px; border: 1px solid rgba(243,215,154,0.5); padding: 10px 14px; font-size: 13.5px; line-height: 1.6; box-shadow: 0 8px 26px rgba(0,0,0,0.4); transition: opacity .4s; }
#guide-toast b { color: #f3d79a; display: block; font-size: 15px; }
@media (pointer: coarse) and (orientation: portrait) { #guide-nav { top: calc(env(safe-area-inset-top, 0px) + 112px); } #guide-toast { top: calc(env(safe-area-inset-top, 0px) + 170px); } #guide-card { right: 12px; left: 12px; width: auto; bottom: 12px; } }
`;
const fmtDist = (m) => (m < 1000 ? Math.round(m / 10) * 10 + ' م' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' كم');

export class Guide {
  constructor({ scene, camera, osm, player, teleport, startTour }) {
    Object.assign(this, { scene, camera, osm, player, teleport, startTour });
    this.router = null;   // built when the routing graph first arrives
    this.route = null; this.dest = null; this.seen = new Map(); this.t = 0;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.layer = document.createElement('div'); this.layer.id = 'guide-labels'; document.body.appendChild(this.layer);
    this.pins = GUIDE.map((g) => {
      const b = document.createElement('button'); b.className = 'g-pin'; b.type = 'button';
      b.innerHTML = `<b>${g.ar}</b><small></small><i></i>`;
      b.addEventListener('click', () => this.open(g));
      this.layer.appendChild(b);
      return { g, el: b, dist: b.querySelector('small') };
    });
    this.nav = document.createElement('div'); this.nav.id = 'guide-nav'; this.nav.hidden = true;
    this.nav.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 21 12 16.5 4 21Z" fill="#fff"/></svg><div class="t"><b></b><span></span></div><button type="button" aria-label="إلغاء الإرشاد">✕</button>`;
    this.nav.querySelector('button').addEventListener('click', () => this.clear());
    document.body.appendChild(this.nav);
    this.toast = document.createElement('div'); this.toast.id = 'guide-toast'; this.toast.hidden = true; document.body.appendChild(this.toast);
    this.card = document.createElement('div'); this.card.id = 'guide-card'; this.card.hidden = true; document.body.appendChild(this.card);
    // the route on the road: a glowing ribbon
    this.mat = new THREE.MeshBasicMaterial({ color: '#2fb4ff', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = null;
  }
  // ---- list of all places, nearest first
  openList() {
    const p = this.player.pos;
    const items = GUIDE.map((g) => ({ g, d: Math.hypot(g.x - p.x, g.z - p.z) })).sort((a, b) => a.d - b.d);
    this.card.innerHTML = `<button class="g-x" type="button" aria-label="إغلاق">✕</button><h3>دليل الرياض</h3><div class="en">Riyadh guide · ${GUIDE.length} places</div>
      <button class="g-btn g-go g-tour" type="button">▶ جولة سياحية تلقائية · Guided tour</button><div id="guide-list"></div>`;
    this.card.querySelector('.g-tour').addEventListener('click', () => { this.card.hidden = true; this.clear(); this.startTour?.(); });
    const list = this.card.querySelector('#guide-list');
    for (const { g, d } of items) {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<b>${g.ar}</b><span>${fmtDist(d)}</span>`;
      b.addEventListener('click', () => this.open(g));
      list.appendChild(b);
    }
    this.card.querySelector('.g-x').addEventListener('click', () => (this.card.hidden = true));
    this.card.hidden = false;
  }
  open(g) {
    const p = this.player.pos, d = Math.hypot(g.x - p.x, g.z - p.z);
    this.card.innerHTML = `<button class="g-x" type="button" aria-label="إغلاق">✕</button><h3>${g.ar}</h3><div class="en">${g.en}</div><p>${g.desc}</p>
      <div class="row"><button class="g-btn g-go" type="button" data-a="go">خذني إليه</button><button class="g-btn g-alt" type="button" data-a="jump">انتقال فوري</button><span class="dist">على بعد ${fmtDist(d)}</span></div>`;
    this.card.querySelector('.g-x').addEventListener('click', () => (this.card.hidden = true));
    this.card.querySelector('[data-a="go"]').addEventListener('click', () => { this.card.hidden = true; this.go(g); });
    this.card.querySelector('[data-a="jump"]').addEventListener('click', () => { this.card.hidden = true; this.clear(); this.teleport(g.key); });
    this.card.hidden = false;
  }
  async go(g) {
    this.dest = g; this.route = null; this.build([]);
    this.nav.hidden = false;
    this.nav.querySelector('b').textContent = 'إلى ' + g.ar;
    if (!this.router) {
      this.nav.querySelector('span').textContent = 'جارٍ تحميل شبكة الطرق…';
      this.loading = true;
      const ok = await this.osm.loadExtra('riyadh-route.bin').catch(() => false);
      this.loading = false;
      this.router = new Router(this.osm);
      if (!ok || !this.router.ok) this.nav.querySelector('span').textContent = 'تعذّر تحميل الطرق، اتبع السهم';
    }
    if (this.dest === g && this.player.mode !== 'heli') this.reroute();
  }
  clear() { this.dest = null; this.route = null; this.build([]); this.nav.hidden = true; }
  reroute() {
    if (!this.router || !this.dest) return;
    const p = this.player.pos, g = this.dest;
    const r = this.router.route(p.x, p.z, g.x, g.z);
    this.route = null;
    if (r) {
      const pts = [];
      for (const [road, a, b] of r.pieces) slice(this.osm, road, a, b, pts);
      // drop repeats, accumulate distance
      const clean = [], acc = [];
      let d = 0;
      for (const q of pts) { const l = clean[clean.length - 1]; if (l && Math.hypot(q[0] - l[0], q[1] - l[1]) < 0.5) continue; if (l) d += Math.hypot(q[0] - l[0], q[1] - l[1]); clean.push(q); acc.push(d); }
      this.route = { pts: clean, acc, idx: 0 };
    }
    this.build(this.route ? this.route.pts : []);
    this.lastReroute = performance.now();
  }
  build(pts) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (pts.length < 2) return;
    const pos = [], idx = [], hw = 1.4;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const y = pts[i][2] + 0.3;
      pos.push(pts[i][0] + dz * hw, y, pts[i][1] - dx * hw, pts[i][0] - dz * hw, y, pts[i][1] + dx * hw);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.renderOrder = 4; this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  note(title, text) {
    this.toast.innerHTML = `<b>${title}</b>${text}`;
    this.toast.hidden = false; this.toast.style.opacity = 1;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { this.toast.style.opacity = 0; setTimeout(() => (this.toast.hidden = true), 450); }, 8000);
  }
  // drawn on the minimap and the atlas
  drawOn(ctx, toScreen, scale) {
    if (this.route) {
      ctx.save(); ctx.strokeStyle = '#2fb4ff'; ctx.lineWidth = Math.max(3, 6 * scale); ctx.lineJoin = ctx.lineCap = 'round'; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const P = this.route.pts;
      for (let i = this.route.idx; i < P.length; i++) { const s = toScreen(P[i][0], P[i][1]); if (i === this.route.idx) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]); }
      ctx.stroke(); ctx.restore();
    }
    if (this.dest) {
      const s = toScreen(this.dest.x, this.dest.z);
      ctx.fillStyle = '#0d6efd'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  update(dt, hide) {
    const cam = this.camera, p = this.player.pos, W = innerWidth, H = innerHeight;
    const v = new THREE.Vector3();
    // labels: nearest first, never more than six, none behind the camera
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const shown = [];
    for (const pin of this.pins) {
      const g = pin.g, d = Math.hypot(g.x - cam.position.x, g.z - cam.position.z);
      const range = g.h > 150 ? 12000 : g.h > 50 ? 5000 : 2500;
      const isDest = this.dest === g;
      if (hide || (d > range && !isDest) || d < 30) { pin.el.hidden = true; continue; }
      v.set(g.x, Math.min(g.h + 6, cam.position.y + d * 0.6), g.z);
      const ahead = (v.x - cam.position.x) * fwd.x + (v.y - cam.position.y) * fwd.y + (v.z - cam.position.z) * fwd.z;
      v.project(cam);
      if (ahead <= 0 || Math.abs(v.x) > 1.05 || v.y > 1.05 || v.y < -1.05) { pin.el.hidden = true; continue; }
      shown.push({ pin, d, x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, isDest });
    }
    shown.sort((a, b) => (b.isDest - a.isDest) || a.d - b.d);
    // no two labels on top of each other: lift a label above the ones already placed, or leave it out
    // keep clear of the top bar and the guidance banner
    const top = (document.querySelector('#hud .hud-row')?.getBoundingClientRect().bottom || 60) + 6;
    const boxes = [];
    if (!this.nav.hidden) { const r = this.nav.getBoundingClientRect(); boxes.push({ x: (r.left + r.right) / 2, y: r.bottom + 4, w: r.width + 8, h: r.height + 8 }); }
    shown.forEach((s, i) => {
      const el = s.pin.el;
      const w = s.pin.g.ar.length * 7.5 + 28, h = 44;
      let y = Math.max(top + h, s.y), ok = false;
      // boxes are anchored at their bottom edge
      const hit = (b) => Math.abs(b.x - s.x) < (b.w + w) / 2 && y > b.y - (b.h || h) && y - h < b.y;
      for (let k = 0; k < 4 && !ok; k++) { ok = !boxes.some(hit); if (!ok) y -= h; }
      if (i >= 6 || !ok || y < top + h) { el.hidden = true; return; }
      boxes.push({ x: s.x, y, w, h });
      el.hidden = false;
      el.classList.toggle('dest', s.isDest);
      el.style.transform = `translate(${s.x}px, ${y}px) translate(-50%, -100%)`;
      el.style.opacity = s.isDest ? 1 : Math.max(0.55, 1 - s.d / 14000);
      s.pin.dist.textContent = fmtDist(Math.hypot(s.pin.g.x - p.x, s.pin.g.z - p.z));
    });
    // arriving near a landmark: a short note, once in a while
    this.t += dt;
    if (this.t > 0.5) {
      this.t = 0;
      for (const g of GUIDE) {
        const d = Math.hypot(g.x - p.x, g.z - p.z), near = g.h > 150 ? 500 : 250;
        if (d < near && (!this.seen.has(g.key) || performance.now() - this.seen.get(g.key) > 300000)) {
          this.seen.set(g.key, performance.now());
          this.note(g.ar, g.desc);
        }
      }
    }
    // guidance
    if (!this.dest || this.loading) return;
    const g = this.dest, left = Math.hypot(g.x - p.x, g.z - p.z);
    if (left < (g.h > 150 ? 220 : 140)) { this.note('وصلت إلى ' + g.ar, g.desc); this.seen.set(g.key, performance.now()); this.clear(); return; }
    let tx = g.x, tz = g.z, remain = left;
    const R = this.route;
    if (R && this.player.mode !== 'heli') {
      // follow progress along the route; reroute when far from it
      let bi = R.idx, bd = Infinity;
      for (let i = Math.max(0, R.idx - 5); i < Math.min(R.pts.length, R.idx + 60); i++) { const q = R.pts[i], dd = (q[0] - p.x) ** 2 + (q[1] - p.z) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      R.idx = bi;
      if (Math.sqrt(bd) > 45 && performance.now() - this.lastReroute > 2500) { this.reroute(); return; }
      let j = bi; while (j < R.pts.length - 1 && R.acc[j] - R.acc[bi] < 45) j++;
      tx = R.pts[j][0]; tz = R.pts[j][1];
      remain = R.acc[R.acc.length - 1] - R.acc[bi] + Math.sqrt(bd);
    } else if (!R && this.player.mode !== 'heli' && performance.now() - (this.lastReroute || 0) > 3000) { this.reroute(); }
    const camYaw = Math.atan2(-fwd.z, fwd.x), to = Math.atan2(-(tz - p.z), tx - p.x);
    const rel = Math.atan2(Math.sin(camYaw - to), Math.cos(camYaw - to));
    this.nav.querySelector('svg').style.transform = `rotate(${rel * 180 / Math.PI}deg)`;
    const speed = this.player.mode === 'heli' ? 50 : this.player.mode === 'car' ? 14 : 1.4;
    this.nav.querySelector('span').textContent = `${fmtDist(remain)} · نحو ${Math.max(1, Math.round(remain / speed / 60))} د`;
  }
}
