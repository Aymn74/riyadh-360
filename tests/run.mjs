// tests/run.mjs — browser regression tests for Riyadh 360.
// usage: node tests/run.mjs            (needs playwright; set CHROME=/path/to/chrome to use a local browser,
//                                       THREE_DIR=/path/to/node_modules/three to serve three.js without the network)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = await import('playwright').catch(() => import('playwright-core'));

const ROOT = process.env.ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.txt': 'text/plain', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = p.endsWith('/') ? path.join(p, 'index.html') : p;
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});

let failed = 0;
const results = [];
const open_ = [];
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const t0 = Date.now();
  try { await fn(); results.push(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) { failed++; results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
  finally { while (open_.length) await open_.pop().close().catch(() => {}); }   // a failed test must not leave a page rendering
  console.log(results[results.length - 1]);
}
const assert = (c, m) => { if (!c) throw new Error(m); };

// a page with three.js served locally when THREE_DIR is set, and optional per-test request handlers
async function open({ width = 1280, height = 800, mobile = false, routes = {}, init } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width, height } });
  open_.push(ctx);
  const page = await ctx.newPage();
  page.errors = []; page.csp = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) page.csp.push(m.text()); });
  if (init) await page.addInitScript(init);
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    for (const [pattern, handler] of Object.entries(routes)) if (u.href.includes(pattern)) return handler(route);
    if (u.hostname === 'cdn.jsdelivr.net' && process.env.THREE_DIR) {
      return route.fulfill({ path: path.join(process.env.THREE_DIR, u.pathname.replace(/^\/npm\/three@[^/]+\//, '')), contentType: 'application/javascript' });
    }
    if (u.hostname.endsWith('fonts.googleapis.com') || u.hostname.endsWith('fonts.gstatic.com')) return route.abort();
    return route.continue();
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { page, close: () => ctx.close() };
}
const ready = (page) => page.waitForFunction(() => window.__riyadh && window.__riyadh.guide && !document.getElementById('loading-overlay'), null, { timeout: 240000 });

// ---------------------------------------------------------------- tests
await test('place names from the map are shown as text, never run as markup', async () => {
  const evil = '<img src=x onerror="window.__pwned=1">';
  const { page, close } = await open({
    routes: {
      'riyadh-poi.json': (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ poi: [['restaurant', 24.7114, 46.6744, evil, evil, evil]] }) })
    }
  });
  await ready(page);
  await page.evaluate(() => __riyadh.guide.openList('food'));
  await page.waitForSelector('#guide-list button', { timeout: 20000 });
  await page.locator('#guide-list button', { hasText: '<img' }).first().click();
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ pwned: window.__pwned, title: document.querySelector('#guide-card h3').textContent, imgs: document.querySelectorAll('#guide-card img').length }));
  assert(!r.pwned, 'the injected handler ran');
  assert(r.imgs === 0 && r.title.includes('<img'), 'the name was not shown literally');
  await close();
});

await test('shops and restaurants recover after a failed first load', async () => {
  let n = 0;
  const { page, close } = await open({ routes: { 'riyadh-poi.json': (r) => (++n === 1 ? r.abort() : r.continue()) } });
  await ready(page);
  await page.evaluate(() => __riyadh.guide.openList('food'));
  await page.waitForSelector('#guide-list [data-retry]', { timeout: 20000 });
  await page.click('#guide-list [data-retry]');
  await page.waitForFunction(() => document.querySelectorAll('#guide-list button').length > 5, null, { timeout: 20000 });
  assert(n === 2, `expected two requests, got ${n}`);
  await close();
});

await test('the road network recovers after a failed first load', async () => {
  let n = 0;
  const { page, close } = await open({ routes: { 'riyadh-route.b64.txt': (r) => (++n === 1 ? r.abort() : r.continue()) } });
  await ready(page);
  await page.evaluate(() => { const g = __riyadh.guide; return g.go(g.pins.find((p) => p.g.key === 'museum').g); });
  const msg = await page.textContent('#guide-nav span');
  assert(/إعادة المحاولة/.test(msg), 'no retry offered: ' + msg);
  await page.click('#guide-nav span');
  await page.waitForFunction(() => __riyadh.guide.router && __riyadh.guide.route, null, { timeout: 60000 });
  assert(n === 2, `expected two requests, got ${n}`);
  await close();
});

