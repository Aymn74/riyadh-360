// geo.js — Riyadh frame, arterial network, district fabric and the deterministic block layout.
// World: x = east (m), z = south (m), y = up. Origin = Kingdom Centre.
// Grid: Riyadh's central street grid is turned about 28° west of north (King Fahd Rd runs NNW).
//   u axis points ENE (bearing 62°), v axis points NNW (bearing -28°).

export const LAT0 = 24.7114, LON0 = 46.6744;
const MLAT = 110770, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
export const TH = 28 * Math.PI / 180;
const C = Math.cos(TH), S = Math.sin(TH);

export function geo(lat, lon) {
  const e = (lon - LON0) * MLON, n = (lat - LAT0) * MLAT;
  return { x: e, z: -n };
}
export function toLatLon(x, z) {
  return { lat: LAT0 - z / MLAT, lon: LON0 + x / MLON };
}
export function toGrid(x, z) {
  const e = x, n = -z;
  return { u: e * C + n * S, v: -e * S + n * C };
}
export function toWorld(u, v) {
  const e = u * C - v * S, n = u * S + v * C;
  return { x: e, z: -n };
}
export const gridOf = (lat, lon) => { const w = geo(lat, lon); return toGrid(w.x, w.z); };
// World-space unit directions of the grid axes (x, z)
export const DIR_U = { x: C, z: -S };
export const DIR_V = { x: -S, z: -C };

// ---------- deterministic randomness ----------
export function hash2(a, b) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the built-up area (approximate urban footprint used by the generator) ----------
const MASK = { lat0: 24.52, lat1: 24.915, lon0: 46.306, lon1: 46.964 };
const m0 = geo(MASK.lat1, MASK.lon0), m1 = geo(MASK.lat0, MASK.lon1);
export const MASK_WORLD = { x0: m0.x, z0: m0.z, x1: m1.x, z1: m1.z };
export function inMask(x, z) {
  return x > MASK_WORLD.x0 && x < MASK_WORLD.x1 && z > MASK_WORLD.z0 && z < MASK_WORLD.z1;
}
// Grid extent that covers the mask (roads run to its ends)
const corners = [[m0.x, m0.z], [m1.x, m0.z], [m0.x, m1.z], [m1.x, m1.z]].map(([x, z]) => toGrid(x, z));
export const EXT = {
  u0: Math.floor(Math.min(...corners.map((c) => c.u)) / 100) * 100 - 400,
  u1: Math.ceil(Math.max(...corners.map((c) => c.u)) / 100) * 100 + 400,
  v0: Math.floor(Math.min(...corners.map((c) => c.v)) / 100) * 100 - 400,
  v1: Math.ceil(Math.max(...corners.map((c) => c.v)) / 100) * 100 + 400
};

