// materials.js — procedural facade shader for every instanced box, plus ground, sky and vegetation.
import * as THREE from 'three';
import { MASK_WORLD } from './geo.js';

// Shared, animated uniforms
export const U = {
  uNight: { value: 0 },
  uTime: { value: 0 },
  uFocus: { value: new THREE.Vector2() },
  uDetailR: { value: 2200 },
  uDust: { value: 0 }
};

// Box styles (instance attribute aStyle)
export const ST = {
  villa: 0, wall: 1, shop: 2, apt: 3, glass: 4, stone: 5, mud: 6, slab: 7, plain: 8, mosque: 9,
  lamp: 10, green: 11, paint: 12, median: 13, led: 14, sign: 15
};

const HEAD = /* glsl */`
uniform float uNight; uniform float uTime; uniform vec2 uFocus; uniform float uDetailR; uniform float uDust;
varying vec3 vWP; varying vec3 vWN; flat varying float vStyle; flat varying float vSeed;
varying vec3 vLP; varying vec3 vLN; flat varying vec3 vScl;
varying float vFacX; flat varying vec3 vFacC;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
`;

// Facade shader. Instanced boxes know their own size (from the instance matrix), so windows, bays and
// LED strips line up with each building's edges; non-instanced landmarks fall back to world coordinates.
const FACADE = /* glsl */`
  gGlass = 0.0; gEmis = vec3(0.0);
  {
  float st = floor(vStyle + 0.5);
  vec3 n = normalize(vWN);
  bool side = abs(n.y) < 0.5;
  bool loc = vScl.x > 0.0;
  float hc, W, yb, H, dE2;
  if (loc) {
    bool fx = abs(vLN.x) > 0.5;
    hc = fx ? (vLP.z + 0.5) * vScl.z : (vLP.x + 0.5) * vScl.x;
    W = fx ? vScl.z : vScl.x;
    yb = vLP.y * vScl.y; H = vScl.y;
    dE2 = min((0.5 - abs(vLP.x)) * vScl.x, (0.5 - abs(vLP.z)) * vScl.z);
  } else {
    vec2 tg = normalize(vec2(-n.z, n.x)); hc = dot(vWP.xz, tg) + 5000.0; W = 1e5; yb = vWP.y; H = 1e5; dE2 = 1e3;
  }
  // extruded OSM footprints carry their wall coordinates as an attribute
  if (vFacC.x > 0.0) { loc = true; hc = vFacX; W = vFacC.x; H = vFacC.y; yb = vWP.y - vFacC.z; dE2 = 1e3; }
  float dE = min(hc, W - hc);
  float dTop = H - yb;
  float seedA = h21(vec2(vSeed * 91.0, 3.7));
  vec3 warm = vec3(1.0, 0.70, 0.40);
  vec3 base = diffuseColor.rgb;
  // lamp heads, minaret rings, LED bands, signs, paint
  if (st == 10.0) { gEmis = vec3(1.0, 0.84, 0.6) * 7.0 * uNight; diffuseColor.rgb = vec3(0.95); }
  else if (st == 11.0) { gEmis = vec3(0.15, 1.0, 0.35) * 3.5 * uNight; diffuseColor.rgb = vec3(0.6, 0.9, 0.7); }
  else if (st == 14.0) {
    vec3 led = 0.5 + 0.5 * cos(6.2831 * (uTime * 0.05 + vSeed + vec3(0.0, 0.33, 0.67)));
    gEmis = led * (0.02 + 2.2 * uNight); diffuseColor.rgb = mix(vec3(0.85), led, uNight);
  }
  else if (st == 15.0) { gEmis = diffuseColor.rgb * (0.25 + 2.4 * uNight); }
  else if (st == 12.0) { diffuseColor.rgb *= 0.92 + 0.12 * vn(vWP.xz * 3.0); }
  else if (st == 7.0) {
    // pavements: tiles, a stone kerb at the edge, concrete sides; grass and sand keep their own grain
    bool grass = base.g > base.r * 1.02;
    bool sand = base.r > base.b * 1.35 && !grass;
    if (!side) {
      if (grass) diffuseColor.rgb *= 0.78 + 0.35 * vn(vWP.xz * 0.6) * vn(vWP.xz * 4.0 + 7.0);
      else if (sand) diffuseColor.rgb *= 0.9 + 0.15 * vn(vWP.xz * 0.25) + 0.05 * vn(vWP.xz * 3.0);
      else {
        vec2 tl = fract(vWP.xz * vec2(1.6, 1.6));
        float joint = step(0.93, max(tl.x, tl.y));
        diffuseColor.rgb *= (0.95 + 0.08 * h21(floor(vWP.xz * 1.6))) * (1.0 - joint * 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.61, 0.58), step(dE2, 0.38));
      }
    } else diffuseColor.rgb = vec3(0.55, 0.54, 0.52) * (0.9 + 0.1 * vn(vWP.xz * 2.0));
  }
  else if (st == 13.0) {
    // medians: painted black / yellow kerbs, sandy planting bed on top
    if (side) diffuseColor.rgb = mix(vec3(0.06), vec3(0.62, 0.48, 0.12), step(0.5, fract(hc * 0.5)));
    else diffuseColor.rgb = mix(vec3(0.55, 0.46, 0.33), vec3(0.62, 0.6, 0.56), step(dE2, 0.25)) * (0.9 + 0.15 * vn(vWP.xz * 1.5));
  }
  else if (st == 1.0) {
    // compound walls: plaster, coping, and warm uplights washing the wall at night
    if (side) {
      diffuseColor.rgb *= 0.93 + 0.1 * vn(vec2(hc * 0.8, yb * 1.5) + vSeed * 40.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, base * 1.12, step(dTop, 0.22));
      float p = fract(hc / 5.5) - 0.5;
      float wash = exp(-pow(p * 5.5 / (0.35 + yb * 0.45), 2.0)) * (1.0 - smoothstep(0.0, 3.0, yb));
      gEmis += base * warm * wash * 1.4 * uNight * step(0.25, seedA);
      // the gate: a dark steel panel in the middle of one face
      float gate = step(abs(hc - W * 0.5), 1.8) * step(yb, 2.6) * step(0.4, h21(vec2(vSeed, W)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.15, 0.14), gate);
      diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 1.4, yb));
    } else {
      float g = h21(floor(vWP.xz * 1.2));
      diffuseColor.rgb = mix(vec3(0.78, 0.74, 0.67), vec3(0.4, 0.5, 0.3), step(0.82, vn(vWP.xz * 0.15))) * (0.92 + 0.1 * g);
      diffuseColor.rgb = mix(diffuseColor.rgb, base, step(dE2, 0.35));
    }
  }
  else if (side) {
    // plaster / stone grain and streaks
    float grain = vn(vec2(hc * 0.6, yb * 0.3) + vSeed * 13.0);
    float streak = vn(vec2(hc * 2.5, yb * 0.04) + vSeed * 7.0);
    diffuseColor.rgb *= 0.92 + 0.1 * grain - 0.04 * streak * smoothstep(0.0, 20.0, dTop);
    if (st == 6.0) diffuseColor.rgb *= 0.86 + 0.22 * vn(vec2(hc, yb) * 1.7 + vSeed * 3.0);
    if (st != 8.0) {
      float fh = 3.6, cw = 3.4, wx = 0.42, wy = 0.48, lit = 0.3, y0 = 0.4, top = 0.8;
      if (st == 0.0) { fh = 3.7; cw = 3.8; wx = 0.36; wy = 0.44; lit = 0.33; y0 = 0.0; }
      else if (st == 2.0) { fh = 4.0; cw = 3.0; wx = 0.5; wy = 0.46; lit = 0.55; }
      else if (st == 3.0) { fh = 3.2; cw = 3.2; wx = 0.44; wy = 0.5; lit = 0.38; }
      else if (st == 5.0) { fh = 3.7; cw = 2.6; wx = 0.62; wy = 0.6; lit = 0.34; top = 1.5; }
      else if (st == 6.0) { fh = 3.1; cw = 2.8; wx = 0.2; wy = 0.24; lit = 0.35; }
      else if (st == 9.0) { fh = 9.0; cw = 4.4; wx = 0.34; wy = 0.6; lit = 0.85; }
      if (st == 4.0) {
        // curtain wall aligned to the tower: vision glass, mullions, spandrel bands, panel-to-panel tint
        float nc = max(1.0, floor(W / 1.55));
        vec2 c = vec2(hc / (W / nc), yb / 3.9);
        vec2 f = fract(c); vec2 id = floor(c);
        float aaG = clamp(1.6 - 2.2 * max(fwidth(c.x), fwidth(c.y)), 0.0, 1.0);
        float mullX = step(f.x, 0.04) + step(0.96, f.x);
        float spand = step(f.y, 0.22);
        float frameAmt = mix(0.22, clamp(mullX + spand, 0.0, 1.0), aaG);
        float panel = 0.93 + 0.12 * h21(id + vSeed * 9.0);
        vec3 glassCol = (base * 0.5 + vec3(0.015, 0.04, 0.06)) * panel;
        vec3 frameCol = mix(base * 0.7, vec3(0.75, 0.77, 0.78), 0.45);
        diffuseColor.rgb = mix(glassCol, frameCol, frameAmt);
        gGlass = 1.0 - frameAmt * 0.65;
        float floorLit = step(h21(vec2(floor(id.x / 5.0), id.y) + vSeed * 31.0), 0.42);
        vec3 tint = mix(vec3(1.0, 0.83, 0.62), vec3(0.78, 0.88, 1.0), step(0.5, h21(id.yy + vSeed)));
        gEmis += tint * floorLit * (0.25 + 0.35 * h21(id + vSeed)) * (1.0 - frameAmt) * uNight * 0.6;
        // bright lobby
        gEmis += warm * step(yb, 5.5) * (1.0 - frameAmt) * uNight * 0.9;
      } else {
        float nc = max(1.0, floor(W / cw));
        vec2 c = vec2(hc / (W / nc), (yb - y0) / fh);
        vec2 f = fract(c); vec2 id = floor(c);
        vec2 dm = (abs(f - 0.5) - vec2(wx, wy) * 0.5) * vec2(W / nc, fh);   // metres from the window edge (negative inside)
        float inside = step(max(dm.x, dm.y), 0.0);
        float frame = inside * step(-0.09, max(dm.x, dm.y));
        float sill = step(dm.x, 0.08) * step(abs((f.y - (0.5 - wy * 0.5)) * fh + 0.06), 0.06);
        if (st == 0.0 && yb < 3.4) { inside = 0.0; frame = 0.0; sill = 0.0; }
        if (dTop < top || c.y < 0.0) { inside = 0.0; frame = 0.0; sill = 0.0; }
        if (st == 9.0) inside *= step(f.y, 0.5 + wy * 0.5 - 0.1 * (1.0 - pow(clamp(abs(f.x - 0.5) / (wx * 0.5), 0.0, 1.0), 2.0)));
        float aa = clamp(1.4 - 1.6 * max(fwidth(c.x), fwidth(c.y)), 0.0, 1.0);
        float rnd = h21(id + vSeed * 17.0);
        float curtain = step(0.72, h21(id * 1.7 + vSeed));
        vec3 glassCol = mix(vec3(0.10, 0.13, 0.16), vec3(0.3, 0.36, 0.4), rnd);
        glassCol = mix(glassCol, vec3(0.82, 0.76, 0.64), curtain * 0.8);
        if (st == 6.0) { glassCol = vec3(0.1, 0.07, 0.05); curtain = 0.0; }
        // recess shadow under the head of each window
        float head = smoothstep(0.0, 0.45, -((f.y - (0.5 + wy * 0.5)) * fh));
        glassCol *= mix(0.5, 1.0, head);
        vec3 frameCol = st == 0.0 || st == 6.0 ? base * 1.12 : vec3(0.32, 0.33, 0.34);
        float glassA = (inside - frame) * aa;
        vec3 col = diffuseColor.rgb;
        col = mix(col, frameCol, frame * aa);
        col = mix(col, glassCol, glassA);
        col = mix(col, base * 0.6, sill * aa);
        // centre mullion, and split air-conditioner units beside some windows (a Riyadh facade staple)
        float cwm = W / nc;
        col = mix(col, frameCol, inside * step(abs(f.x - 0.5) * cwm, 0.035) * aa);
        float axl = (f.x - 0.5 - wx * 0.5) * cwm, ayl = (f.y - (0.5 - wy * 0.5)) * fh;
        float ac = step(0.12, axl) * step(axl, 0.95) * step(0.0, ayl) * step(ayl, 0.55) * step(0.6, h21(id + vec2(3.1, 7.7) + vSeed)) * step(st, 3.5) * (1.0 - step(dTop, top)) * step(0.0, c.y) * step(3.4, yb);
        col = mix(col, vec3(0.84, 0.84, 0.82) * (0.86 + 0.14 * step(0.5, fract(ayl * 14.0))), ac * aa);
        // average when the grid is too small to resolve
        float cover = wx * wy;
        diffuseColor.rgb = mix(mix(col, glassCol, cover * 0.7 * (1.0 - aa)), col, aa);
        if (st == 2.0 && yb < 4.6) {
          // shopfronts and the sign band above them, in bays aligned to the building
          float nb = max(1.0, floor(W / 7.0)); float bw = W / nb;
          float bp = fract(hc / bw); float bay = floor(hc / bw);
          float shop = step(yb, 3.3) * step(0.05, bp) * step(bp, 0.95);
          float band = step(3.55, yb) * step(yb, 4.45) * step(0.07, bp) * step(bp, 0.93);
          vec3 sc = 0.55 + 0.45 * cos(6.2831 * (h21(vec2(bay, vSeed)) + vec3(0.0, 0.33, 0.67)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.15, 0.17), shop);
          diffuseColor.rgb = mix(diffuseColor.rgb, sc, band);
          gEmis += shop * mix(warm, vec3(0.95, 0.97, 1.0), step(0.5, h21(vec2(bay, 2.0)))) * 1.1 * uNight;
          gEmis += band * sc * (0.12 + 2.0 * uNight);
          gGlass = shop * 0.7;
          glassA = 0.0;
        }
        gGlass = max(gGlass, glassA * (1.0 - curtain) * 0.6);
        // lit rooms: warm, cool or the blue of a television; curtains glow softly
        float on = step(rnd, lit) * glassA;
        float kind = h21(id.yx + vSeed * 5.0);
        vec3 room = kind < 0.68 ? warm : kind < 0.9 ? vec3(0.92, 0.95, 1.0) : vec3(0.45, 0.6, 1.0) * (0.75 + 0.25 * sin(uTime * 9.0 + rnd * 40.0));
        float grad = 0.75 + 0.35 * smoothstep(0.0, 1.0, f.y);
        gEmis += on * room * grad * mix(0.55, 0.35, curtain) * (0.6 + 0.5 * rnd) * uNight;
        // mosques are floodlit
        if (st == 9.0) gEmis += warm * base * 0.22 * uNight * (1.0 - 0.6 * smoothstep(0.0, H, yb));
      }
      // facade LED accents on taller buildings: vertical corner strips and a crown line
      if ((st == 4.0 || st == 5.0) && H > 40.0 && loc) {
        vec3 acc = seedA < 0.33 ? vec3(1.0, 0.8, 0.45) : seedA < 0.66 ? vec3(0.85, 0.92, 1.0) : vec3(0.3, 0.85, 1.0);
        float on2 = step(0.45, h21(vec2(vSeed * 13.0, 1.0)));
        gEmis += acc * 2.4 * uNight * on2 * (step(dE, 0.35) + step(dTop, 0.9) * step(0.5, seedA));
      }
    }
    // contact shadow at the base, darker vertical corners, soft streetlight spill on the ground floors
    diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 4.5, yb)) * mix(0.8, 1.0, smoothstep(0.0, 1.2, dE));
    gEmis += base * vec3(1.0, 0.78, 0.5) * 0.07 * uNight * (1.0 - smoothstep(0.0, 9.0, yb));
  } else {
    // roofs: weathered membrane, slightly darker than the walls, with a lighter parapet edge
    diffuseColor.rgb *= (0.8 + 0.12 * vn(vWP.xz * 0.5)) ;
    if (loc) diffuseColor.rgb = mix(diffuseColor.rgb, base * 1.05, step(dE2, 0.4));
  }
  }`;