await test('every landmark can be reached by car and on foot, and walking keeps off motorways', async () => {
  const { page } = await open({ width: 640, height: 400 });
  await ready(page);
  const r = await page.evaluate(async () => {
    const G = __riyadh.guide, o = __riyadh.osm, p = __riyadh.player.pos;
    await G.ensureRouter();
    const out = { car: [], walk: [], motorway: [] };
    for (const mode of ['car', 'walk']) for (const g of G.pins.map((q) => q.g)) {
      const route = G.routerFor(mode).route(p.x, p.z, g.x, g.z);
      if (!route) { out[mode].push(g.key); continue; }
      if (mode === 'walk' && route.pieces.some(([road]) => o.cls(road) === 0 || o.cls(road) === 9)) out.motorway.push(g.key);
    }
    return out;
  });
  assert(!r.car.length, 'no car route to ' + r.car.join(', '));
  assert(!r.walk.length, 'no walking route to ' + r.walk.join(', '));
  assert(!r.motorway.length, 'walking routes on motorways to ' + r.motorway.join(', '));
});

await test('guidance switches network with the travel mode, and says so when there is no road', async () => {
  const { page } = await open({ width: 640, height: 400 });
  await ready(page);
  await page.evaluate(() => { const g = __riyadh.guide; return g.go(g.pins.find((p) => p.g.key === 'museum').g); });
  await page.waitForFunction(() => __riyadh.guide.routeMode === 'car' && __riyadh.guide.route, null, { timeout: 60000 });
  await page.evaluate(() => __riyadh.setMode('person'));
  await page.waitForFunction(() => __riyadh.guide.routeMode === 'walk', null, { timeout: 30000 });
  // a spot far out in the desert, beyond every street
  await page.evaluate(() => __riyadh.guide.go({ key: 'spot', ar: 'الصحراء', en: 'Desert', x: 60000, z: 60000, h: 10, desc: '' }));
  await page.waitForFunction(() => /لا يوجد طريق/.test(document.querySelector('#guide-nav span').textContent), null, { timeout: 30000 });
});

await test('Isha moves to two hours after Maghrib in Ramadan', async () => {
  const { page } = await open({ width: 640, height: 400 });
  await ready(page);
  const r = await page.evaluate(async () => {
    const { prayerTimes } = await import('./js/tourist.js');
    const gap = (d) => { const t = prayerTimes(new Date(d)); return Math.round((t.isha - t.maghrib) * 60); };
    return { ramadan: gap('2026-03-01T12:00:00Z'), other: gap('2026-10-23T12:00:00Z') };
  });
  assert(r.ramadan === 120 && r.other === 90, JSON.stringify(r));
});

await test('narration still speaks after a tour was paused and then ended', async () => {
  // a stand-in speech engine that behaves like Chrome's: a paused engine stays paused through cancel()
  const { page } = await open({
    width: 640, height: 400,
    init: () => {
      const fake = { paused: false, speaking: false, pending: false, spoken: [], getVoices: () => [], onvoiceschanged: null,
        speak(u) { if (!this.paused) this.spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); },
        cancel() {}, pause() { this.paused = true; }, resume() { this.paused = false; } };
      Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    }
  });
  await ready(page);
  const r = await page.evaluate(async () => {
    const t = __riyadh.tour, s = window.speechSynthesis;
    __riyadh.startTour(); t.stops = t.plan('history', 'short'); t.start(t.from, t.fromLook);
    t.el.querySelector('[data-a="pause"]').click();
    t.stop();
    s.spoken.length = 0;
    __riyadh.startTour(); t.stops = t.plan('history', 'short'); t.start(t.from, t.fromLook);
    await new Promise((res) => setTimeout(res, 50));
    t.stop();
    return { paused: s.paused, spoken: s.spoken.length };
  });
  assert(!r.paused && r.spoken > 0, JSON.stringify(r));
});

await test('food and shopping sort into traditional, fast food, Asian, souqs and malls', async () => {
  const { page, close } = await open();
  await ready(page);
  const r = await page.evaluate(async () => {
    const g = __riyadh.guide, poi = await g.loadPoi();
    const sub = (re) => (poi.find((p) => re.test(p.en) || re.test(p.ar)) || {}).sub;
    g.openList('food');
    await new Promise((res) => setTimeout(res, 300));
    document.querySelector('#guide-card [data-sub="fast"]').click();
    await new Promise((res) => setTimeout(res, 300));
    const shown = [...document.querySelectorAll('#guide-list .g-nm small')].map((e) => e.textContent);
    return { kudu: sub(/^Kudu$/), bukhara: sub(/Bukhara Alhara/), sushi: sub(/Gold Sushi/), zal: sub(/سوق الزل/), mall: sub(/النخيل مول/), dunkin: sub(/Dunkin/),
      counted: !!document.querySelector('#guide-card [data-sub="asian"] small'), allFast: shown.length > 0 && shown.every((t) => /وجبات سريعة/.test(t)) };
  });
  assert(r.kudu === 'fast' && r.bukhara === 'trad' && r.sushi === 'asian' && r.zal === 'souq' && r.mall === 'mall' && r.dunkin === 'sweet' && r.counted && r.allFast, JSON.stringify(r));
  await close();
});

