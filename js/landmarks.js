// landmarks.js — hand-built icons of the Riyadh skyline and old town.
import * as THREE from 'three';
import { PLACES, TH, rng, geo } from './geo.js';
import { Najdi, rectRing, inside } from './najdi.js';
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

// ---------- old Riyadh: Masmak, Deera Square, the Grand Mosque, Qasr Al-Hokm, Souq Al-Zal ----------
// Footprints are the OpenStreetMap outlines (metres east/south of the centroid given beside them).
function at(name, lat, lon) {
  const g = new THREE.Group(), p = geo(lat, lon);
  g.position.set(p.x, 0, p.z);
  g.name = name;
  return g;
}
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// unit normal of edge a→b pointing away from the ring
function outward(ring, a, b) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
  if (inside(ring, (a[0] + b[0]) / 2 + nx * 0.5, (a[1] + b[1]) / 2 + nz * 0.5)) { nx = -nx; nz = -nz; }
  return [nx, nz];
}
const yawOf = (a, b) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
function palmsIn(sink, ring, step, R, h = 8) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) if (inside(ring, x, z)) sinkPalmLocal(sink, x + (R() - 0.5) * 2, z + (R() - 0.5) * 2, h + R() * 3, R);
}

// Masmak Fortress (1895): mud walls, four round corner towers, the square watchtower and the palm-wood gate
function masmak() {
  const g = at('masmak', 24.631212, 46.71335);
  const nb = new Najdi();
  const ring = [[22.8, -29.5], [-38.7, -12], [-18.2, 31.8], [33.5, 14.5]];
  const Hw = 10.5, trim = '#a98157';
  for (let i = 0; i < 4; i++) {
    const a = ring[i], b = ring[(i + 1) % 4];
    nb.slab(a[0], a[1], b[0], b[1], 3.4, 0, Hw, 'fort');
    nb.merlons([a, b], Hw, trim, { closed: false, horns: false, step: 1.5 });
  }
  for (const [x, z] of ring) {
    const top = nb.drum(x, z, 5.4, 4.4, 0, 17.5, 'fort');
    nb.merlons(top, 17.5, trim, { horns: false, step: 1.4, w: 0.8, h: 1.1 });
  }
  const yaw = yawOf(ring[0], ring[1]);
  // the square watchtower (al-Mirabba'a)
  const mt = nb.prism(rectRing(6, -6, 9, 9, yaw), 0, 20, 'fort', { taper: 0.84 });
  nb.merlons(mt, 20, trim, { step: 1.3, w: 0.8, h: 1.1 });
  // courtyard, the mosque and the diwan along the walls
  nb.cap(Najdi.inset(ring, 3.5), 0.06, '#cdb48e');
  const inn = Najdi.inset(ring, 9);
  nb.prism(rectRing(...lerp2(inn[2], inn[3], 0.5), 26, 9, yawOf(inn[2], inn[3])), 0, 7.5, 'mud');
  nb.prism(rectRing(...lerp2(inn[0], inn[1], 0.45), 22, 8, yaw), 0, 6.5, 'mud');
  nb.prism(rectRing(...lerp2(inn[1], inn[2], 0.3), 8, 14, yawOf(inn[1], inn[2])), 0, 8, 'mud');
  // the gate in the west wall, facing Deera Square
  const B = ring[1], C = ring[2], [nx, nz] = outward(ring, B, C), m = lerp2(B, C, 0.55), gy = yawOf(B, C);
  nb.box(m[0] + nx * 2.1, m[1] + nz * 2.1, 7, 1.4, 0, 8.2, '#b08a5d', gy);
  nb.box(m[0] + nx * 2.85, m[1] + nz * 2.85, 3.6, 0.3, 0, 5.4, '#4a3020', gy);
  nb.box(m[0] + nx * 3.0, m[1] + nz * 3.0, 0.9, 0.12, 0.2, 2.0, '#2c1c10', gy);   // the wicket
  g.add(nb.build());
  return g;
}