// ---------- arterial network ----------
// Each road is a straight grid line anchored on a real point it passes. Positions are approximate.
// kind: freeway (express + service carriageways), major, minor. lanes = per direction.
const KIND = {
  freeway: { w: 64, lanes: 4, median: 8, service: true },
  major: { w: 42, lanes: 3, median: 6, service: false },
  minor: { w: 28, lanes: 2, median: 3, service: false }
};
function road(name, ar, lat, lon, kind, axis) {
  const g = gridOf(lat, lon);
  const k = KIND[kind];
  return { name, ar, kind, axis, c: axis === 'u' ? g.u : g.v, w: k.w, lanes: k.lanes, median: k.median, service: k.service };
}
// axis 'u' = line of constant u (runs NNW–SSE). axis 'v' = line of constant v (runs ENE–WSW).
export const ROADS_U = [
  road('King Khalid Rd', 'طريق الملك خالد', 24.715, 46.623, 'major', 'u'),
  road('Prince Turki Al Awwal Rd', 'طريق الأمير تركي الأول', 24.735, 46.632, 'minor', 'u'),
  road('Takhassusi St', 'شارع التخصصي', 24.700, 46.664, 'major', 'u'),
  road('King Fahd Rd', 'طريق الملك فهد', 24.7105, 46.6728, 'freeway', 'u'),
  road('Olaya St', 'شارع العليا', 24.7125, 46.6772, 'major', 'u'),
  road('Abu Bakr As Siddiq Rd', 'طريق أبو بكر الصديق', 24.760, 46.668, 'major', 'u'),
  road('Othman bin Affan Rd', 'طريق عثمان بن عفان', 24.770, 46.688, 'major', 'u'),
  road('Khalid bin Al Walid Rd', 'طريق خالد بن الوليد', 24.720, 46.745, 'minor', 'u'),
  road('Eastern Ring Rd', 'الطريق الدائري الشرقي', 24.720, 46.776, 'freeway', 'u')
].sort((a, b) => a.c - b.c);
export const ROADS_V = [
  road('Southern Ring Rd', 'الطريق الدائري الجنوبي', 24.592, 46.730, 'freeway', 'v'),
  road('Tariq bin Ziyad Rd', 'طريق طارق بن زياد', 24.618, 46.715, 'minor', 'v'),
  road('Imam Faisal bin Turki Rd', 'طريق الإمام فيصل بن تركي', 24.641, 46.712, 'major', 'v'),
  road('Al Ahsa St', 'شارع الأحساء', 24.660, 46.715, 'minor', 'v'),
  road('Makkah Al Mukarramah Rd', 'طريق مكة المكرمة', 24.6795, 46.6935, 'freeway', 'v'),
  road('Prince Mohammed bin Abdulaziz Rd (Tahlia)', 'شارع التحلية', 24.6985, 46.6825, 'minor', 'v'),
  road('Al Urubah Rd', 'طريق العروبة', 24.7085, 46.6745, 'major', 'v'),
  road('King Abdullah Rd', 'طريق الملك عبدالله', 24.7325, 46.6625, 'freeway', 'v'),
  road('Imam Saud bin Abdulaziz Rd', 'طريق الإمام سعود بن عبدالعزيز', 24.752, 46.6525, 'major', 'v'),
  road('Northern Ring Rd', 'الطريق الدائري الشمالي', 24.7705, 46.6455, 'freeway', 'v'),
  road('Anas bin Malik Rd', 'طريق أنس بن مالك', 24.793, 46.633, 'major', 'v'),
  road('King Salman Rd', 'طريق الملك سلمان', 24.812, 46.624, 'freeway', 'v')
].sort((a, b) => a.c - b.c);
export const ROAD_KFR = ROADS_U.find((r) => r.name === 'King Fahd Rd');
export const ROAD_OLAYA = ROADS_U.find((r) => r.name === 'Olaya St');
const ROAD_MAKKAH = ROADS_V.find((r) => r.name.startsWith('Makkah'));
const ROAD_NRR = ROADS_V.find((r) => r.name === 'Northern Ring Rd');

