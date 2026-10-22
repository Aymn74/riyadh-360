# build_osm.py — turns a BBBike OSM GeoPackage of Riyadh into site/data/riyadh.bin + riyadh.json.
# usage: python3 -I tools/build_osm.py <riyadh.gpkg> <out_dir>
#
# Frame: metres, origin at Kingdom Centre, x east, z south (same as js/geo.js).
# Sections (little endian, 4-byte aligned), described in riyadh.json:
#   roads      u32 x4 per road  [cls | flags<<8 | lanes<<16 | width_dm<<24, name_idx, pt_start, pt_count]
#   buildings  u32 x4 per bldg  [style | height_dm<<8, seed, pt_start, pt_count]   (outer ring, CCW)
#   land       u32 x3 per area  [kind, pt_start, pt_count]
#   rail       u32 x3 per line  [flags, pt_start, pt_count]
#   pts        f32 x,z for all of the above
#   fill       f32 x7 per generated villa/shop [x, z, yaw, w, d, h, style + seed]
#   mosques    f32 x4 [x, z, minaret_h, dome_r]
import sys, os, json, math, sqlite3, struct, zlib
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpkg import parse_gpkg, tags

GPKG, OUT = sys.argv[1], sys.argv[2]
LAT0, LON0 = 24.7114, 46.6744
MLAT, MLON = 110770.0, 111320.0 * math.cos(math.radians(LAT0))
TH = math.radians(28)


def xz(lon, lat):
    return ((lon - LON0) * MLON, -(lat - LAT0) * MLAT)


def place(lat, lon):
    return xz(lon, lat)


# landmarks modelled by hand in js/landmarks.js (OSM buildings inside these circles are dropped)
P = {
    'kingdom': (24.71133, 46.67441), 'faisaliah': (24.69031, 46.68457), 'rafal': (24.7924, 46.63235),
    'masmak': (24.63122, 46.71336), 'water': (24.64511, 46.71227), 'tv': (24.64322, 46.69601),
    'moi': (24.67033, 46.69574), 'turaif': (24.7329, 46.57328), 'pif': (24.76368, 46.64149)
}
DROP = {'kingdom': 115, 'faisaliah': 62, 'rafal': 38, 'masmak': 48, 'water': 22, 'tv': 26, 'moi': 95, 'turaif': 360, 'pif': 45}
DROPW = [(*place(*P[k]), r) for k, r in DROP.items()]
KAFD = place(24.7637, 46.6405)
MASMAK = place(*P['masmak'])

def h32(n):
    n = (n * 2654435761) & 0xFFFFFFFF
    n ^= n >> 15
    n = (n * 0x2c1b3c6d) & 0xFFFFFFFF
    n ^= n >> 12
    return n