export function makeBuildingMaterial({ coarse = false, always = false, fac = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.0, vertexColors: fac });
  if (fac) m.defines = { FAC: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aStyle; attribute float aSeed;
#ifdef FAC
attribute vec4 aFac;
#endif
${HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vLP = position; vLN = normal; vScl = vec3(0.0); vFacX = 0.0; vFacC = vec3(0.0);
#ifdef FAC
  vFacX = aFac.x; vFacC = aFac.yzw;
#endif
#ifdef USE_INSTANCING
  vScl = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  float dFocus = distance(instanceMatrix[3].xz, uFocus);
  ${always ? '' : coarse ? 'if (dFocus < uDetailR) transformed = vec3(0.0);' : 'if (dFocus >= uDetailR) transformed = vec3(0.0);'}
#endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 rwp = vec4(transformed, 1.0);
  vec3 rn = objectNormal;
#ifdef USE_INSTANCING
  rwp = instanceMatrix * rwp; rn = mat3(instanceMatrix) * rn;
#endif
  rwp = modelMatrix * rwp;
  vWP = rwp.xyz; vWN = normalize(mat3(modelMatrix) * rn);
  vStyle = aStyle; vSeed = aSeed;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${HEAD}
float gGlass; vec3 gEmis;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${FACADE}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, 0.9, gGlass);
  roughnessFactor = mix(roughnessFactor, 0.08, gGlass);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += gEmis;`);
  };
  m.customProgramCacheKey = () => 'bld3' + (always ? 'A' : coarse ? 'C' : 'D') + (fac ? 'F' : '');
  return m;
}

// Plain lit material that glows at night (for landmarks)
export function nightGlow(color, dayI = 0, nightI = 2.5, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, ...opts });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; uniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * (${dayI.toFixed(2)} + ${nightI.toFixed(2)} * uNight);`);
  };
  m.customProgramCacheKey = () => 'glow' + dayI + nightI;
  return m;
}

