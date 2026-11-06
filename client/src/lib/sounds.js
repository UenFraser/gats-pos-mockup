// Sounds live in client/public/sounds/: newOrder, iceOrder, swap, voidsfx, bill, follow-upFood (.mp3).
// Web Audio: each file is decoded once, then played on demand. This is more reliable on phones than <audio>
// elements. Browsers keep sound blocked until the page is tapped once; the first tap unlocks it.
const NAMES = ['newOrder', 'iceOrder', 'swap', 'voidsfx', 'bill', 'follow-upFood'];
const buffers = {};
const loading = {};
const listeners = new Set();
let ctx = null;

function getCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  ctx.addEventListener('statechange', () => listeners.forEach((fn) => fn()));
  return ctx;
}

function load(name) {
  if (buffers[name]) return Promise.resolve(buffers[name]);
  if (!loading[name]) {
    loading[name] = fetch(`/sounds/${name}.mp3`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((data) => new Promise((resolve, reject) => getCtx().decodeAudioData(data, resolve, reject)))
      .then((buf) => { buffers[name] = buf; return buf; })
      .catch((e) => { delete loading[name]; console.warn(`sound ${name} not loaded:`, e.message); return null; });
  }
  return loading[name];
}

export const soundsRunning = () => !!ctx && ctx.state === 'running';
export function onSoundsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function unlock() {
  const c = getCtx();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  NAMES.forEach(load);
}
if (typeof window !== 'undefined') {
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
  NAMES.forEach(load); // decode ahead of time so the first sound is instant
}

export function play(name) {
  const c = getCtx();
  if (!c) return;
  if (c.state !== 'running') { c.resume().catch(() => {}); return; } // still locked: skip rather than play late
  load(name).then((buf) => {
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  });
}
