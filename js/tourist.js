// tourist.js — the tourist panel: Riyadh time and prayer times, nearby places, the nearest mosque,
// tours, a surprise, the Riyadh passport of visited landmarks and an Arabic phrase of the day.
import { GUIDE } from './guide.js';
import { esc } from './util.js';

// ---------------------------------------------------------------- prayer times (Umm al-Qura: Fajr 18.5°, Isha 90 min after Maghrib)
const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const fix = (a, b) => { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; };
export function prayerTimes(date, lat = 24.7136, lon = 46.6753, tz = 3) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
  let Y = y, M = m; if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
  const jd0 = Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5 - lon / (15 * 24);
  const sun = (t) => {
    const D = jd0 + t - 2451545.0;
    const g = rad(fix(357.529 + 0.98560028 * D, 360)), q = fix(280.459 + 0.98564736 * D, 360);
    const L = rad(fix(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g), 360));
    const e = rad(23.439 - 0.00000036 * D);
    const RA = deg(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))) / 15;
    return { decl: Math.asin(Math.sin(e) * Math.sin(L)), eqt: q / 15 - fix(RA, 24) };
  };
  const noon = (t) => fix(12 - sun(t).eqt, 24);
  const angleTime = (angle, t, before) => {
    const { decl } = sun(t), p = rad(lat);
    const T = deg(Math.acos((-Math.sin(rad(angle)) - Math.sin(decl) * Math.sin(p)) / (Math.cos(decl) * Math.cos(p)))) / 15;
    return noon(t) + (before ? -T : T);
  };
  const asr = (t) => { const { decl } = sun(t); return angleTime(-deg(Math.atan(1 / (1 + Math.tan(Math.abs(rad(lat) - decl))))), t, false); };
  let h = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18 };
  for (let k = 0; k < 2; k++) h = { fajr: angleTime(18.5, h.fajr / 24, true), sunrise: angleTime(0.833, h.sunrise / 24, true), dhuhr: noon(h.dhuhr / 24), asr: asr(h.asr / 24), maghrib: angleTime(0.833, h.maghrib / 24, false) };
  const local = (x) => x + tz - lon / 15;
  const out = { fajr: local(h.fajr), sunrise: local(h.sunrise), dhuhr: local(h.dhuhr) + 1 / 60, asr: local(h.asr), maghrib: local(h.maghrib) };
  // Isha is 90 minutes after Maghrib, and 120 during Ramadan (the Umm al-Qura rule)
  out.ramadan = hijriMonth(date) === 9;
  out.isha = out.maghrib + (out.ramadan ? 2 : 1.5);
  return out;   // hours of the Riyadh day
}
const PRAYER_AR = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
const PRAYER_EN = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
const AR = (s) => String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const hm = (h) => { const t = Math.round(h * 60), H = Math.floor(t / 60) % 24, Mi = t % 60; return AR((H % 12 || 12) + ':' + String(Mi).padStart(2, '0')) + (H < 12 ? ' ص' : ' م'); };
const fmtDist = (m) => (m < 1000 ? AR(Math.round(m / 10) * 10) + ' م' : AR((m / 1000).toFixed(1)) + ' كم');
// Riyadh's clock, whatever the visitor's own time zone
// the month of the Umm al-Qura calendar, as the browser knows it (null where that calendar is unsupported)
export function hijriMonth(date) {
  try {
    const m = +new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', timeZone: 'Asia/Riyadh' }).format(date);
    return m >= 1 && m <= 12 ? m : null;
  } catch (e) { return null; }
}
function riyadhNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: new Date(Date.UTC(+v.year, +v.month - 1, +v.day, 12)), hours: (+v.hour % 24) + +v.minute / 60 };
}

// ---------------------------------------------------------------- phrases (Arabic, a transliteration, the meaning)
const PHRASES = [
  ['السلام عليكم', 'as-salāmu ʿalaykum', 'Peace be upon you (hello)'],
  ['شكراً', 'shukran', 'Thank you'],
  ['لو سمحت', 'law samaḥt', 'Excuse me / please'],
  ['كم السعر؟', 'kam as-siʿr?', 'How much is it?'],
  ['وين…؟', 'wēn…?', 'Where is…? (Saudi dialect)'],
  ['يعطيك العافية', 'yaʿṭīk al-ʿāfiya', 'Thanks for your effort (a warm thank-you)'],
  ['مع السلامة', 'maʿa as-salāma', 'Goodbye'],
  ['إن شاء الله', 'in shāʾ allāh', 'God willing (hopefully)']
];