await test('a custom tour orders its stops for the shortest trip and can be driven stop by stop', async () => {
  const { page, close } = await open();
  await ready(page);
  const r = await page.evaluate(async () => {
    const { bestPath } = await import('./js/tour.js');
    // five points on a line, given out of order: the best open path from the start walks them in order
    const xs = [0, 4, 1, 3, 2], D = xs.map((a) => xs.map((b) => Math.abs(a - b)));
    const line = bestPath(D).join();
    const t = __riyadh.tour, g = __riyadh.guide;
    t.pick = ['turaif', 'masmak', 'boulevard', 'zal'];
    __riyadh.startTour('custom');
    const len = (keys) => { let p = t.from, s = 0; for (const k of keys) { const q = t.spot(k); s += Math.hypot(q.x - p.x, q.z - p.z); p = q; } return s; };
    const before = len(t.pick);
    await t.bestOrder();
    const after = len(t.pick), road = !!t.legs;
    t.el.querySelector('[data-a="drive"]').click();
    return { line, before, after, road, order: t.pick.join(), plan: g.plan && g.plan.stops.map((s) => s.key).join(), dest: g.dest && g.dest.key, hidden: t.el.hidden };
  });
  assert(r.line === '2,4,3,1' && r.after < r.before && r.road && r.plan === r.order && r.dest === r.order.split(',')[0] && r.hidden, JSON.stringify(r));
  await close();
});

await test('the car turns tightly enough for an exit at 60 km/h, and lane keeping waits for the driver to let go', async () => {
  const { page, close } = await open();
  await ready(page);
  const r = await page.evaluate(() => {
    const p = __riyadh.player;
    __riyadh.setMode('car');
    p.osm = null;   // open ground: no walls, no lane keeping pull
    const run = (secs, inp) => { for (let t = 0; t < secs; t += 1 / 60) p.update(1 / 60, { up: true, ...inp }, null); };
    p.yaw = 0; p.steer = 0; p.speed = 16.7;
    const y0 = p.yaw; run(2, { up: false, left: true });
    const turned = p.yaw - y0, kmh = p.speed * 3.6;
    // full lock at walking pace: about a 6 m circle
    p.speed = 2; p.steer = 1; const y1 = p.yaw; for (let t = 0; t < 1; t += 1 / 60) p.update(1 / 60, { left: true }, null);
    const slowRate = p.yaw - y1, radius = 2 / Math.max(1e-6, slowRate);
    return { turned, kmh, radius };
  });
  // at 60 km/h a full lock for two seconds swings the car through more than 60 degrees (a 30 m arc)
  assert(r.turned > 0.95 && r.kmh > 55 && r.radius > 5 && r.radius < 7.5, JSON.stringify(r));
  await close();
});

await test('the touch steering wheel turns the car and springs back when let go', async () => {
  const { page, close } = await open({ width: 390, height: 780, mobile: true });
  await ready(page);
  const r = await page.evaluate(async () => {
    __riyadh.setMode('car');
    // the software renderer draws only a few frames a second: wait for frames, not milliseconds
    const frames = (n) => new Promise((res) => { const f0 = __riyadh.renderer.info.render.frame; const t = () => (__riyadh.renderer.info.render.frame - f0 >= n ? res() : setTimeout(t, 50)); t(); });
    const w = document.getElementById('touch-wheel'), b = w.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2, R = b.width * 0.42;
    const ev = (t, a) => w.dispatchEvent(new PointerEvent(t, { pointerId: 9, clientX: cx + Math.cos(a) * R, clientY: cy + Math.sin(a) * R, bubbles: true, pointerType: 'touch', isPrimary: true }));
    const shown = getComputedStyle(w).display !== 'none' && getComputedStyle(document.getElementById('touch-stick')).display === 'none';
    ev('pointerdown', -Math.PI / 2);
    for (let k = 1; k <= 10; k++) ev('pointermove', -Math.PI / 2 + k * 0.157);   // a quarter turn clockwise
    await frames(4);
    const held = __riyadh.player.steer, heldDeg = +w.getAttribute('aria-valuenow');
    ev('pointerup', 0);
    await frames(12);
    return { shown, held, heldDeg, after: __riyadh.player.steer, value: +w.getAttribute('aria-valuenow') };
  });
  // turning the wheel right steers right; once released it returns to the centre
  assert(r.shown && r.held < -0.4 && r.heldDeg > 80 && Math.abs(r.after) < 0.1 && Math.abs(r.value) < 8, JSON.stringify(r));
  await close();
});

