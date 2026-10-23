# tests/test_gpkg.py — the GeoPackage geometry reader across XY, XYZ, XYM and XYZM, ISO and EWKB flavours.
# usage: python3 -I tests/test_gpkg.py
import os
import struct
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
from gpkg import parse_gpkg  # noqa: E402

PTS = [(46.0, 24.0), (47.0, 25.0), (48.0, 26.0)]


def gp(wkb):
    return b'GP' + bytes([0, 1]) + struct.pack('<i', 4326) + wkb   # no envelope


def coords(p, extra):
    return struct.pack('<' + 'd' * (2 + extra), *p, *([7.0] * extra))


def line(t, extra, pts=PTS):
    return struct.pack('<BII', 1, t, len(pts)) + b''.join(coords(p, extra) for p in pts)


def polygon(t, extra, rings):
    return struct.pack('<BII', 1, t, len(rings)) + b''.join(struct.pack('<I', len(r)) + b''.join(coords(p, extra) for p in r) for r in rings)


failures = 0
for name, t_iso, t_ewkb, extra in [('XY', 2, 2, 0), ('XYZ', 1002, 2 | 0x80000000, 1), ('XYM', 2002, 2 | 0x40000000, 1), ('XYZM', 3002, 2 | 0xC0000000, 2)]:
    for flavour, t in (('ISO', t_iso), ('EWKB', t_ewkb)):
        kind, pts = parse_gpkg(gp(line(t, extra)))
        ok = kind == 'LineString' and pts == PTS
        # the same shape inside a polygon and a multi-geometry, to check the stride carries on correctly
        ring = PTS + [PTS[0]]
        kind2, rings = parse_gpkg(gp(polygon(t + 1, extra, [ring, ring])))
        ok = ok and kind2 == 'Polygon' and rings == [ring, ring]
        multi = struct.pack('<BII', 1, t + 3, 2) + line(t, extra) + line(t, extra)
        kind3, parts = parse_gpkg(gp(multi))
        ok = ok and kind3 == 'MultiLineString' and all(p == ('LineString', PTS) for p in parts)
        print(('ok  ' if ok else 'FAIL'), name, flavour)
        failures += not ok
print('all passed' if not failures else f'{failures} failed')
sys.exit(1 if failures else 0)