def rnd(n, k=0):
    return h32(n * 31 + k * 977 + 13) / 4294967296.0


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a = np.asarray(pts)
    keep = np.zeros(len(a), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(a) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        p, q = a[i], a[j]
        d = q - p
        L = math.hypot(*d)
        seg = a[i + 1:j]
        if L < 1e-9:
            dist = np.hypot(*(seg - p).T)
        else:
            dist = np.abs(d[0] * (seg[:, 1] - p[1]) - d[1] * (seg[:, 0] - p[0])) / L
        k = int(np.argmax(dist))
        if dist[k] > eps:
            m = i + 1 + k
            keep[m] = True
            stack += [(i, m), (m, j)]
    return [tuple(v) for v in a[keep]]


def area(r):
    s = 0.0
    for i in range(len(r)):
        x0, z0 = r[i]; x1, z1 = r[(i + 1) % len(r)]
        s += x0 * z1 - x1 * z0
    return s / 2


con = sqlite3.connect(GPKG)
names, name_idx = [], {}


def name_id(ar, en):
    key = (ar or '') + '|' + (en or '')
    if key == '|':
        return 0xFFFFFFFF
    if key not in name_idx:
        name_idx[key] = len(names)
        names.append([ar or '', en or ''])
    return name_idx[key]


PTS = {'road': [], 'bld': [], 'land': [], 'rail': []}
pts = PTS['land']   # land rings are read back by the rasteriser


def add_pts(ring, kind):
    arr = PTS[kind]
    s = len(arr) // 2
    for x, z in ring:
        arr.append(x); arr.append(z)
    return s, len(ring)


# ---------------------------------------------------------------- roads
CLS = {'motorway': 0, 'trunk': 1, 'primary': 2, 'secondary': 3, 'tertiary': 4, 'unclassified': 5, 'residential': 6,
       'living_street': 7, 'service': 8, 'motorway_link': 9, 'trunk_link': 9, 'primary_link': 10, 'secondary_link': 10,
       'tertiary_link': 10, 'pedestrian': 11}
# width of one carriageway (one-way) / of a two-way road, metres
WIDTH = {0: (11.5, 22), 1: (11, 21), 2: (10.5, 16), 3: (9, 14), 4: (7.5, 12), 5: (7, 9), 6: (7.5, 10), 7: (6, 7), 8: (4.5, 5.5),
         9: (6.5, 9), 10: (6.5, 9), 11: (6, 8)}
roads = []
road_lines = []   # for the fill rasteriser: (pts, width, cls)
n_tunnel = 0
for osm_id, g, name, hw, other in con.execute("select osm_id, geom, name, highway, other_tags from lines where highway is not null"):
    if hw not in CLS:
        continue
    t = tags(other)
    cls = CLS[hw]
    if cls == 8 and t.get('service') in ('parking_aisle', 'driveway', 'drive-through'):
        continue
    geom = parse_gpkg(g)
    lines = [geom[1]] if geom[0] == 'LineString' else [p[1] for p in geom[1]]
    ow = t.get('oneway') in ('yes', '1', '-1') or hw in ('motorway',) or t.get('junction') == 'roundabout'
    rev = t.get('oneway') == '-1'
    layer = int(t.get('layer', '0')) if t.get('layer', '0').lstrip('-').isdigit() else 0
    tunnel = t.get('tunnel') in ('yes', 'building_passage', 'culvert') or (layer < 0 and t.get('covered') == 'yes')
    bridge = t.get('bridge') not in (None, 'no') or layer > 0
    try:
        lanes = int(t.get('lanes', '0').split(';')[0])
    except ValueError:
        lanes = 0
    w1, w2 = WIDTH[cls]
    width = (lanes * 3.5 + 1.0) if lanes else (w1 if ow else w2)
    width = max(3.5, min(24.0, width))
    if not lanes:
        lanes = max(1, round((width - 1) / 3.5)) if ow else max(1, round((width - 1) / 7))
    elif not ow:
        lanes = max(1, lanes // 2)
    flags = (1 if ow else 0) | (2 if bridge else 0) | (4 if tunnel else 0) | (8 if t.get('lit') in ('yes', '24/7') else 0)
    nid = name_id(name or t.get('name:ar'), t.get('name:en'))
    if tunnel:
        n_tunnel += 1
    for ln in lines:
        p = [xz(*q) for q in ln]
        if rev:
            p = p[::-1]
        p = rdp(p, 0.8)
        if len(p) < 2:
            continue
        s, n = add_pts(p, 'road')
        roads.append((cls | flags << 8 | min(lanes, 15) << 16 | int(width * 10 / 2) << 24, nid, s, n))
        if not tunnel:
            road_lines.append((p, width, cls))
road_pt_end = len(PTS['road']) // 2
print('roads', len(roads), 'tunnels', n_tunnel, 'pts', road_pt_end)

# ---------------------------------------------------------------- buildings
ST = {'villa': 0, 'shop': 2, 'apt': 3, 'glass': 4, 'stone': 5, 'mud': 6, 'plain': 8, 'mosque': 9}
SKIP = {'construction', 'roof', 'ruins', 'collapsed', 'no', 'proposed', 'demolished', 'carport', 'canopy'}


def parse_h(v):
    try:
        return float(v.replace('m', '').replace(',', '.').split(';')[0].strip())
    except Exception:
        return None


def corridor(x, z):
    # King Fahd Rd / Olaya spine, in the rotated grid frame
    u = x * math.cos(TH) + (-z) * math.sin(TH)
    v = -x * math.sin(TH) + (-z) * math.cos(TH)
    return -650 < u < 750 and -5200 < v < 12500


buildings, mosques = [], []
b_rings = []   # for the rasteriser
height_src = {'tag': 0, 'levels': 0, 'guess': 0}
for osm_id, way_id, g, name, bld, amen, other in con.execute(
        "select osm_id, osm_way_id, geom, name, building, amenity, other_tags from multipolygons where building is not null"):
    if bld in SKIP:
        continue
    t = tags(other)
    if t.get('building:part') == 'yes' and bld in ('yes',):
        pass
    geom = parse_gpkg(g)
    polys = [geom[1]] if geom[0] == 'Polygon' else [p[1] for p in geom[1]]
    ident = int(osm_id or way_id or 0)
    for rings in polys:
        ring = [xz(*q) for q in rings[0]]
        if len(ring) > 1 and ring[0] == ring[-1]:
            ring = ring[:-1]
        ring = rdp(ring + [ring[0]], 0.4)[:-1]
        if len(ring) < 3:
            continue
        A = area(ring)
        if abs(A) < 14:
            continue
        if A < 0:
            ring = ring[::-1]
        A = abs(A)
        cx = sum(p[0] for p in ring) / len(ring); cz = sum(p[1] for p in ring) / len(ring)
        if any((cx - x) ** 2 + (cz - z) ** 2 < r * r for x, z, r in DROPW):
            continue
        r1, r2 = rnd(ident, 1), rnd(ident, 2)
        h = parse_h(t.get('height', '')) if t.get('height') else None
        lv = parse_h(t.get('building:levels', '')) if t.get('building:levels') else None
        if h and h > 2:
            height_src['tag'] += 1
        elif lv:
            h = lv * 3.5 + 0.8; height_src['levels'] += 1
        else:
            height_src['guess'] += 1
            inK = (cx - KAFD[0]) ** 2 + (cz - KAFD[1]) ** 2 < 950 ** 2
            cor = corridor(cx, cz)
            if bld == 'house':
                h = (3 if r1 < 0.15 else 2) * 3.7 + 0.7
            elif bld in ('apartments', 'residential', 'dormitory'):
                h = (3 + int(r1 * 3)) * 3.3 + 0.8
            elif bld in ('mosque',) or amen == 'place_of_worship':
                h = 9 + r1 * 2
            elif bld in ('school', 'college', 'kindergarten'):
                h = 9 + r1 * 4
            elif bld in ('university', 'government', 'public', 'civic'):
                h = 12 + r1 * 10
            elif bld == 'hospital':
                h = 16 + r1 * 20
            elif bld == 'hotel':
                h = 25 + r1 * 50
            elif bld in ('industrial', 'warehouse', 'hangar', 'factory'):
                h = 8 + r1 * 4
            elif bld in ('shed', 'garage', 'garages', 'kiosk', 'service', 'hut', 'toilets', 'cabin', 'transformer_tower'):
                h = 3.2
            elif inK and A > 500:
                h = 60 + (r1 ** 1.3) * 200
            elif cor and A > 450 and bld in ('yes', 'commercial', 'office', 'retail'):
                h = 22 + (r1 ** 2.2) * 150
            elif bld in ('commercial', 'retail', 'office'):
                h = (2 + int(r1 * 2)) * 4.0 + 0.6 if A < 4000 else 12 + r1 * 6
            else:  # 'yes' and the rest: guess from the footprint
                h = 7.6 if A < 260 else ((2 + int(r1 * 3)) * 3.4 + 0.8 if A < 1500 else 10 + r1 * 6)
        h = max(3.0, min(h, 420.0))
        # facade style
        if bld == 'mosque' or amen == 'place_of_worship' or t.get('religion') == 'muslim':
            st = ST['mosque']
        elif (cx - MASMAK[0]) ** 2 + (cz - MASMAK[1]) ** 2 < 1100 ** 2 and h < 16:
            st = ST['mud'] if r2 < 0.7 else ST['apt']
        elif h > 26:
            st = ST['glass'] if (r2 < 0.62 or t.get('building:material') == 'glass') else ST['stone']
        elif bld == 'house':
            st = ST['villa']
        elif bld in ('commercial', 'retail'):
            st = ST['shop']
        elif bld in ('industrial', 'warehouse', 'hangar', 'factory', 'shed', 'garage', 'garages', 'service', 'kiosk'):
            st = ST['plain']
        elif bld in ('school', 'university', 'hospital', 'government', 'public', 'college', 'office', 'hotel'):
            st = ST['stone']
        elif bld in ('apartments', 'residential'):
            st = ST['apt']
        else:
            st = ST['villa'] if h < 9 else ST['apt']
        s, n = add_pts(ring, 'bld')
        buildings.append((st | int(h * 10) << 8, h32(ident) & 0xFFFFFF, s, n))
        b_rings.append(ring)
        if st == ST['mosque'] and A > 120:
            # minaret on the corner furthest from the centroid towards north-west, dome at the centre
            far = max(ring, key=lambda p: (p[0] - cx) * -0.6 + (p[1] - cz) * -0.8)
            mx, mz = cx + (far[0] - cx) * 0.8, cz + (far[1] - cz) * 0.8
            mosques.append((mx, mz, h + 14 + r1 * 16, min(9.0, math.sqrt(A) * 0.22), cx, cz, h))
print('buildings', len(buildings), height_src, 'mosques', len(mosques))

# ---------------------------------------------------------------- land use
LAND = {'park': 1, 'garden': 1, 'grass': 1, 'village_green': 1, 'recreation_ground': 1, 'pitch': 2, 'golf_course': 1,
        'farmland': 3, 'orchard': 3, 'farmyard': 3, 'plant_nursery': 3, 'meadow': 3, 'wood': 4, 'forest': 4,
        'scrub': 5, 'grassland': 5, 'water': 6, 'swimming_pool': 6, 'reservoir': 6, 'basin': 6, 'sand': 7, 'cemetery': 8}
land = []
for g, lu, le, nat, am, other in con.execute("select geom, landuse, leisure, natural, amenity, other_tags from multipolygons where building is null"):
    k = LAND.get(le) or LAND.get(lu) or LAND.get(nat) or (8 if am == 'grave_yard' else None)
    if t := tags(other):
        k = k or LAND.get(t.get('water')) and 6
    if not k:
        continue
    geom = parse_gpkg(g)
    polys = [geom[1]] if geom[0] == 'Polygon' else [p[1] for p in geom[1]]
    for rings in polys:
        ring = [xz(*q) for q in rings[0]][:-1]
        ring = rdp(ring + [ring[0]], 1.5)[:-1]
        if len(ring) < 3 or abs(area(ring)) < 40:
            continue
        if area(ring) < 0:
            ring = ring[::-1]
        s, n = add_pts(ring, 'land')
        land.append((k, s, n))
print('land', len(land))

# ---------------------------------------------------------------- rail (Riyadh Metro)
rail = []
for g, rw, other in con.execute("select geom, railway, other_tags from lines where railway in ('subway','light_rail','rail','monorail')"):
    t = tags(other)
    geom = parse_gpkg(g)
    lines = [geom[1]] if geom[0] == 'LineString' else [p[1] for p in geom[1]]
    layer = int(t.get('layer', '0')) if t.get('layer', '0').lstrip('-').isdigit() else 0
    flags = (2 if (t.get('bridge') not in (None, 'no') or layer > 0) else 0) | (4 if (t.get('tunnel') == 'yes' or layer < 0) else 0)
    for ln in lines:
        p = rdp([xz(*q) for q in ln], 1.0)
        if len(p) < 2:
            continue
        s, n = add_pts(p, 'rail')
        rail.append((flags, s, n))
print('rail', len(rail), 'elevated', sum(1 for r in rail if r[0] & 2))

# ---------------------------------------------------------------- generated infill along residential streets
# Many districts have streets mapped but few buildings. Plots are placed along residential streets wherever a
# 5 m occupancy raster (real buildings, road corridors, parks, water) is still free.
CELL = 5.0
X0, X1, Z0, Z1 = -26000.0, 30000.0, -22000.0, 20000.0
NX, NZ = int((X1 - X0) / CELL), int((Z1 - Z0) / CELL)
occ = np.zeros((NZ, NX), np.uint8)


def cells_of_poly(ring, val):
    a = np.asarray(ring)
    i0 = max(0, int((a[:, 0].min() - X0) / CELL)); i1 = min(NX - 1, int((a[:, 0].max() - X0) / CELL))
    j0 = max(0, int((a[:, 1].min() - Z0) / CELL)); j1 = min(NZ - 1, int((a[:, 1].max() - Z0) / CELL))
    if i1 < i0 or j1 < j0:
        return
    gx = X0 + (np.arange(i0, i1 + 1) + 0.5) * CELL
    gz = Z0 + (np.arange(j0, j1 + 1) + 0.5) * CELL
    PX, PZ = np.meshgrid(gx, gz)
    inside = np.zeros(PX.shape, bool)
    n = len(a)
    for k in range(n):
        xa, za = a[k]; xb, zb = a[(k + 1) % n]
        cond = (za > PZ) != (zb > PZ)
        with np.errstate(divide='ignore', invalid='ignore'):
            xi = (xb - xa) * (PZ - za) / (zb - za + 1e-12) + xa
        inside ^= cond & (PX < xi)
    sub = occ[j0:j1 + 1, i0:i1 + 1]
    sub[inside] = val
    # also the cells the outline passes through (small footprints)
    for x, z in ring:
        i = int((x - X0) / CELL); j = int((z - Z0) / CELL)
        if 0 <= i < NX and 0 <= j < NZ:
            occ[j, i] = val


for ring in b_rings:
    cells_of_poly(ring, 1)
for k, s, n in land:
    if k in (1, 2, 4, 6, 8):
        cells_of_poly([(pts[2 * i], pts[2 * i + 1]) for i in range(s, s + n)], 2)
for p, w, cls in road_lines:
    a = np.asarray(p)
    for q0, q1 in zip(a[:-1], a[1:]):
        L = math.hypot(*(q1 - q0))
        m = max(2, int(L / 2.5) + 1)
        t = np.linspace(0, 1, m)[:, None]
        sp = q0 + (q1 - q0) * t
        r = w / 2 + 1.0
        rr = int(math.ceil(r / CELL))
        ii = ((sp[:, 0] - X0) / CELL).astype(int); jj = ((sp[:, 1] - Z0) / CELL).astype(int)
        for di in range(-rr, rr + 1):
            for dj in range(-rr, rr + 1):
                if (di * CELL) ** 2 + (dj * CELL) ** 2 > r ** 2:
                    continue
                I = ii + di; J = jj + dj
                ok = (I >= 0) & (I < NX) & (J >= 0) & (J < NZ)
                occ[J[ok], I[ok]] = 3
print('raster done', {v: round(float((occ == v).mean()), 4) for v in (1, 2, 3)})


def free_rect(cx, cz, ux, uz, w, d):
    # sample a grid over the rotated plot
    for a in (-0.45, -0.15, 0.15, 0.45):
        for b in (-0.45, -0.15, 0.15, 0.45):
            x = cx + ux * a * w - uz * b * d
            z = cz + uz * a * w + ux * b * d
            i = int((x - X0) / CELL); j = int((z - Z0) / CELL)
            if not (0 <= i < NX and 0 <= j < NZ) or occ[j, i]:
                return False
    return True


def mark_rect(cx, cz, ux, uz, w, d):
    for a in np.linspace(-0.5, 0.5, max(2, int(w / CELL) + 2)):
        for b in np.linspace(-0.5, 0.5, max(2, int(d / CELL) + 2)):
            x = cx + ux * a * w - uz * b * d
            z = cz + uz * a * w + ux * b * d
            i = int((x - X0) / CELL); j = int((z - Z0) / CELL)
            if 0 <= i < NX and 0 <= j < NZ:
                occ[j, i] = 4


fill = []
FILL_CLS = {6: 'res', 7: 'res', 5: 'res', 4: 'shop', 3: 'shop'}
order = sorted(range(len(road_lines)), key=lambda k: -road_lines[k][2])  # residential first (higher cls number)
for k in order:
    p, w, cls = road_lines[k]
    kind = FILL_CLS.get(cls)
    if not kind:
        continue
    a = np.asarray(p)
    for si, (q0, q1) in enumerate(zip(a[:-1], a[1:])):
        L = math.hypot(*(q1 - q0))
        if L < 26:
            continue
        ux, uz = (q1 - q0) / L
        nx, nz = -uz, ux
        step = 22.0 if kind == 'res' else 18.0
        depth = 24.0 if kind == 'res' else 20.0
        t = 10.0
        while t < L - 10.0:
            for side in (-1, 1):
                off = w / 2 + 4.0 + depth / 2
                cx = q0[0] + ux * t + nx * off * side
                cz = q0[1] + uz * t + nz * off * side
                if free_rect(cx, cz, ux, uz, step - 1.0, depth):
                    mark_rect(cx, cz, ux, uz, step, depth + 1.5)
                    sd = h32(int(cx * 7) ^ int(cz * 13))
                    r1 = (sd & 0xFFFF) / 65536.0
                    yaw = math.atan2(-uz, ux)  # rotation about y that maps local +x to the street direction
                    if kind == 'shop' and r1 < 0.65:
                        style, hgt = 2, (2 + int(r1 * 3)) * 4.0 + 0.6
                    elif r1 < 0.12:
                        style, hgt = 3, (3 + int(r1 * 20)) * 3.3 + 0.8
                    else:
                        style, hgt = 0, (3 if r1 > 0.85 else 2) * 3.7 + 0.7
                    # the house faces the street: store the side so the generator can push it back
                    fill.append((cx, cz, yaw if side > 0 else yaw + math.pi, step - 0.8, depth, hgt, style + ((sd >> 16) & 0xFFF) / 4096.0 * 0.999))
            t += step
print('fill', len(fill))

# ---------------------------------------------------------------- write (three files, each under 15 MB)
os.makedirs(OUT, exist_ok=True)
files = {}


def write(fname, parts):
    blob, secs = bytearray(), {}
    for name, arr in parts:
        while len(blob) % 4:
            blob += b'\0'
        secs[name] = {'offset': len(blob), 'length': int(arr.size), 'type': str(arr.dtype)}
        blob += arr.tobytes()
    with open(os.path.join(OUT, fname), 'wb') as f:
        f.write(blob)
    files[fname] = secs
    print(fname, round(len(blob) / 1e6, 2), 'MB, gzip', round(len(zlib.compress(bytes(blob), 6)) / 1e6, 2))


u32 = lambda rows: np.asarray(rows, np.uint32).reshape(-1) if rows else np.zeros(0, np.uint32)
f32 = lambda rows: np.asarray(rows, np.float32).reshape(-1) if rows else np.zeros(0, np.float32)
write('riyadh-roads.bin', [('roads', u32(roads)), ('roadPts', f32(PTS['road'])), ('land', u32(land)), ('landPts', f32(PTS['land'])),
                           ('rail', u32(rail)), ('railPts', f32(PTS['rail']))])
write('riyadh-buildings.bin', [('buildings', u32(buildings)), ('bldPts', f32(PTS['bld'])), ('mosques', f32(mosques))])
# infill packed to 12 bytes: f32 x, f32 z, u8 yaw/2pi*256, u8 width*4, u8 depth*4, u8 (height-2)*4 -> as 4 bytes
fx = np.asarray([(f[0], f[1]) for f in fill], np.float32).reshape(-1)
fb = np.asarray([(int(((f[2] / (2 * math.pi)) % 1) * 256) & 255, min(255, int(f[3] * 4)), min(255, int(f[4] * 4)),
                  min(255, int((f[5] - 2) * 4))) for f in fill], np.uint8).reshape(-1)
fs = np.asarray([int(f[6]) | (int((f[6] % 1) * 255) << 4) for f in fill], np.uint16)
write('riyadh-fill.bin', [('fillXZ', fx), ('fillDims', fb), ('fillStyle', fs)])

meta = {
    'frame': {'lat0': LAT0, 'lon0': LON0, 'mlat': MLAT, 'mlon': MLON},
    'files': files, 'names': names,
    'counts': {'roads': len(roads), 'buildings': len(buildings), 'land': len(land), 'rail': len(rail), 'fill': len(fill), 'mosques': len(mosques)},
    'heights': height_src,
    'places': {k: {'lat': v[0], 'lon': v[1]} for k, v in P.items()},
    'attribution': 'Map data © OpenStreetMap contributors (ODbL), extract via BBBike'
}
with open(os.path.join(OUT, 'riyadh.json'), 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