await test('inside a tunnel the daylight fades and the driver\'s seat stays inside the tube', async () => {
  const { page, close } = await open();
  await ready(page);
  const r = await page.evaluate(async () => {
    const R = __riyadh, o = R.osm, p = R.player;
    const frames = (n) => new Promise((res) => { const f0 = R.renderer.info.render.frame; const t = () => (R.renderer.info.render.frame - f0 >= n ? res() : setTimeout(t, 50)); t(); });
    // the longest covered tunnel, half way along
    let best = null;
    for (const [r, pr] of o.vprof) if (pr.H < 0 && (o.flags(r) & 4)) { const n = o.s.roads[r * 4 + 3]; if (!best || n > best.n) best = { r, n }; }
    const st = o.s.roads[best.r * 4 + 2], P = o.s.roadPts, i = st + Math.floor(best.n / 2);
    R.setMode('car');
    p.pos.x = (P[i * 2] + P[i * 2 + 2]) / 2; p.pos.z = (P[i * 2 + 1] + P[i * 2 + 3]) / 2; p.yaw = Math.atan2(-(P[i * 2 + 3] - P[i * 2 + 1]), P[i * 2 + 2] - P[i * 2]);
    p.gy = -7; p.gy = p.groundAt(p.pos.x, p.pos.z); p.speed = 0;
    const sun = R.scene.children.find((c) => c.isDirectionalLight), sun0 = sun.intensity;
    // the light fades over about a second of game time; slow software frames advance it in small steps
    for (let k = 0; k < 8 && sun.intensity / sun0 > 0.2; k++) await frames(12);
    const dimmed = sun.intensity / sun0;
    R.setCamera('pov'); await frames(3);
    const eye = R.camera.position.y;
    R.setCamera('chase');
    return { gy: p.gy, dimmed, eye };
  });
  assert(r.gy < -5 && r.dimmed < 0.3 && r.eye < r.gy + 2.5 && r.eye > r.gy, JSON.stringify(r));
  await close();
});

for (const [w, h] of [[390, 667], [844, 390], [360, 640]]) {
  await test(`guide, tour and tourist panels fit a ${w}x${h} screen`, async () => {
    const { page, close } = await open({ width: w, height: h, mobile: true });
    await ready(page);
    const fits = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }, sel);
    const inside = (r, what) => assert(r.top >= -0.5 && r.left >= -0.5 && r.bottom <= h + 0.5 && r.right <= w + 0.5, `${what} outside the screen: ${JSON.stringify(r)}`);
    await page.evaluate(() => __riyadh.guide.openList('all'));
    inside(await fits('#guide-card'), 'guide');
    await page.evaluate(() => { document.querySelector('#guide-card .g-x').click(); __riyadh.tourist.toggle(true); });
    inside(await fits('#tourist-panel'), 'tourist panel');
    await page.evaluate(() => { __riyadh.tourist.toggle(false); __riyadh.startTour('ready'); });
    inside(await fits('#tour-panel'), 'tour builder');
    // the custom builder with a long route still fits, and on a portrait phone its start buttons show without scrolling
    await page.evaluate(() => { const t = __riyadh.tour; t.pick = ['masmak', 'zal', 'hokm', 'museum', 'murabba', 'kingdom', 'faisaliah', 'boulevard', 'turaif']; __riyadh.startTour('custom'); });
    inside(await fits('#tour-panel'), 'custom tour builder');
    if (h > w) inside(await fits('#tour-panel [data-a="drive"]'), 'drive button');
    await close();
  });
}

await test('an engine that cannot be fetched ends in a message with a retry button', async () => {
  const { page, close } = await open({ routes: { 'cdn.jsdelivr.net': (r) => r.abort() } });
  await page.waitForSelector('#loading-overlay.error .boot-retry', { timeout: 30000 });
  await close();
});

await test('a browser without WebGL2 ends in a clear message', async () => {
  const { page, close } = await open({ init: () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; } });
  await page.waitForSelector('#loading-overlay.error .boot-retry', { timeout: 30000 });
  const t = await page.textContent('#loading-status');
  assert(/WebGL2/.test(t), 'unexpected message: ' + t);
  await close();
});

await test('the page starts with no script errors and no content-policy violations', async () => {
  const { page, close } = await open();
  await ready(page);
  await page.waitForTimeout(2000);
  assert(page.errors.length === 0, 'page errors: ' + page.errors.join(' | '));
  assert(page.csp.length === 0, 'policy violations: ' + page.csp.join(' | '));
  await close();
});

await browser.close();
server.close();
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