// ---------- places ----------
// positions from OpenStreetMap (building centroids)
export const PLACES = {
  kingdom: { lat: 24.71133, lon: 46.67441, ar: 'برج المملكة', en: 'Kingdom Centre' },
  faisaliah: { lat: 24.69031, lon: 46.68457, ar: 'برج الفيصلية', en: 'Al Faisaliah Tower' },
  kafd: { lat: 24.76368, lon: 46.64149, ar: 'المركز المالي (كافد)', en: 'KAFD · PIF Tower' },
  rafal: { lat: 24.7924, lon: 46.63235, ar: 'برج رافال', en: 'Burj Rafal' },
  masmak: { lat: 24.63122, lon: 46.71336, ar: 'قصر المصمك', en: 'Masmak Fortress' },
  museum: { lat: 24.64735, lon: 46.71068, ar: 'المتحف الوطني', en: 'National Museum' },
  water: { lat: 24.64511, lon: 46.71227, ar: 'برج مياه الرياض', en: 'Riyadh Water Tower' },
  tv: { lat: 24.64322, lon: 46.69601, ar: 'برج التلفزيون', en: 'Riyadh TV Tower' },
  moi: { lat: 24.67033, lon: 46.69574, ar: 'وزارة الداخلية', en: 'Ministry of Interior' },
  library: { lat: 24.685663, lon: 46.686448, ar: 'مكتبة الملك فهد الوطنية', en: 'King Fahd National Library' },
  turaif: { lat: 24.7329, lon: 46.57328, ar: 'حي الطريف · الدرعية', en: 'At-Turaif, Diriyah' },
  tahlia: { lat: 24.6985, lon: 46.6880, ar: 'شارع التحلية', en: 'Tahlia Street' },
  malazPark: { lat: 24.66665, lon: 46.73705, ar: 'منتزه الملك عبدالله', en: 'King Abdullah Park' },
  salam: { lat: 24.62185, lon: 46.70832, ar: 'حديقة السلام', en: 'Salam Park' },
  // more landmarks, positions from OpenStreetMap
  zal: { lat: 24.62897, lon: 46.71224, ar: 'سوق الزل', en: 'Souq Al-Zal' },
  thumairi: { lat: 24.6311, lon: 46.71551, ar: 'دروازة الثميري وسوقها', en: 'Al-Thumairi Gate & Souq' },
  hokm: { lat: 24.629736, lon: 46.711181, ar: 'قصر الحكم', en: 'Qasr Al-Hokm' },
  turkiMosque: { lat: 24.63092, lon: 46.7108, ar: 'جامع الإمام تركي بن عبدالله', en: 'Imam Turki bin Abdullah Grand Mosque' },
  murabba: { lat: 24.64652, lon: 46.70925, ar: 'قصر المربع', en: 'Murabba Palace' },
  redPalace: { lat: 24.6423, lon: 46.709066, ar: 'القصر الأحمر', en: 'The Red Palace' },
  thumairi: { lat: 24.6310982, lon: 46.7155074, ar: 'بوابة الثميري', en: 'Al-Thumairi Gate' },
  ksu: { lat: 24.71968, lon: 46.62871, ar: 'جامعة الملك سعود', en: 'King Saud University' },
  pnu: { lat: 24.85232, lon: 46.71972, ar: 'جامعة الأميرة نورة', en: 'Princess Nourah University' },
  imamU: { lat: 24.81557, lon: 46.70416, ar: 'جامعة الإمام محمد بن سعود', en: 'Imam Mohammad Ibn Saud University' },
  rajhiMosque: { lat: 24.68016, lon: 46.77931, ar: 'جامع الراجحي', en: 'Al Rajhi Grand Mosque' },
  boulevard: { lat: 24.76794, lon: 46.60426, ar: 'بوليفارد رياض سيتي', en: 'Boulevard Riyadh City' },
  blvdWorld: { lat: 24.77664, lon: 46.60124, ar: 'عالم البوليفارد', en: 'Boulevard World' },
  bujairi: { lat: 24.73643, lon: 46.57522, ar: 'مطل البجيري', en: 'Al-Bujairi Terrace' },
  stadium: { lat: 24.78861, lon: 46.83917, ar: 'استاد الملك فهد الدولي', en: 'King Fahd International Stadium' },
  zoo: { lat: 24.67638, lon: 46.73711, ar: 'حديقة الحيوان بالملز', en: 'Riyadh Zoo' },
  dq: { lat: 24.67904, lon: 46.61974, ar: 'الحي الدبلوماسي', en: 'Diplomatic Quarter' },
  aviation: { lat: 24.75451, lon: 46.74013, ar: 'متحف صقر الجزيرة للطيران', en: 'Saqr Al-Jazira Aviation Museum' },
  wadiHanifa: { lat: 24.61304, lon: 46.69386, ar: 'وادي حنيفة', en: 'Wadi Hanifa' },
  roshnFront: { lat: 24.84126, lon: 46.73319, ar: 'واجهة روشن', en: 'Roshn Front' },
  riyadhPark: { lat: 24.75596, lon: 46.63009, ar: 'الرياض بارك', en: 'Riyadh Park Mall' },
  nakheelMall: { lat: 24.76703, lon: 46.71576, ar: 'النخيل مول', en: 'Al Nakheel Mall' },
  riyadhGallery: { lat: 24.74382, lon: 46.65823, ar: 'الرياض جاليري', en: 'Riyadh Gallery' },
  granada: { lat: 24.78181, lon: 46.7308, ar: 'غرناطة مول', en: 'Granada Mall' },
  panorama: { lat: 24.6925, lon: 46.66942, ar: 'بانوراما مول', en: 'Panorama Mall' },
  taiba: { lat: 24.73495, lon: 46.66271, ar: 'سوق طيبة', en: 'Souq Taiba' }
};
for (const p of Object.values(PLACES)) Object.assign(p, geo(p.lat, p.lon), gridOf(p.lat, p.lon));

