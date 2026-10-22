# Slop Riyadh

A 3D Riyadh in the browser (three.js, WebGL), inspired by [mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork).

**[Open it live](https://aymn74.github.io/slop-riyadh/)**
Walk, drive a white Land Cruiser, or fly a helicopter along King Fahd Road, Olaya, KAFD, Dirah and Diriyah.

Open `index.html` through any static server (for example `npx serve .`). The live copy is served by GitHub Pages.

## Data

Streets, buildings, parks, water and the metro come from OpenStreetMap (© OpenStreetMap contributors, ODbL),
extracted with BBBike as a GeoPackage and converted by `tools/build_osm.py`:

```
python3 -I tools/build_osm.py riyadh.gpkg data/
for f in data/*.bin; do base64 -w 0 "$f" > "${f%.bin}.b64.txt"; done   # the page loads the base64 text files
```

- 92,656 road ways with names (Arabic and English), lanes, one-way, bridges and tunnels.
- 89,040 building footprints. Few carry a height in OSM, so heights are estimated from the building type,
  footprint size and location (towers along King Fahd Road and in KAFD).
- 412,300 generated villa, shop and apartment plots fill districts where streets are mapped but buildings are not.
  They are placed only along real residential streets, on land left free by mapped buildings, roads and parks.
- Kingdom Centre, Al Faisaliah, PIF Tower, Burj Rafal, Masmak, the Water Tower, the TV Tower, the Ministry of
  Interior and At-Turaif are hand-built models placed at their OSM positions.

## Files

- `js/osm.js`: loads the OSM data, spatial grid, nearest-road and inside-building queries
- `js/world.js`: builds 1 km chunks: road ribbons, pavements, extruded buildings, land use, infill, lamps, palms
- `js/cars.js`: traffic following the real road network
- `js/geo.js`: coordinate frame, landmark positions, districts
- `js/city.js`: instancing helpers (and the older procedural generator)
- `js/materials.js`: procedural facade shader (windows, shopfronts, night lights), ground, sky, palms
- `js/landmarks.js`: hand-built landmarks and the Metro Line 1 viaduct
- `js/traffic.js`: lane-following traffic with signals, car models
- `js/player.js`: walking, driving, helicopter
- `js/main.js`: renderer, time-of-day presets (noon, maghrib, night, haboob), cameras, HUD, minimap, atlas

Controls: WASD/arrows, Shift boost, Space jump/climb, Q descend, 1–3 modes, V cameras, C cockpit, M map, T time, H hide HUD.