// ---------- ground: sun-bleached asphalt inside the city, sand and gravel outside ----------
export function makeGroundMaterial({ asphalt = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97 });
  m.customProgramCacheKey = () => 'ground' + asphalt;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uMask: { value: new THREE.Vector4(MASK_WORLD.x0, MASK_WORLD.z0, MASK_WORLD.x1, MASK_WORLD.z1) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGP; uniform vec4 uMask;
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5), b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5),
        c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5), d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 p = vGP.xz;
    float inside = ${asphalt ? '1.0' : 'step(uMask.x, p.x) * step(p.x, uMask.z) * step(uMask.y, p.y) * step(p.y, uMask.w)'};
    float grain = n2(p * 0.35) * 0.5 + n2(p * 2.1) * 0.5;
    vec3 asphalt = mix(vec3(0.34, 0.27, 0.19), vec3(0.42, 0.34, 0.25), grain);   // compacted urban sand
    asphalt *= 0.88 + 0.16 * n2(p * 0.03) + 0.05 * n2(p * 9.0);
    asphalt = mix(asphalt, vec3(0.27, 0.24, 0.2), smoothstep(0.6, 0.9, n2(p * 0.012 + 3.0)) * 0.6);  // gravel patches
    float dune = n2(p * 0.0021) * 0.6 + n2(p * 0.011) * 0.3 + n2(p * 0.09) * 0.1;
    vec3 sand = mix(vec3(0.74, 0.60, 0.42), vec3(0.86, 0.72, 0.52), dune);
    sand = mix(sand, vec3(0.62, 0.52, 0.40), smoothstep(0.62, 0.8, n2(p * 0.004 + 9.0)) * 0.6);
    diffuseColor.rgb = mix(sand, asphalt, inside);
  }`);
  };
  return m;
}

// ---------- sky dome ----------
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, sunSize: { value: 0.9995 },
      glow: { value: new THREE.Color() }, stars: { value: 0 }, uTime: U.uTime
    },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, horizon, bottom, sunCol, glow; uniform vec3 sunDir; uniform float sunSize, stars, uTime; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){
        vec3 d = normalize(vD);
        float e = d.y;
        vec3 c = e > 0.0 ? mix(horizon, top, pow(clamp(e,0.0,1.0), 0.55)) : mix(horizon, bottom, clamp(-e*6.0,0.0,1.0));
        float s = dot(d, normalize(sunDir));
        c += glow * pow(max(s,0.0), 6.0) * 0.6 + glow * exp(-abs(e)*9.0) * 0.25;
        c += sunCol * smoothstep(sunSize, sunSize + 0.0003, s) * 6.0;
        c += sunCol * pow(max(s,0.0), 300.0) * 1.2;
        if (stars > 0.0 && e > 0.02) { vec3 q = floor(d * 420.0); float r = h(q); c += vec3(step(0.9975, r) * stars * (0.6 + 0.4*sin(uTime*2.0 + r*90.0))); }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.scale.setScalar(30000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ---------- vegetation ----------
// Date palm with unit height: trunk to y=0.88, a drooping crown of fronds around y=0.9
export function palmGeometries() {
  const trunk = new THREE.CylinderGeometry(0.022, 0.034, 0.9, 7, 6);
  trunk.translate(0, 0.45, 0);
  // ring bumps on the trunk
  const pa = trunk.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i), k = 1 + 0.12 * Math.abs(Math.sin(y * 70));
    pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k);
  }
  trunk.computeVertexNormals();
  const pos = [], nor = [], idx = [];
  const fronds = 14;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2;
    const lift = f % 2 ? 0.55 : 0.25;
    const len = 0.42 + (f % 3) * 0.04;
    const seg = 6, base = pos.length / 3;
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const r = t * len;
      const y = 0.9 + Math.sin(t * Math.PI * 0.9) * 0.12 * lift * 2 - t * t * 0.22;
      const w = 0.07 * Math.sin(Math.min(1, t * 1.15) * Math.PI) + 0.006;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      pos.push(cx - px, y, cz - pz, cx + px, y - w * 0.4, cz + pz);
      nor.push(0, 1, 0, 0, 1, 0);
      if (s < seg) { const b = base + s * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
  }
  const crown = new THREE.BufferGeometry();
  crown.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  crown.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  crown.setIndex(idx);
  crown.computeVertexNormals();
  return { trunk, crown };
}
export const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5f45, roughness: 0.95 });
export const palmCrownMat = new THREE.MeshStandardMaterial({ color: 0x4f6a2c, roughness: 0.8, side: THREE.DoubleSide });

// Additive light pools on the ground (street lamps, headlights). Instance colour = light colour x strength.
export const poolMat = new THREE.ShaderMaterial({
  uniforms: { uNight: U.uNight },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vCol;
void main() {
  vUv = uv * 2.0 - 1.0;
  vCol = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
#endif
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
#include <logdepthbuf_vertex>
}`,
  fragmentShader: `#include <logdepthbuf_pars_fragment>
uniform float uNight; varying vec2 vUv; varying vec3 vCol;
void main() {
#include <logdepthbuf_fragment>
  float r = length(vUv);
  float a = pow(max(0.0, 1.0 - r), 2.0) * 0.8 + 0.25 * pow(max(0.0, 1.0 - r * 2.5), 3.0);
  gl_FragColor = vec4(vCol * a * uNight, 1.0);
}`
});
export const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);


