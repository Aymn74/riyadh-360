# gpkg.py — minimal GeoPackage geometry reader (GP header + WKB), no GDAL needed.
import struct
import re

ENV_SIZE = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}


def parse_gpkg(blob):
    if blob is None or blob[:2] != b'GP':
        return None
    flags = blob[3]
    env = ENV_SIZE[(flags >> 1) & 7]
    return parse_wkb(memoryview(blob)[8 + env:])


def parse_wkb(b):
    out, _ = _wkb(b, 0)
    return out


def _wkb(b, o):
    le = b[o] == 1
    e = '<' if le else '>'
    t = struct.unpack_from(e + 'I', b, o + 1)[0]
    o += 5
    base = t % 1000
    dims = 3 if (t // 1000) in (1, 2) or (t & 0x80000000) else 2
    base &= 0xFF
    if base == 1:
        pt = struct.unpack_from(e + 'd' * dims, b, o)
        return ('Point', pt[:2]), o + 8 * dims
    if base == 2:
        n = struct.unpack_from(e + 'I', b, o)[0]
        o += 4
        pts = struct.unpack_from(e + 'd' * (dims * n), b, o)
        return ('LineString', [(pts[i], pts[i + 1]) for i in range(0, len(pts), dims)]), o + 8 * dims * n
    if base == 3:
        nr = struct.unpack_from(e + 'I', b, o)[0]
        o += 4
        rings = []
        for _ in range(nr):
            n = struct.unpack_from(e + 'I', b, o)[0]
            o += 4
            pts = struct.unpack_from(e + 'd' * (dims * n), b, o)
            rings.append([(pts[i], pts[i + 1]) for i in range(0, len(pts), dims)])
            o += 8 * dims * n
        return ('Polygon', rings), o
    if base in (4, 5, 6, 7):
        n = struct.unpack_from(e + 'I', b, o)[0]
        o += 4
        parts = []
        for _ in range(n):
            g, o = _wkb(b, o)
            parts.append(g)
        return ({4: 'MultiPoint', 5: 'MultiLineString', 6: 'MultiPolygon', 7: 'Collection'}[base], parts), o
    raise ValueError('wkb type %d' % t)


TAG_RE = re.compile(r'"((?:[^"\\]|\\.)*)"=>"((?:[^"\\]|\\.)*)"')


def tags(s):
    return {k: v for k, v in TAG_RE.findall(s or '')}
