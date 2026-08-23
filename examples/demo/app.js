// @ts-check
// Plain JS, no build step: this file plus the HTML is the whole app.
//
// One example, three ownership domains:
//   server-owned  — the experiment (snap signal, written only by the socket;
//                   commands go out as POSTs, the next snapshot updates the UI)
//   client-owned  — the three.js object params and the control gallery
//   imperative    — the three.js scene and the canvas chart, behind narrow APIs
//
// Types come from the server's pydantic models: npm run types (regenerates
// api.d.ts from the running server's OpenAPI).
/** @typedef {import('./api').components['schemas']['Snapshot']} Snapshot */
import { signal, computed, effect, bind, panel, connect, series } from '../../dist/plainpanel.js';
import { createStage } from './stage.js';

// ---------- SERVER state: one signal, written only by the socket ----------
const snap = signal(/** @type {Snapshot} */ ({
  seq: 0, ready: false, armed: false, running: false,
  battery: 0, metric: 0, pose: { x: 0, y: 0, z: 0 },
}));
const metricSeries = series(220);
const lastError = signal('');

// wss on https hosting (GitHub Pages), ws locally
const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const sock = connect(`${wsProto}://${location.host}/api/ws`, {
  onMessage: (m) => {
    const s = /** @type {Snapshot} */ (m);
    snap(s);
    metricSeries.push(s.running ? s.metric : null); // null = gap while idle
  },
});

// ---------- CLIENT state: the three.js object ----------
const params = {
  shape: signal('knot'),
  scale: signal(1),
  spinX: signal(0.4),
  spinY: signal(0.9),
  wireframe: signal(false),
  color: signal('#8fc7ff'),
};

// one signal per gallery control — the point is to watch them all in the JSON
const g = {
  text: signal('hello'),
  search: signal(''),
  tel: signal(''),
  url: signal('https://example.com'),
  email: signal(''),
  password: signal(''),
  notes: signal('multi\nline'),
  combo: signal(''),
  number: signal(42),
  range: signal(0.5),
  date: signal('2026-08-21'),
  time: signal('13:37'),
  datetimeLocal: signal('2026-08-21T13:37'),
  month: signal('2026-08'),
  week: signal('2026-W34'),
  checkbox: signal(true),
  radio: signal('beta'),
  select: signal('two'),
  grouped: signal('mid'),
  multi: signal(['a', 'c']),
  files: signal([]),
  formText: signal(''),
  hidden: signal('invisible-but-real'),
  inertDemo: signal(5),
  pinged: signal('never'),
};
const ui = { textOpen: signal(true) }; // a <details> open state, in the store
const stats = signal({ fps: 0, rotationX: 0, rotationY: 0, triangles: 0 });

// ---------- views: readouts + disable logic ----------
const views = {
  // three.js object
  scaleLabel: computed(() => params.scale().toFixed(2)),
  spinXLabel: computed(() => params.spinX().toFixed(1)),
  spinYLabel: computed(() => params.spinY().toFixed(1)),
  // experiment (all derived from the snapshot + link state)
  linkLabel: computed(() => (sock.connected() ? 'live' : 'reconnecting…')),
  offline: computed(() => !sock.connected()),
  statusLabel: computed(() => {
    if (!sock.connected()) return 'offline';
    if (snap().running) return 'running';
    return snap().armed ? 'armed' : 'idle';
  }),
  running: computed(() => snap().running),
  armLabel: computed(() => (snap().armed ? 'disarm' : 'arm')),
  armLocked: computed(() => !sock.connected() || snap().running || (!snap().armed && !snap().ready)),
  startLocked: computed(() => !sock.connected() || !snap().armed || snap().running),
  stopLocked: computed(() => !sock.connected() || !snap().running),
  battery: computed(() => snap().battery.toFixed(2) + ' V'),
  metricValue: computed(() => snap().metric),
  metricLabel: computed(() => snap().metric.toFixed(4) + ' @ ' + snap().seq),
  progress: computed(() => 1 - snap().metric),
  // gallery + stage
  stats: computed(() => {
    const s = stats();
    return [
      { label: 'fps', value: String(s.fps) },
      { label: 'rotation x', value: s.rotationX.toFixed(2) },
      { label: 'rotation y', value: s.rotationY.toFixed(2) },
      { label: 'triangles', value: String(s.triangles) },
    ];
  }),
  galleryJson: computed(() => {
    const snapshot = Object.fromEntries(
      Object.entries(g).map(([k, s]) => {
        const v = s();
        return [k, Array.isArray(v) && v[0] instanceof File ? v.map((f) => f.name) : v];
      }),
    );
    snapshot.textPanelOpen = ui.textOpen();
    return JSON.stringify(snapshot, null, 1);
  }),
  features: computed(() => FEATURES.map((f) => ({ label: f.label, value: f.ok ? '✓' : '✗' }))),
};

