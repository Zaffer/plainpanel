// @ts-check
// Plain JS, no build step. Types come from the server's pydantic models:
//   npm run types:socket   (regenerates api.d.ts from the running server)
/** @typedef {import('./api').components['schemas']['Snapshot']} Snapshot */
import { signal, computed, effect, bind, panel, connect, series } from '../../dist/simpleform.js';

// ---------- server state: one signal, written only by the socket ----------
const snap = signal(/** @type {Snapshot} */ ({
  seq: 0, ready: false, armed: false, running: false,
  battery: 0, metric: 0, pose: { x: 0, y: 0, z: 0 },
}));
const metricSeries = series(300);
const lastError = signal('');

const sock = connect(`ws://${location.host}/api/ws`, {
  onMessage: (m) => {
    const s = /** @type {Snapshot} */ (m);
    snap(s);
    metricSeries.push(s.running ? s.metric : null); // null = gap while idle
  },
});

// ---------- views: readouts + disable logic, all derived from the snapshot ----------
const views = {
  linkLabel: computed(() => (sock.connected() ? 'live' : 'reconnecting…')),
  battery: computed(() => snap().battery.toFixed(2) + ' V'),
  altitude: computed(() => snap().pose.z.toFixed(2) + ' m'),
  metric: computed(() => snap().metric.toFixed(4)),
  armLabel: computed(() => (snap().armed ? 'disarm' : 'arm')),
  armLocked: computed(() => !sock.connected() || snap().running || (!snap().armed && !snap().ready)),
  startLocked: computed(() => !sock.connected() || !snap().armed || snap().running),
  stopLocked: computed(() => !sock.connected() || !snap().running),
};

// ---------- actions: commands go TO the server; they never write snap ----------
async function post(path, body) {
  try {
    const r = await fetch('/api/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const res = await r.json();
    lastError(res.ok ? '' : res.error);
  } catch (err) {
    lastError(String(err));
  }
}
const actions = {
  arm: () => post(snap().armed ? 'disarm' : 'arm'),
  stop: () => post('stop'),
};

bind(document.body, { snap, views, actions, lastError });

// ---------- schema-driven form: the server defines it, the panel renders it ----------
const schema = await (await fetch('/api/params')).json();
const form = /** @type {Record<string, ReturnType<typeof signal>>} */ ({});
const p = panel('parameters — schema from the server', {
  parent: /** @type {Element} */ (document.getElementById('params')),
});
for (const param of schema) {
  const sig = (form[param.name] = signal(param.default));
  if (param.type === 'float') p.slider(param.name, sig, { min: param.min, max: param.max, step: param.step });
  else if (param.type === 'choice') p.select(param.name, sig, param.options);
  else if (param.type === 'bool') p.toggle(param.name, sig);
  else p.text(param.name, sig);
}
p.button(
  'start run',
  () => post('start', Object.fromEntries(Object.entries(form).map(([k, s]) => [k, s()]))),
  { disabled: views.startLocked },
);

// ---------- metric chart: imperative escape hatch, one effect ----------
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('chart'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
effect(() => {
  const data = metricSeries.read();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (data.length < 2) return;
  const finite = /** @type {number[]} */ (data.filter((v) => v !== null));
  if (!finite.length) return;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  ctx.strokeStyle = '#8fc7ff';
  ctx.beginPath();
  let pen = false;
  data.forEach((v, i) => {
    if (v === null) { pen = false; return; } // gap: idle draws a hole, not a line
    const x = (i / Math.max(data.length - 1, 1)) * canvas.width;
    const y = canvas.height - 2 - ((v - min) / span) * (canvas.height - 4);
    if (pen) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    pen = true;
  });
  ctx.stroke();
});
