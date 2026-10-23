// boot.js — starts the app, and turns any failure before or during start-up into a message with a retry button
// (an engine module that cannot be fetched, a browser without WebGL2, or a load that never answers).
function fail(msg) {
  const o = document.getElementById('loading-overlay');
  if (!o) return;
  o.classList.add('error');
  const st = document.getElementById('loading-status');
  if (st) st.textContent = msg;
  if (!o.querySelector('.boot-retry')) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'boot-retry'; b.textContent = 'إعادة المحاولة · Retry';
    b.addEventListener('click', () => location.reload());
    (o.querySelector('.loader') || o).appendChild(b);
  }
}
window.__bootFail = fail;
const NO_GL = 'هذا المتصفح لا يدعم WebGL2، وهو مطلوب لعرض المشهد ثلاثي الأبعاد. جرّب نسخة حديثة من Chrome أو Safari أو Firefox.';
let gl = false;
try { gl = !!document.createElement('canvas').getContext('webgl2'); } catch (e) { gl = false; }
if (!gl) fail(NO_GL);
else {
  import('./main.js').catch((e) => {
    console.error(e);
    fail(/webgl/i.test(String(e && e.message)) ? NO_GL : 'تعذّر تحميل ملفات المحرك. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.');
  });
  // a request that never answers raises no error at all
  setTimeout(() => {
    const o = document.getElementById('loading-overlay');
    if (o && !o.classList.contains('done') && !o.classList.contains('error')) fail('التحميل يستغرق وقتاً أطول من المعتاد. تحقق من الاتصال، أو انتظر قليلاً ثم أعد المحاولة.');
  }, 120000);
}