// Deera Square between the fort and the mosque: paving, palms and the arcades of the Qasr Al-Hokm district
function deeraSquare() {
  const g = at('deera', 24.630749, 46.711878);
  const sq = [[-45.0, 21.2], [-25.8, 60.0], [-19.8, 56.7], [-9.7, 77.7], [14.0, 79.7], [17.4, 56.6], [6.5, 57.4], [1.9, 48.8], [55.0, 21.0], [47.6, 6.9], [78.6, -9.3], [73.9, -18.3], [66.5, -32.5], [38.9, -18.1], [1.1, -89.5], [-22.1, -85.9], [-14.5, -73.4], [-66.1, -47.8], [-76.6, -66.4], [-82.9, -63.2], [-38.9, 18.5]];
  const nb = new Najdi();
  nb.cap(sq, 0.09, '#dccdae');
  nb.cap(Najdi.inset(sq, 6), 0.11, '#e6d9bd');
  g.add(nb.build());
  const sink = localSink(), R = rng(1902);
  palmsIn(sink, Najdi.inset(sq, 4), 13, R);
  sinkMeshes(sink, g, bmat('#ffffff'));
  return g;
}

// The square minaret of the Grand Mosque: a tapering shaft, a balcony, the lantern and its cap
function minaret(nb, x, z, yaw) {
  nb.prism(rectRing(x, z, 6.6, 6.6, yaw), 0, 44, 'stone', { taper: 0.86 });
  nb.box(x, z, 7.4, 7.4, 44, 45.3, '#c8ab84', yaw);
  nb.merlons(rectRing(x, z, 7.1, 7.1, yaw), 45.3, '#c8ab84', { step: 1.2, w: 0.7, h: 0.9 });
  nb.prism(rectRing(x, z, 4.2, 4.2, yaw), 45.3, 51.5, 'stone');
  nb.prism(rectRing(x, z, 4.8, 4.8, yaw), 51.5, 54, 'stone', { taper: 0.08 });
  nb.box(x, z, 0.3, 0.3, 54, 57, '#d9b24a', yaw);
}
// Imam Turki bin Abdullah Grand Mosque (Rasem Badran, 1992): limestone walls, two minarets, bridges to the palace
function grandMosque() {
  const g = at('turkiMosque', 24.630913, 46.710863);
  const M = [[-97.4, -8.7], [-104.8, -25.9], [-106.0, -47.5], [9.2, -58.4], [80.5, -67.7], [88.2, -55.2], [36.6, -29.5], [26.0, -48.2], [19.8, -44.9], [63.8, 36.7], [57.7, 39.4], [47.1, 44.6], [-29.3, 83.1], [-43.0, 90.2], [-48.4, 92.1]];
  const nb = new Najdi(), yaw = yawOf(M[2], M[3]);
  nb.prism(M, 0, 15, 'stone');
  nb.merlons(M, 15, '#c2a57f', { step: 1.8 });
  // the prayer hall rises above the arcades, with rows of skylights on its roof
  const hall = [[-92, -12], [-98, -42], [6, -50], [14, -20], [-30, 60], [-44, 70]];
  nb.prism(hall, 15, 19, 'stone');
  nb.merlons(hall, 19, '#c2a57f', { step: 1.8 });
  for (let x = -90; x < 10; x += 11) for (let z = -44; z < 62; z += 11) if (inside(Najdi.inset(hall, 5), x, z)) nb.box(x, z, 3.2, 3.2, 19, 20.2, '#d8c4a0', yaw);
  minaret(nb, 14, -48, yaw);
  minaret(nb, 54, 33, yaw);
  // two covered bridges over Imam Turki Street to Qasr Al-Hokm
  for (const [ax, az, bx, bz] of [[31.8, 50.5, 52, 92], [8.9, 62, 29, 103.5]]) {
    nb.slab(ax, az, bx, bz, 6.5, 8.5, 14, 'stone');
    nb.box((ax + bx) / 2, (az + bz) / 2, 7.2, 1.4, 0, 8.5, '#c2a57f', yawOf([ax, az], [bx, bz]) + Math.PI / 2);
  }
  g.add(nb.build());
  return g;
}