// feature detection for the bottom bar (static — computed for uniformity)
const FEATURES = [
  { label: 'popover API', ok: 'popover' in HTMLElement.prototype },
  { label: 'invoker commands (commandfor)', ok: 'command' in document.createElement('button') },
  { label: 'dialog closedby', ok: 'closedBy' in document.createElement('dialog') },
  { label: '<details name> accordion', ok: 'name' in document.createElement('details') },
  { label: 'CSS anchor positioning', ok: CSS.supports('position-area: center') },
  { label: 'customizable <select>', ok: CSS.supports('appearance', 'base-select') },
  { label: 'showPicker()', ok: 'showPicker' in HTMLInputElement.prototype },
  { label: 'hidden=until-found', ok: 'onbeforematch' in document.body },
  { label: 'inert', ok: 'inert' in HTMLElement.prototype },
];

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
  ping() {
    g.pinged(new Date().toLocaleTimeString());
  },
  formSubmit(e) {
    e.preventDefault(); // never actually post — the store is the truth
    g.pinged('form submit ' + new Date().toLocaleTimeString());
  },
  openDatePicker() {
    try {
      /** @type {HTMLInputElement} */ (document.getElementById('galleryDate')).showPicker();
    } catch (err) {
      g.pinged('showPicker refused: ' + err.name);
    }
  },
};

// ---------- three.js: imperative escape hatch, data flows in via effects ----------
const stage = createStage(document.getElementById('scene'));
effect(() => stage.setShape(params.shape()));
effect(() => stage.setScale(params.scale()));
effect(() => stage.setSpin(params.spinX(), params.spinY()));
effect(() => stage.setWireframe(params.wireframe()));
effect(() => stage.setColor(params.color()));
stage.onStats((s) => stats(s)); // ~5 Hz snapshots out of the render loop → one signal write

// ---------- entry point 1: bind the hand-written HTML ----------
bind(document.body, { params, views, actions, snap, lastError, g, ui });

// ---------- entry point 2: the same store through the panel builder ----------
const right = /** @type {Element} */ (document.getElementById('right'));
const p = panel('controls (panel builder)', { parent: right });

const object = p.folder('object');
object.select('shape', params.shape, [{ value: 'knot', label: 'torus knot' }, 'box', 'sphere']);
object.slider('scale', params.scale, { min: 0.2, max: 3, step: 0.01, format: (v) => v.toFixed(2) });
object.slider('spin x', params.spinX, { min: -3, max: 3, step: 0.1, format: (v) => v.toFixed(1) });
object.slider('spin y', params.spinY, { min: -3, max: 3, step: 0.1, format: (v) => v.toFixed(1) });
object.toggle('wireframe', params.wireframe);
object.color('color', params.color);

const mirror = p.folder('gallery mirror (two-way proof)', false);
mirror.text('text', g.text);
mirror.number('number', g.number, { min: 0, max: 100, step: 1 });
mirror.slider('range', g.range, { min: 0, max: 1, step: 0.01 });
mirror.toggle('checkbox', g.checkbox);
mirror.select('radio group', g.radio, ['alpha', 'beta', 'gamma']);
mirror.select('select', g.select, ['one', 'two', 'three']);
mirror.readout('last ping', g.pinged);

const experiment = p.folder('experiment (server-owned)');
experiment.button(views.armLabel, actions.arm, { disabled: views.armLocked });
experiment.button('stop', actions.stop, { disabled: views.stopLocked });
experiment.readout('status', views.statusLabel);
experiment.readout('metric', views.metricLabel);

// ---------- schema-driven form: the server defines it, the panel renders it ----------
try {
  const schema = await (await fetch('/api/params')).json();
  const form = /** @type {Record<string, ReturnType<typeof signal>>} */ ({});
  const sp = panel('run parameters — schema from the server', { parent: right });
  for (const param of schema) {
    const sig = (form[param.name] = signal(param.default));
    if (param.type === 'float') sp.slider(param.name, sig, { min: param.min, max: param.max, step: param.step });
    else if (param.type === 'choice') sp.select(param.name, sig, param.options);
    else if (param.type === 'bool') sp.toggle(param.name, sig);
    else sp.text(param.name, sig);
  }
  sp.button(
    'start run',
    () => post('start', Object.fromEntries(Object.entries(form).map(([k, s]) => [k, s()]))),
    { disabled: views.startLocked },
  );
} catch {
  lastError('no server — run parameters unavailable (npm run server)');
}

// ---------- canvas sparkline: one effect, same pattern as the 3D stage ----------
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('metricChart'));
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
    if (v === null) {
      pen = false; // gap: idle draws a hole, not a frozen line
      return;
    }
    const x = (i / Math.max(data.length - 1, 1)) * canvas.width;
    const y = canvas.height - 2 - ((v - min) / span) * (canvas.height - 4);
    if (pen) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    pen = true;
  });
  ctx.stroke();
});