export const DISTRICTS = [
  ['العليا', 'Al Olaya', 24.695, 46.685], ['السليمانية', 'As Sulaimaniyah', 24.705, 46.700],
  ['الملز', 'Al Malaz', 24.665, 46.735], ['المربع', 'Al Murabba', 24.650, 46.712],
  ['الديرة', 'Ad Dirah', 24.630, 46.715], ['البطحاء', 'Al Batha', 24.638, 46.728],
  ['الورود', 'Al Wurud', 24.725, 46.676], ['المروج', 'Al Muruj', 24.750, 46.662],
  ['الملقا', 'Al Malqa', 24.805, 46.610], ['حطين', 'Hittin', 24.765, 46.603],
  ['النخيل', 'An Nakheel', 24.745, 46.633], ['الصحافة', 'As Sahafa', 24.800, 46.640],
  ['الياسمين', 'Al Yasmin', 24.825, 46.655], ['الربوة', 'Ar Rabwah', 24.690, 46.765],
  ['الروضة', 'Ar Rawdah', 24.735, 46.770], ['المعذر', 'Al Maather', 24.665, 46.660],
  ['الرحمانية', 'Ar Rahmaniyah', 24.715, 46.652], ['الغدير', 'Al Ghadir', 24.775, 46.665],
  ['النزهة', 'An Nuzhah', 24.758, 46.708], ['المصيف', 'Al Masif', 24.742, 46.690],
  ['العقيق', 'Al Aqiq', 24.775, 46.625], ['الدرعية', 'Diriyah', 24.735, 46.575],
  ['الشميسي', 'Ash Shumaisi', 24.628, 46.692], ['الوزارات', 'Al Wazarat', 24.668, 46.712],
  ['الملك فهد', 'King Fahd', 24.732, 46.690], ['الفلاح', 'Al Falah', 24.795, 46.690],
  ['الحمراء', 'Al Hamra', 24.775, 46.755], ['السلي', 'As Sulay', 24.610, 46.790],
  ['منفوحة', 'Manfuhah', 24.608, 46.722], ['العريجاء', 'Al Uraija', 24.615, 46.640],
  ['السويدي', 'As Suwaidi', 24.600, 46.680], ['الروابي', 'Ar Rawabi', 24.665, 46.790]
].map(([ar, en, lat, lon]) => ({ ar, en, ...geo(lat, lon) }));