// Qasr Al-Hokm, the Justice Palace (rebuilt 1988–92): limestone mass ringed by tall square towers
function qasrHokm() {
  const g = at('hokm', 24.629736, 46.711181);
  const H = [[-59.6, 1.7], [-57.9, 84.4], [40.5, 80.9], [41.9, 29.3], [60.8, -34.4], [50.7, -55.4], [44.7, -52.2], [34.1, -47.0], [-40.9, -8.0], [-54.7, -0.9]];
  const nb = new Najdi(), yaw = yawOf(H[1], H[2]);
  nb.prism(H, 0, 19, 'stone');
  nb.merlons(H, 19, '#c2a57f', { step: 1.8 });
  // an inner courtyard
  const ct = [[-40, 20], [-39, 64], [22, 62], [24, 26], [-6, 8]];
  nb.cap(ct, 19.05, '#b9a07c');
  const towers = [H[0], H[1], H[2], H[3], H[4], H[5], H[8], lerp2(H[1], H[2], 0.5), lerp2(H[0], H[1], 0.5), lerp2(H[7], H[8], 0.5), lerp2(H[3], H[4], 0.5)];
  for (const [x, z] of towers) {
    const t = nb.prism(rectRing(x, z, 9, 9, yaw), 0, 29, 'stone', { taper: 0.82 });
    nb.merlons(t, 29, '#c2a57f', { step: 1.3, w: 0.8, h: 1.1 });
  }
  g.add(nb.build());
  return g;
}

// Souq Al-Zal: lanes of low shops under cloth shades, south of Deera Square
function souqZal() {
  const g = at('zal', 24.62897, 46.71224);
  const nb = new Najdi(), R = rng(1901), yaw = TH;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (u, v) => [u * c + v * s, -u * s + v * c];
  const cloth = ['#c4523a', '#e0b04a', '#3f6f8f', '#ece3cf', '#7a3b5a'];
  for (let row = -2; row <= 2; row++) {
    const v = row * 13;
    for (let u = -48; u < 48;) {
      const L = 16 + Math.floor(R() * 3) * 8;
      const [x, z] = P(u + L / 2, v);
      const r = rectRing(x, z, L, 8, yaw);
      nb.prism(r, 0, 4, 'souq');
      if (R() < 0.35) { const up = rectRing(x, z, L - 4, 5, yaw); nb.prism(up, 4, 7.6, 'mud'); nb.merlons(up, 7.6, '#b8956a', { step: 1.6, horns: false }); }
      else nb.merlons(r, 4, '#b8956a', { step: 1.6, horns: false });
      u += L + 5;
    }
    // shades over the lane to the south of this row
    if (row < 2) for (let u = -46; u < 46; u += 7) { const [x, z] = P(u, v + 6.5); nb.box(x, z, 5.2, 5.4, 4.4, 4.5, cloth[Math.floor(R() * cloth.length)], yaw); }
  }
  nb.cap(rectRing(0, 0, 104, 70, yaw), 0.08, '#d2c2a2');
  g.add(nb.build());
  return g;
}