const CSS = `
#tourist-panel { position: fixed; z-index: 31; left: 0; right: 0; margin: 0 auto; bottom: calc(env(safe-area-inset-bottom, 0px) + 12px); width: min(420px, calc(100vw - 24px)); box-sizing: border-box; max-height: 86vh; max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); overflow: auto; overscroll-behavior: contain; background: rgba(22,18,14,0.95); color: #f6efe3; border: 1px solid rgba(243,215,154,0.3); border-radius: 18px; padding: 14px; box-shadow: 0 14px 44px rgba(0,0,0,0.5); backdrop-filter: blur(10px); display: grid; gap: 12px; font-size: 13.5px; }
#tourist-panel .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
#tourist-panel h3 { margin: 0; font-size: 18px; }
#tourist-panel .clock { color: #f1d39b; font-variant-numeric: tabular-nums; font-size: 13px; text-align: left; }
#tourist-panel .x { width: 32px; height: 32px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.08); color: #f6efe3; font-size: 18px; cursor: pointer; }
#tourist-panel .qa { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
#tourist-panel .qa button { background: rgba(255,255,255,0.07); border: 0; color: #f6efe3; border-radius: 12px; padding: 10px 4px 8px; font: inherit; font-size: 12px; line-height: 1.3; cursor: pointer; display: grid; gap: 3px; justify-items: center; }
#tourist-panel .qa button:hover, #tourist-panel .qa button:focus-visible { background: rgba(243,215,154,0.16); outline: none; }
#tourist-panel .qa b { font-size: 19px; line-height: 1; }
#tourist-panel .prayers { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; text-align: center; font-size: 11.5px; }
#tourist-panel .prayers div { background: rgba(255,255,255,0.05); border-radius: 8px; padding: 5px 2px; font-variant-numeric: tabular-nums; }
#tourist-panel .prayers .next { background: #f1d39b; color: #2a1d10; font-weight: 700; }
#tourist-panel .trip { background: #0d5ea8; border-radius: 12px; padding: 9px 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px; cursor: pointer; border: 0; color: #fff; font: inherit; text-align: right; }
#tourist-panel .stamps { display: flex; flex-wrap: wrap; gap: 5px; }
#tourist-panel .stamps i { width: 26px; height: 26px; border-radius: 50%; border: 1.5px dashed rgba(255,255,255,0.3); display: grid; place-items: center; font-style: normal; font-size: 11px; color: rgba(255,255,255,0.5); }
#tourist-panel .stamps i.got { border-style: solid; border-color: #f1d39b; color: #2a1d10; background: #f1d39b; }
#tourist-panel .phrase { background: rgba(255,255,255,0.06); border-radius: 12px; padding: 9px 12px; display: grid; gap: 2px; }
#tourist-panel .phrase .ar { font-size: 17px; font-weight: 700; }
#tourist-panel .phrase .tr { direction: ltr; text-align: right; opacity: .8; font-size: 12.5px; }
#tourist-panel .phrase button { justify-self: start; margin-top: 4px; height: 30px; padding: 0 12px; border-radius: 8px; border: 0; background: rgba(255,255,255,0.12); color: #f6efe3; font: inherit; font-size: 12.5px; cursor: pointer; }
#tourist-panel .list { display: grid; gap: 4px; }
#tourist-panel .list button { display: flex; justify-content: space-between; gap: 10px; background: rgba(255,255,255,0.05); color: #f6efe3; border: 0; border-radius: 9px; padding: 9px 10px; font: inherit; cursor: pointer; text-align: right; }
#tourist-panel .list span { opacity: .7; font-size: 12px; white-space: nowrap; }
#tourist-panel .muted { opacity: .65; font-size: 12px; }
#tourist-panel .sec { font-size: 12px; opacity: .7; margin-bottom: -6px; }
`;

