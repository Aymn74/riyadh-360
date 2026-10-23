// tests/run.mjs — browser regression tests for Slop Riyadh.
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
    await page.evaluate(() => { __riyadh.tourist.toggle(false); __riyadh.startTour(); });
    inside(await fits('#tour-panel'), 'tour builder');
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