// Murabba Palace (1938): King Abdulaziz's two-storey mud palace around a colonnaded courtyard
function murabba() {
  const g = at('murabba', 24.646534, 46.709277);
  const nb = new Najdi(), trim = '#b08a5d';
  const ring = [[-20.7, -16.2], [-15.1, 30.2], [19.8, 26.1], [14.2, -20.3]];
  const court = Najdi.inset(ring, 10), yaw = yawOf(ring[0], ring[3]);
  nb.prism(ring, 0, 9.5, 'mud', { roof: false });
  nb.prism(court, 0, 9.5, 'mud', { roof: false, inward: true });
  nb.cap(ring, 9.5, '#b58d61', [court]);
  nb.merlons(ring, 9.5, trim, { step: 1.5 });
  nb.cap(court, 0.06, '#d2b98f');
  // two storeys of galleries round the courtyard
  const col = Najdi.inset(ring, 7.6);
  for (let i = 0; i < 4; i++) {
    const a = col[i], b = col[(i + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.round(L / 3.2));
    for (let k = 0; k < n; k++) { const [x, z] = lerp2(a, b, k / n); nb.box(x, z, 0.8, 0.8, 0, 9.5, '#c7a173', yaw); }
  }
  nb.cap(col, 4.6, '#b58d61', [court]);
  // corner buttresses and the entrance on the east side
  for (const [x, z] of ring) nb.merlons(nb.drum(x, z, 2.6, 2.1, 0, 11, 'mud', 12), 11, trim, { step: 1.2, w: 0.7, h: 0.9, horns: false });
  const [nx, nz] = outward(ring, ring[2], ring[3]), m = lerp2(ring[2], ring[3], 0.5), ey = yawOf(ring[2], ring[3]);
  nb.prism(rectRing(m[0] + nx * 2, m[1] + nz * 2, 9, 4, ey), 0, 10.5, 'mud');
  nb.box(m[0] + nx * 4.05, m[1] + nz * 4.05, 2.6, 0.2, 0, 3.8, '#4a3020', ey);
  g.add(nb.build());
  const sink = localSink(), R = rng(1938);
  for (const [x, z] of Najdi.inset(court, 3)) sinkPalmLocal(sink, x, z, 7 + R() * 2, R);
  sinkMeshes(sink, g, bmat('#ffffff'));
  return g;
}

// The Red Palace (1944): the kingdom's first reinforced-concrete building, red plaster with white trim
function redPalace() {
  const g = at('redPalace', 24.6423, 46.709066);
  const nb = new Najdi(), yaw = TH, white = '#efe6d6';
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (u, v) => [u * c + v * s, -u * s + v * c];
  const main = rectRing(0, 0, 66, 34, yaw);
  nb.prism(main, 0, 13, 'red');
  nb.merlons(main, 13, white, { step: 1.5, w: 0.8, h: 1.0 });
  const top = rectRing(0, 0, 38, 22, yaw);
  nb.prism(top, 13, 17.5, 'red');
  nb.merlons(top, 17.5, white, { step: 1.5, w: 0.8, h: 1.0 });
  // the entrance portico, columns and a balcony over it
  const [px, pz] = P(0, 21);
  const por = rectRing(px, pz, 24, 8, yaw);
  nb.cap(por, 8.4, white);
  nb.box(px, pz, 24.6, 8.6, 7.6, 8.4, white, yaw);
  for (let u = -11; u <= 11; u += 3.6) { const [x, z] = P(u, 24.4); nb.box(x, z, 0.9, 0.9, 0, 7.6, white, yaw); }
  nb.merlons(por, 8.4, white, { step: 1.4, w: 0.7, h: 0.8, horns: false });
  // the two wings
  for (const side of [-1, 1]) { const [x, z] = P(side * 40, -4); const w = rectRing(x, z, 14, 26, yaw); nb.prism(w, 0, 10, 'red'); nb.merlons(w, 10, white, { step: 1.5, w: 0.8, h: 1.0 }); }
  nb.cap(rectRing(0, 8, 130, 92, yaw), 0.07, '#8a9a52');
  nb.cap(rectRing(...P(0, 40), 10, 40, yaw), 0.09, '#d8ccb4');
  g.add(nb.build());
  const sink = localSink(), R = rng(1944);
  for (let u = -58; u <= 58; u += 9) for (const v of [-44, 52]) { const [x, z] = P(u, v); sinkPalmLocal(sink, x, z, 8 + R() * 3, R); }
  for (let v = 28; v <= 52; v += 8) for (const u of [-8, 8]) { const [x, z] = P(u, v); sinkPalmLocal(sink, x, z, 7 + R() * 2, R); }
  sinkMeshes(sink, g, bmat('#ffffff'));
  return g;
}

// ---------- National Museum (1999): limestone halls behind the great curved west wall ----------
function museum() {
  const g = at('museum', 24.647357, 46.710692);
  const ring = [[-46.3, 34.9], [-45.7, 8.0], [-46.7, -5.1], [-47.7, -16.5], [-49.5, -30.7], [-52.1, -44.3], [-55.9, -57.9], [-60.5, -71.8], [-67.0, -86.5], [-74.9, -101.2], [-90.7, -126.5], [-85.4, -131.1], [-64.9, -98.7], [44.0, -127.1], [54.0, -73.4], [60.8, -75.3], [63.9, -61.9], [53.4, -59.5], [52.3, -64.9], [1.0, -52.4], [10.3, -18.7], [56.7, -27.3], [63.8, 0.8], [62.4, 1.1], [71.2, 36.6], [73.3, 36.1], [80.3, 64.1], [-9.6, 81.3], [-3.0, 149.1], [95.4, 125.3], [101.3, 152.4], [4.0, 177.4], [3.6, 181.9], [-4.9, 182.5], [-20.7, 17.0], [-41.6, 20.2], [-42.1, 27.4], [-42.4, 34.8]];
  const courts = [[[-5.1, -102.1], [-26.4, -96.6], [-22.6, -82.1], [-1.3, -87.6]], [[34.6, 8.2], [19.4, 12.2], [28.0, 44.7], [43.2, 40.7]]];
  const nb = new Najdi();
  nb.prism(ring, 0, 17, 'museum', { roof: false });
  for (const c of courts) { nb.prism(c, 0, 17, 'museum', { roof: false, inward: true }); nb.cap(c, 0.06, '#d6c3a0'); }
  nb.cap(ring, 17, '#d8c5a4', courts);
  // the curved wall rises from the entrance towards its southern tip, like the face of a dune
  const curve = ring.slice(0, 11);
  for (let i = 0; i < curve.length - 1; i++) {
    const t = i / (curve.length - 2), [ax, az] = curve[i], [bx, bz] = curve[i + 1];
    nb.slab(ax - 1.2, az, bx - 1.2, bz, 2.4, 0, 19 + 9 * t, 'museum');
  }
  g.add(nb.build());
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
// King Fahd National Library (2013): the old domed library wrapped in a cube of white fabric diamonds
function library() {
  const g = at('library', 24.685663, 46.686448);
  const ring = [[92.8, 39.0], [33.8, -94.4], [-92.8, -39.0], [-33.8, 94.4]];
  const nb = new Najdi();
  nb.prism(ring, 0, 30, 'membrane', { roof: false });
  nb.cap(ring, 30, '#e4e1da', [Najdi.inset(ring, 34)]);
  const glass = Najdi.inset(ring, 34);
  nb.prism(glass, 24, 30, 'membrane', { roof: false, inward: true });
  nb.cap(glass, 24, '#9aa5aa');
  nb.drum(0, 0, 33, 33, 24, 33, 'museum', 32);
  g.add(nb.build());
  const dome = new THREE.Mesh(new THREE.SphereGeometry(31, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 33, 0), new THREE.MeshStandardMaterial({ color: '#e9eef0', roughness: 0.3, metalness: 0.3 }));
  dome.castShadow = true;
  g.add(dome);
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
  // the KAFD towers other than PIF Tower come from OpenStreetMap footprints
  const list = [kingdomCentre(), faisaliah(), kafd(), rafal(), masmak(), deeraSquare(), grandMosque(), qasrHokm(), souqZal(), murabba(), redPalace(), museum(), library(), waterTower(), tvTower(), moi(), turaif(), wadiGroves(), tuwaiq()];
  for (const o of list) scene.add(o);
  return list;
}
// Colliders for walking/driving (world circles)
export const LANDMARK_COLLIDERS = [
  ['kingdom', 62, 302], ['faisaliah', 34, 267], ['rafal', 30, 308], ['masmak', 36, 18], ['water', 8, 61], ['tv', 9, 170], ['moi', 30, 64], ['kafd', 30, 385],
  ['turkiMosque', 52, 15], ['library', 70, 30], ['hokm', 42, 19], ['murabba', 21, 10], ['redPalace', 30, 13]
].map(([k, r, h]) => ({ x: PLACES[k].x, z: PLACES[k].z, r, h }));
