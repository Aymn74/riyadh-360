// player.js — the three ways to get around: on foot (thobe & shemagh), a white Land Cruiser, a helicopter.
import * as THREE from 'three';
import { TH } from './geo.js';
import { F } from './osm.js';
import { buildCarGeometry, makeCarMaterial } from './traffic.js';
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

function buildCar() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(buildCarGeometry('suv'), makeCarMaterial());
  m.material.color.set('#f4f4f2');
  m.castShadow = true;
  g.add(m);
  // rear plate: Saudi format, KSA / السعودية
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 96);
  x.strokeStyle = '#111'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 92);
  x.fillStyle = '#111'; x.font = '700 30px sans-serif'; x.textAlign = 'center';
  x.fillText('٧٤٢٠  ر ي ض', 100, 40); x.fillText('7420  R Y D', 100, 82);
  x.fillStyle = '#0a7a3a'; x.fillRect(206, 4, 46, 88);
  x.fillStyle = '#fff'; x.font = '700 16px sans-serif'; x.fillText('KSA', 229, 82);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
  plate.position.set(-2.49, 0.85, 0); plate.rotation.y = -Math.PI / 2;
  g.add(plate);
  // headlight cones at night
  const spot = new THREE.SpotLight('#fff3dc', 0, 90, 0.5, 0.5, 1.2);
  spot.position.set(2.4, 1.0, 0);
  spot.target.position.set(20, 0, 0);
  g.add(spot, spot.target);
  g.userData.spot = spot;
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
    const fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0) + (input.ay || 0);
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
      // brakes: ~9 m/s2, so 100 km/h stops in about 40 m
      else if (fwd < -0.05) acc = this.speed > 0.5 ? 9 * fwd : 2.5 * fwd;
      // coasting: rolling resistance plus air drag (100 km/h rolls on for about half a minute)
      else acc = -Math.sign(this.speed) * Math.min(v0 / Math.max(dt, 1e-3), 0.25 + 0.0007 * v0 * v0);
      this.speed = THREE.MathUtils.clamp(this.speed + acc * dt, -6, Math.max(maxV, this.speed));
      if (this.speed > maxV) this.speed += (maxV - this.speed) * Math.min(1, dt * 0.8);
      this.lastAcc = acc;
      this.steer += (turn - this.steer) * Math.min(1, dt * (Math.abs(turn) > Math.abs(this.steer) ? 4 : 7));
      const v = Math.abs(this.speed);
      // turning circle: 5.8 m at walking pace (a Land Cruiser), widened by tyre grip (7 m/s2 sideways) at speed
      const radius = Math.max(5.8, (v * v) / 7);
      this.yaw += this.steer * dt * (v / radius) * Math.sign(this.speed || 1);
      if (Math.abs(turn) < 0.12 && v > 6 && this.osm && this.gy < 2) this.laneKeep(dt);
      this.move(dt);
      const m = this.models.car;
      this.gy += (this.groundAt(p.x, p.z) - this.gy) * Math.min(1, dt * 10);
      // body roll and pitch for weight
      this.pitch = (this.pitch || 0) + ((acc * 0.003) - (this.pitch || 0)) * Math.min(1, dt * 4);
      m.position.set(p.x, this.gy, p.z);
      m.rotation.set(0, this.yaw, 0);
      m.rotateZ(THREE.MathUtils.clamp(this.pitch, -0.03, 0.03));
      m.rotateX(-this.steer * Math.min(1, v / 25) * 0.035);
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
  // when the driver is not steering, ease the heading onto the road direction (within 25 degrees)
  laneKeep(dt) {
    const hit = this.osm.nearestRoad(this.pos.x, this.pos.z, 4);
    if (!hit || hit.dist > 0) return;
    let ry = Math.atan2(-hit.dirz, hit.dirx);
    let d = Math.atan2(Math.sin(ry - this.yaw), Math.cos(ry - this.yaw));
    if (Math.abs(d) > Math.PI / 2) { ry += Math.PI; d = Math.atan2(Math.sin(ry - this.yaw), Math.cos(ry - this.yaw)); }
    if (Math.abs(d) < 0.44) this.yaw += d * Math.min(1, dt * 1.2);
  }
  get height() { return this.mode === 'heli' ? this.alt : this.gy + (this.mode === 'car' ? 1.3 : 1.6 + this.alt); }
}