export function districtAt(x, z) {
  let best = null, bd = Infinity;
  for (const d of DISTRICTS) {
    const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return inMask(x, z) || bd < 2500 ** 2 ? best : { ar: 'صحراء نجد', en: 'Najd desert' };
}

// ---------- Wadi Hanifa (a green valley west of the city) ----------
export const WADI = [
  [24.835, 46.553], [24.79, 46.562], [24.758, 46.568], [24.735, 46.579], [24.715, 46.590],
  [24.69, 46.604], [24.665, 46.617], [24.64, 46.630], [24.615, 46.645], [24.585, 46.662]
].map(([la, lo]) => geo(la, lo));
export function distToWadi(x, z) {
  let d = Infinity;
  for (let i = 0; i < WADI.length - 1; i++) {
    const a = WADI[i], b = WADI[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return d;
}

// ---------- block layout ----------
// Lines list per axis: extent edges are pseudo-roads of width 0.
const linesU = [{ c: EXT.u0, w: 0, edge: true }, ...ROADS_U, { c: EXT.u1, w: 0, edge: true }];
const linesV = [{ c: EXT.v0, w: 0, edge: true }, ...ROADS_V, { c: EXT.v1, w: 0, edge: true }];
export const LINES_U = linesU, LINES_V = linesV;

function spanIndex(lines, x) {
  if (x < lines[0].c || x >= lines[lines.length - 1].c) return -1;
  let lo = 0, hi = lines.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (lines[m].c <= x) lo = m; else hi = m; }
  return lo;
}

// Fabric of a superblock (i over u, j over v): street pitch and type
const ZONE = {
  suburb: { pu: 124, pv: 62, wu: 14, wv: 12 },
  dense: { pu: 84, pv: 56, wu: 12, wv: 10 },
  cbd: { pu: 118, pv: 96, wu: 16, wv: 14 },
  kafd: { pu: 104, pv: 104, wu: 18, wv: 18 },
  old: { pu: 46, pv: 34, wu: 6, wv: 6 }
};
const sbCache = new Map();
export function superblock(i, j) {
  const key = i * 1000 + j;
  let sb = sbCache.get(key);
  if (sb) return sb;
  const a = linesU[i], b = linesU[i + 1], c = linesV[j], d = linesV[j + 1];
  const u0 = a.c + a.w / 2, u1 = b.c - b.w / 2, v0 = c.c + c.w / 2, v1 = d.c - d.w / 2;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const w = toWorld(cu, cv);
  const dist = (p) => Math.hypot(p.x - w.x, p.z - w.z);
  let zone = 'suburb';
  const nearKFR = (a === ROAD_KFR && b === ROAD_OLAYA);
  if (dist(PLACES.kafd) < 900) zone = 'kafd';
  else if (dist(PLACES.masmak) < 1300) zone = 'old';
  else if (nearKFR && cv > ROAD_MAKKAH.c - 3000 && cv < ROAD_NRR.c + 2500) zone = 'cbd';
  else if (dist(PLACES.museum) < 4200 || (w.x > 2500 && w.z > 1500)) zone = 'dense';
  const f = ZONE[zone];
  const nu = Math.max(1, Math.round((u1 - u0) / f.pu)), nv = Math.max(1, Math.round((v1 - v0) / f.pv));
  sb = { i, j, u0, u1, v0, v1, zone, nu, nv, pu: (u1 - u0) / nu, pv: (v1 - v0) / nv, wu: f.wu, wv: f.wv, a, b, c, d };
  sbCache.set(key, sb);
  return sb;
}

// Block rectangle (inner, excluding streets) for local indices ku, kv of a superblock
export function blockRect(sb, ku, kv) {
  const u0 = sb.u0 + ku * sb.pu + (ku > 0 ? sb.wu / 2 : 0);
  const u1 = sb.u0 + (ku + 1) * sb.pu - (ku < sb.nu - 1 ? sb.wu / 2 : 0);
  const v0 = sb.v0 + kv * sb.pv + (kv > 0 ? sb.wv / 2 : 0);
  const v1 = sb.v0 + (kv + 1) * sb.pv - (kv < sb.nv - 1 ? sb.wv / 2 : 0);
  return { u0, u1, v0, v1 };
}

// What lies at a grid point: an arterial, a local street, a block, or nothing (outside)
export function cellAt(u, v) {
  const i = spanIndex(linesU, u), j = spanIndex(linesV, v);
  if (i < 0 || j < 0) return { type: 'out' };
  for (const r of [linesU[i], linesU[i + 1]]) if (!r.edge && Math.abs(u - r.c) < r.w / 2) return { type: 'artery', road: r, axis: 'u' };
  for (const r of [linesV[j], linesV[j + 1]]) if (!r.edge && Math.abs(v - r.c) < r.w / 2) return { type: 'artery', road: r, axis: 'v' };
  const sb = superblock(i, j);
  const ku = Math.min(sb.nu - 1, Math.max(0, Math.floor((u - sb.u0) / sb.pu)));
  const kv = Math.min(sb.nv - 1, Math.max(0, Math.floor((v - sb.v0) / sb.pv)));
  const r = blockRect(sb, ku, kv);
  if (u < r.u0 || u > r.u1) return { type: 'street', axis: 'u', sb };
  if (v < r.v0 || v > r.v1) return { type: 'street', axis: 'v', sb };
  return { type: 'block', sb, ku, kv, rect: r, info: blockInfo(sb, ku, kv) };
}

// Landmark sites keep their block clear (plaza) — radius in metres
export const RESERVED = [
  ['kingdom', 150], ['faisaliah', 110], ['rafal', 70], ['masmak', 95], ['museum', 220], ['water', 90],
  ['tv', 80], ['moi', 160], ['library', 110], ['turaif', 420], ['malazPark', 380], ['salam', 420]
].map(([k, r]) => ({ key: k, r, p: PLACES[k] }));
export const KAFD_TOWERS = []; // filled by landmarks; generator leaves KAFD core to them

const infoCache = new Map();
export function blockInfo(sb, ku, kv) {
  const key = (sb.i * 1000 + sb.j) * 100000 + ku * 300 + kv;
  let info = infoCache.get(key);
  if (info) return info;
  const r = blockRect(sb, ku, kv);
  const cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
  const w = toWorld(cu, cv);
  const h = hash2(key, 77);
  const h2 = hash2(key, 913);
  // edges that face an arterial (commercial frontage)
  const front = {
    u0: ku === 0 && !sb.a.edge, u1: ku === sb.nu - 1 && !sb.b.edge,
    v0: kv === 0 && !sb.c.edge, v1: kv === sb.nv - 1 && !sb.d.edge
  };
  let kind;
  const inside = inMask(w.x, w.z);
  const edgeFade = Math.min(w.x - MASK_WORLD.x0, MASK_WORLD.x1 - w.x, w.z - MASK_WORLD.z0, MASK_WORLD.z1 - w.z);
  const wadiD = distToWadi(w.x, w.z);
  let reserved = null;
  for (const rs of RESERVED) if (Math.hypot(rs.p.x - w.x, rs.p.z - w.z) < rs.r) { reserved = rs.key; break; }
  if (wadiD < 260) kind = 'wadi';
  else if (!inside) kind = 'desert';
  else if (reserved) kind = reserved === 'malazPark' || reserved === 'salam' ? 'park' : 'plaza';
  else if (sb.zone === 'kafd' && Math.hypot(PLACES.kafd.x - w.x, PLACES.kafd.z - w.z) < 430) kind = 'plaza';
  else if (edgeFade < 1500 && h < 0.55 * (1 - edgeFade / 1500)) kind = 'desert';
  else if (sb.zone === 'old') kind = h < 0.06 ? 'mosque' : 'old';
  else if (sb.zone === 'kafd') kind = 'tower';
  else if (sb.zone === 'cbd') kind = h < 0.12 ? 'plaza' : 'tower';
  else {
    const nearArt = front.u0 || front.u1 || front.v0 || front.v1;
    if (h < 0.035) kind = 'mosque';
    else if (h < 0.11) kind = 'vacant';
    else if (h < 0.13) kind = 'park';
    else if (nearArt && (front.u0 && sb.a === ROAD_KFR || front.u1 && sb.b === ROAD_KFR || front.u0 && sb.a === ROAD_OLAYA) && h2 < 0.7) kind = 'tower';
    else if (nearArt) kind = 'commercial';
    else if (sb.zone === 'dense') kind = h2 < 0.65 ? 'apt' : 'villa';
    else kind = h2 < 0.18 ? 'apt' : 'villa';
  }
  info = { kind, front, seed: (key * 2654435761) >>> 0, cu, cv, zone: sb.zone };
  infoCache.set(key, info);
  if (infoCache.size > 200000) infoCache.clear();
  return info;
}

// Enumerate all blocks whose centre lies in a grid rectangle
export function blocksIn(u0, u1, v0, v1, cb) {
  for (let i = 0; i < linesU.length - 1; i++) {
    if (linesU[i + 1].c < u0 || linesU[i].c > u1) continue;
    for (let j = 0; j < linesV.length - 1; j++) {
      if (linesV[j + 1].c < v0 || linesV[j].c > v1) continue;
      const sb = superblock(i, j);
      if (sb.u1 <= sb.u0 || sb.v1 <= sb.v0) continue;
      const ka = Math.max(0, Math.floor((u0 - sb.u0) / sb.pu)), kb = Math.min(sb.nu - 1, Math.floor((u1 - sb.u0) / sb.pu));
      const la = Math.max(0, Math.floor((v0 - sb.v0) / sb.pv)), lb = Math.min(sb.nv - 1, Math.floor((v1 - sb.v0) / sb.pv));
      for (let ku = ka; ku <= kb; ku++) for (let kv = la; kv <= lb; kv++) {
        const r = blockRect(sb, ku, kv);
        const cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
        if (cu < u0 || cu >= u1 || cv < v0 || cv >= v1) continue;
        cb(sb, ku, kv, r, blockInfo(sb, ku, kv));
      }
    }
  }
}

// ---------- movement rules ----------
const SIDEWALK = 4;
const OPEN = new Set(['plaza', 'park', 'vacant', 'desert', 'wadi']);
export function walkable(x, z) {
  const g = toGrid(x, z);
  const c = cellAt(g.u, g.v);
  if (c.type !== 'block') return true;
  if (OPEN.has(c.info.kind)) return true;
  const r = c.rect;
  return g.u - r.u0 < SIDEWALK || r.u1 - g.u < SIDEWALK || g.v - r.v0 < SIDEWALK || r.v1 - g.v < SIDEWALK;
}
export function drivable(x, z) {
  const g = toGrid(x, z);
  const c = cellAt(g.u, g.v);
  if (c.type !== 'block') return true;
  return c.info.kind === 'vacant' || c.info.kind === 'desert' || c.info.kind === 'wadi' || c.info.kind === 'plaza' && c.info.zone !== 'cbd';
}
export function roadAt(x, z) {
  const g = toGrid(x, z);
  const c = cellAt(g.u, g.v);
  if (c.type === 'artery') return c.road;
  // nearest arterial within 120 m
  let best = null, bd = 120;
  for (const r of ROADS_U) { const d = Math.abs(g.u - r.c) - r.w / 2; if (d < bd) { bd = d; best = r; } }
  for (const r of ROADS_V) { const d = Math.abs(g.v - r.c) - r.w / 2; if (d < bd) { bd = d; best = r; } }
  return best ? { ...best, near: c.type !== 'artery' } : null;
}
