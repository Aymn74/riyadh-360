# build_poi.py — named shops, markets, restaurants and cafés from the OSM GeoPackage, for the guide.
# usage: python3 -I tools/build_poi.py <riyadh.gpkg> <out_dir>
import json
import math
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpkg import parse_gpkg, tags

GPKG, OUT = sys.argv[1], sys.argv[2]
KIND_RE = re.compile(r'"(amenity|shop|cuisine)"=>"([^"]+)"')


def kind_of(t, cols):
    shop, amenity = cols.get('shop') or t.get('shop'), cols.get('amenity') or t.get('amenity')
    if shop in ('mall', 'shopping_centre', 'department_store'):
        return 'mall'
    if amenity == 'marketplace':
        return 'market'
    if amenity == 'restaurant':
        return 'restaurant'
    if amenity == 'fast_food':
        return 'fast'
    if amenity == 'cafe' or shop == 'coffee':
        return 'cafe'
    return None


def centroid(geom):
    pts = []

    def walk(d):
        if isinstance(d, str):
            return
        if isinstance(d, (list, tuple)) and len(d) == 2 and all(isinstance(v, float) for v in d):
            pts.append(d)
            return
        for e in d:
            walk(e)
    walk(geom)
    if not pts:
        return None
    return sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)


con = sqlite3.connect(GPKG)
out = []
for tbl in ('points', 'multipolygons'):
    extra = ', amenity, shop' if tbl == 'multipolygons' else ''
    for r in con.execute(f'select name, other_tags, geom{extra} from {tbl} where name is not null'):
        name, ot, g = r[0].strip(), r[1] or '', r[2]
        t = tags(ot)
        cols = {'amenity': r[3], 'shop': r[4]} if tbl == 'multipolygons' else {}
        k = kind_of(t, cols)
        # traditional markets are often tagged as malls or shops: the word "souq" decides
        if k in ('mall', None) and re.search(r'(^|\s)(سوق|أسواق|اسواق)\s', name + ' ') and (k or t.get('shop') in ('yes', 'general', 'clothes')):
            k = 'market'
        if not k:
            continue
        # a market must call itself one: many shops are tagged marketplace by mistake
        if k == 'market' and not re.search(r'(^|[^أا])سوق|souq|souk|suq\b', name, re.I):
            continue
        c = centroid(parse_gpkg(g))
        if not c:
            continue
        en = t.get('name:en', '')
        if re.fullmatch(r'[A-Za-z0-9 &\'.,\-]+', name) and not en:
            en = name
        out.append([k, round(c[0], 5), round(c[1], 5), name, en, (t.get('cuisine') or '').split(';')[0]])

# drop repeats: the same name within 60 m (a mall drawn as an area and as a point)
out.sort(key=lambda p: (p[3], p[1]))
keep = []
for p in out:
    if keep and keep[-1][3] == p[3] and math.hypot((keep[-1][1] - p[1]) * 110770, (keep[-1][2] - p[2]) * 101200) < 60:
        continue
    keep.append(p)
counts = {}
for p in keep:
    counts[p[0]] = counts.get(p[0], 0) + 1
print('poi', len(keep), counts)
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'riyadh-poi.json'), 'w', encoding='utf-8') as f:
    json.dump({'fields': ['kind', 'lat', 'lon', 'name', 'name_en', 'cuisine'], 'poi': keep, 'attribution': 'Map data © OpenStreetMap contributors (ODbL)'},
              f, ensure_ascii=False, separators=(',', ':'))