export class TouristPanel {
  constructor({ osm, player, guide, tour, openTour }) {
    Object.assign(this, { osm, player, guide, tour, openTour });
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = document.createElement('div'); this.el.id = 'tourist-panel'; this.el.hidden = true; this.el.dir = 'rtl';
    this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-label', 'لوحة السائح');
    document.body.appendChild(this.el);
    try { this.visited = new Set(JSON.parse(localStorage.getItem('riyadh-passport') || '[]')); } catch (e) { this.visited = new Set(); }
    // places from the map: mosque prayer halls, and parks of a useful size
    const s = osm.s, M = s.mosques;
    this.mosques = []; for (let m = 0; m < M.length / 7; m++) this.mosques.push({ x: M[m * 7 + 4], z: M[m * 7 + 5] });
    this.parks = [];
    for (let l = 0; l < s.land.length / 3; l++) {
      if (s.land[l * 3] !== 1) continue;
      const st0 = s.land[l * 3 + 1], n = s.land[l * 3 + 2], P = s.landPts;
      let x = 0, z = 0, a = 0;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; x += P[(st0 + i) * 2]; z += P[(st0 + i) * 2 + 1]; a += P[(st0 + i) * 2] * P[(st0 + j) * 2 + 1] - P[(st0 + j) * 2] * P[(st0 + i) * 2 + 1]; }
      if (Math.abs(a) / 2 > 8000) this.parks.push({ x: x / n, z: z / n, area: Math.abs(a) / 2 });
    }
    this.view = 'home';
    // the clock and prayer line refresh every half minute, but never under a keyboard user's focus
    setInterval(() => { if (!this.el.hidden && this.view === 'home' && !this.el.contains(document.activeElement)) this.renderHome(); }, 30000);
  }
  // the guide reports each landmark the visitor reaches
  stamp(key) {
    if (!GUIDE.find((g) => g.key === key) || this.visited.has(key)) return;
    this.visited.add(key);
    try { localStorage.setItem('riyadh-passport', JSON.stringify([...this.visited])); } catch (e) { /* private mode */ }
    if (this.visited.size === GUIDE.length) this.guide.note('جواز الرياض مكتمل', `زرت كل معالم الدليل (${AR(GUIDE.length)} معلماً). مبروك!`);
    if (!this.el.hidden && this.view === 'home') this.renderHome();
  }
  toggle(open) {
    const show = open ?? this.el.hidden;
    if (show && this.el.hidden) this.opener = document.activeElement;
    this.el.hidden = !show;
    if (show) { this.view = 'home'; this.renderHome(); this.el.querySelector('[data-a="close"]')?.focus({ preventScroll: true }); }
    else if (this.opener && document.contains(this.opener)) { this.opener.focus({ preventScroll: true }); this.opener = null; }
  }
  near(list, n) { const p = this.player.pos; return list.map((q) => ({ ...q, d: Math.hypot(q.x - p.x, q.z - p.z) })).sort((a, b) => a.d - b.d).slice(0, n); }
  header(title) {
    const { hours } = riyadhNow();
    return `<div class="row"><h3>${title}</h3><span class="sp" style="flex:1"></span><span class="clock">الرياض ${hm(hours)}</span><button class="x" type="button" data-a="close" aria-label="إغلاق">✕</button></div>`;
  }
  wire() {
    this.el.querySelector('[data-a="close"]').onclick = () => this.toggle(false);
    this.el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => this.act(b.dataset.go)));
  }
  renderHome() {
    const { date, hours } = riyadhNow(), pt = prayerTimes(date);
    const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const next = order.find((k) => k !== 'sunrise' && pt[k] > hours) || 'fajr';
    const mins = Math.round(((pt[next] - hours + 24) % 24) * 60);
    const dest = this.guide.dest, p = this.player.pos;
    const ph = PHRASES[Math.floor(Date.now() / 86400000) % PHRASES.length];
    this.el.innerHTML = this.header('لوحة السائح') + `
      <div class="muted">${PRAYER_AR[next]} بعد ${mins >= 60 ? AR(Math.floor(mins / 60)) + ' س ' : ''}${AR(mins % 60)} د · Next prayer: ${PRAYER_EN[next]}</div>
      <div class="prayers">${order.map((k) => `<div class="${k === next ? 'next' : ''}">${PRAYER_AR[k]}<br>${hm(pt[k]).replace(/ [صم]$/, '')}</div>`).join('')}</div>
      <div class="qa">
        <button type="button" data-go="nearby"><b>⌖</b>قريب مني<small>Nearby</small></button>
        <button type="button" data-go="mosque"><b>☪</b>أقرب مسجد<small>Mosque</small></button>
        <button type="button" data-go="tour"><b>▶</b>جولة<small>Tour</small></button>
        <button type="button" data-go="surprise"><b>✦</b>فاجئني<small>Surprise</small></button>
      </div>
      ${dest ? `<button class="trip" type="button" data-go="trip"><span>إلى ${esc(dest.ar)}<br><small>${fmtDist(Math.hypot(dest.x - p.x, dest.z - p.z))} · خط مستقيم</small></span><span>✕ إلغاء</span></button>` : ''}
      <div class="sec">جواز الرياض · ${AR(this.visited.size)} من ${AR(GUIDE.length)}</div>
      <div class="stamps" title="اقترب من أي معلم ليُختم جوازك">${GUIDE.map((g, i) => `<i class="${this.visited.has(g.key) ? 'got' : ''}" title="${g.ar}">${AR(i + 1)}</i>`).join('')}</div>
      <div class="phrase"><span class="sec" style="margin:0">عبارة اليوم · Phrase of the day</span><span class="ar">${ph[0]}</span><span class="tr">${ph[1]} — ${ph[2]}</span><button type="button" data-go="say">🔊 استمع</button></div>
      <div class="muted">مواقيت تقريبية محسوبة على الجهاز بطريقة أم القرى${pt.ramadan ? '، والعشاء بعد المغرب بساعتين في رمضان' : ''}. للمواعيد الدقيقة راجع تقويم أم القرى الرسمي.</div>`;
    this.wire();
  }
  renderList(title, items) {
    this.el.innerHTML = this.header(title) + `<div class="list">${items.map((it, i) => `<button type="button" data-i="${i}"><b>${esc(it.name)}</b><span>${fmtDist(it.d)}</span></button>`).join('') || '<div class="muted">لا شيء قريب هنا.</div>'}</div>
      <button class="x" type="button" data-go="home" style="width:auto;padding:0 12px">‹ رجوع</button>`;
    this.wire();
    this.el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => items[+b.dataset.i].pick()));
  }
  // send the visitor somewhere through the guide's routing
  goTo(x, z, ar, en) {
    this.toggle(false);
    this.guide.go({ key: 'spot', ar, en, x, z, h: 18, desc: '' });
  }
  act(a) {
    const p = this.player.pos;
    if (a === 'home') { this.view = 'home'; this.renderHome(); return; }
    if (a === 'trip') { this.guide.clear(); this.renderHome(); return; }
    if (a === 'tour') { this.toggle(false); this.openTour(); return; }
    if (a === 'say') {
      const ph = PHRASES[Math.floor(Date.now() / 86400000) % PHRASES.length], s = window.speechSynthesis;
      if (s) { if (s.paused) s.resume(); s.cancel(); const u = new SpeechSynthesisUtterance(ph[0].replace('…', '')); u.lang = 'ar-SA'; u.rate = 0.85; const v = s.getVoices().find((x) => x.lang.startsWith('ar')); if (v) u.voice = v; s.speak(u); }
      return;
    }
    if (a === 'mosque') {
      const m = this.near(this.mosques, 1)[0];
      if (m) this.goTo(m.x, m.z, 'أقرب مسجد', 'Nearest mosque');
      return;
    }
    if (a === 'surprise') {
      // somewhere not already next to you and not yet stamped, if possible
      const pool = GUIDE.filter((g) => Math.hypot(g.x - p.x, g.z - p.z) > 1500);
      const fresh = pool.filter((g) => !this.visited.has(g.key));
      const list = fresh.length ? fresh : pool;
      const g = list[Math.floor(Math.random() * list.length)];
      this.toggle(false); this.guide.open(g);
      return;
    }
    if (a === 'nearby') {
      this.view = 'nearby';
      const items = [
        ...this.near(GUIDE, 14).filter((g) => g.d < 4000).map((g) => ({ name: g.ar, d: g.d, pick: () => { this.toggle(false); this.guide.open(g); } })),
        ...this.near(this.mosques, 3).map((m) => ({ name: 'مسجد', d: m.d, pick: () => this.goTo(m.x, m.z, 'مسجد', 'Mosque') })),
        ...this.near(this.parks, 3).filter((q) => q.d < 3000).map((q) => ({ name: q.area > 60000 ? 'حديقة كبيرة' : 'حديقة', d: q.d, pick: () => this.goTo(q.x, q.z, 'حديقة', 'Park') }))
      ].sort((a, b) => a.d - b.d);
      this.renderList('قريب مني', items);
    }
  }
}