// ---------- road surface: asphalt with lane markings, edge lines and zebra crossings drawn from attributes ----------
// aRoad = (across m, along m, half width, lanes per direction); aRoad2 = (way length, cls + 16 * flags)
export function makeRoadMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRoad; attribute vec2 aRoad2; varying vec4 vRoad; flat varying vec2 vRoad2; varying vec3 vRP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad; vRoad2 = aRoad2; vRP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vRoad; flat varying vec2 vRoad2; varying vec3 vRP; uniform float uNight;
float rh(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float rn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(rh(i), rh(i+vec2(1,0)), f.x), mix(rh(i+vec2(0,1)), rh(i+vec2(1,1)), f.x), f.y); }
float line(float x, float w) { float fw = max(fwidth(x), 1e-3); return 1.0 - smoothstep(w - fw, w + fw, abs(x)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float across = vRoad.x, along = vRoad.y, hw = vRoad.z, lanes = max(1.0, vRoad.w), L = vRoad2.x;
    float cls = mod(vRoad2.y, 16.0), flags = floor(vRoad2.y / 16.0);
    bool oneway = mod(flags, 2.0) > 0.5;
    float g = rn(vRP.xz * 0.6) * 0.5 + rn(vRP.xz * 3.1) * 0.5;
    vec3 asph = mix(vec3(0.045, 0.043, 0.041), vec3(0.07, 0.067, 0.063), g);
    if (cls >= 5.0 && cls != 9.0 && cls != 10.0) asph *= 1.25;                     // dusty local streets
    // wheel tracks and edge dust
    asph *= 1.0 - 0.12 * smoothstep(0.7, 0.98, rn(vec2(across * 0.9, along * 0.02)));
    asph = mix(asph, vec3(0.2, 0.17, 0.13), smoothstep(hw - 0.9, hw, abs(across)) * 0.45);
    float paint = 0.0; vec3 pc = vec3(0.78, 0.77, 0.72);
    bool marked = cls <= 4.0 || cls == 9.0 || cls == 10.0;
    float inner = step(9.0, along) * step(along, L - 9.0);
    if (marked) {
      float dash = step(fract(along / 9.0), 0.42);
      if (oneway) {
        float lw = 2.0 * hw / lanes;
        for (int k = 1; k < 6; k++) { if (float(k) >= lanes) break; paint = max(paint, line(across + hw - float(k) * lw, 0.07) * dash * inner); }
        float yl = line(across + hw - 0.4, 0.08);
        paint = max(paint, yl);
        pc = mix(pc, vec3(0.72, 0.52, 0.08), yl);
        paint = max(paint, line(across - hw + 0.4, 0.08));
      } else {
        float lw = hw / lanes;
        paint = max(paint, line(across, 0.07) * (cls <= 3.0 ? 1.0 : dash) * inner);
        for (int k = 1; k < 4; k++) { if (float(k) >= lanes) break; paint = max(paint, line(abs(across) - float(k) * lw, 0.07) * dash * inner); }
        paint = max(paint, line(abs(across) - hw + 0.4, 0.08));
      }
    }
    // zebra crossings near the ends of urban streets
    if (cls >= 2.0 && cls <= 7.0) {
      float z0 = step(3.0, along) * step(along, 6.5) + step(L - 6.5, along) * step(along, L - 3.0);
      paint = max(paint, z0 * step(0.5, fract(across / 1.1)) * step(abs(across), hw - 0.6) * step(14.0, L));
    }
    paint *= 0.72 + 0.28 * rn(vRP.xz * 1.7);
    diffuseColor.rgb = mix(asph, pc, paint);
  }`);
  };
  m.customProgramCacheKey = () => 'road1';
  return m;
}
// pavements beside the carriageway; aRoad.x = across, aRoad.z = road half width; cls in aRoad2.y
export function makeWalkMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRoad; attribute vec2 aRoad2; varying vec4 vRoad; flat varying vec2 vRoad2; varying vec3 vRP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad; vRoad2 = aRoad2; vRP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vRoad; flat varying vec2 vRoad2; varying vec3 vRP;
float wh(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float a = abs(vRoad.x) - vRoad.z;     // metres beyond the carriageway edge
    float cls = mod(vRoad2.y, 16.0);
    vec2 tl = fract(vRP.xz * 1.4);
    float joint = step(0.92, max(tl.x, tl.y));
    vec3 pav = vec3(0.5, 0.45, 0.38) * (0.92 + 0.12 * wh(floor(vRP.xz * 1.4))) * (1.0 - joint * 0.1);
    vec3 kerb = cls <= 3.0 ? mix(vec3(0.05), vec3(0.6, 0.45, 0.1), step(0.5, fract(vRoad.y * 0.5))) : vec3(0.55, 0.54, 0.51);
    diffuseColor.rgb = mix(pav, kerb, step(a, 0.35));
  }`);
  };
  m.customProgramCacheKey = () => 'walk1';
  return m;
}
const LAND_COL = { 1: '#5f7f38', 2: '#4f8445', 3: '#6b7238', 4: '#3d5a2a', 5: '#9a8a5e', 6: '#2f5f6e', 7: '#cfb68c', 8: '#b6a58a' };
export function landColor(k) { return new THREE.Color(LAND_COL[k] || '#888'); }
export function makeLandMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLPw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLPw = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLPw;
float lh(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(lh(i), lh(i+vec2(1,0)), f.x), mix(lh(i+vec2(0,1)), lh(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= 0.8 + 0.3 * ln(vLPw.xz * 0.35) * ln(vLPw.xz * 3.0 + 5.0);');
  };
  m.customProgramCacheKey = () => 'land1';
  return m;
}
