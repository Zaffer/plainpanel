// Plain JS, no build step: this file plus the HTML is the whole app.
// Layout: top bar (experiment), left panel (every HTML control, bound),
// right panel (the same store via the panel builder), bottom bar
// (Chromium-only platform features), three.js scene behind everything.
import { signal, computed, effect, batch, bind, panel, series } from '../../dist/simpleform.js';
import { createStage } from './stage.js';

// ---------- store: the only place state lives ----------
const params = {
  shape: signal('knot'),
  scale: signal(1),
  spinX: signal(0.4),
  spinY: signal(0.9),
  wireframe: signal(false),
  color: signal('#8fc7ff'),
};
const status = signal('idle'); // idle | running | paused | done
const step = signal(0);
const metric = signal(1);
const metricSeries = series(220);
const stats = signal({ fps: 0, rotationX: 0, rotationY: 0, triangles: 0 });
const TOTAL_STEPS = 500;

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

const views = {
  scaleLabel: computed(() => params.scale().toFixed(2)),
  spinXLabel: computed(() => params.spinX().toFixed(1)),
  spinYLabel: computed(() => params.spinY().toFixed(1)),
  running: computed(() => status() === 'running'),
  done: computed(() => status() === 'done'),
  runLabel: computed(
    () => ({ idle: '▶ run', running: '⏸ pause', paused: '▶ resume', done: '▶ run' })[status()],
  ),
  metricLabel: computed(() => `${metric().toFixed(4)} @ ${step()}/${TOTAL_STEPS}`),
  progress: computed(() => step() / TOTAL_STEPS),
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
  { label: 'interesttarget', ok: 'interestTargetElement' in HTMLButtonElement.prototype },
  { label: '<permission> element', ok: typeof window.HTMLPermissionElement !== 'undefined' },
  { label: 'showPicker()', ok: 'showPicker' in HTMLInputElement.prototype },
  { label: 'hidden=until-found', ok: 'onbeforematch' in document.body },
  { label: 'inert', ok: 'inert' in HTMLElement.prototype },
];

// ---------- fake experiment loop (stands in for the real one) ----------
let timer;
function tick() {
  batch(() => {
    step(step() + 1);
    const m = Math.max(0.001, metric() * (0.97 + Math.random() * 0.04));
    metric(m);
    metricSeries.push(m);
    if (step() >= TOTAL_STEPS) status('done');
  });
  if (status() === 'running') timer = setTimeout(tick, 20);
}

const actions = {
  run() {
    if (status() === 'running') {
      clearTimeout(timer);
      status('paused');
      return;
    }
    if (status() === 'done') actions.reset();
    status('running');
    tick();
  },
  reset() {
    clearTimeout(timer);
    batch(() => {
      status('idle');
      step(0);
      metric(1);
    });
    metricSeries.clear();
  },
  ping() {
    g.pinged(new Date().toLocaleTimeString());
  },
  formSubmit(e) {
    e.preventDefault(); // never actually post — the store is the truth
    g.pinged('form submit ' + new Date().toLocaleTimeString());
  },
  openDatePicker() {
    try {
      document.getElementById('galleryDate').showPicker();
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
bind(document.body, { params, views, actions, status, metric, g, ui });

// ---------- entry point 2: the same store through the panel builder ----------
const p = panel('controls (panel builder)', { parent: document.getElementById('right') });

const object = p.folder('object');
object.select('shape', params.shape, [{ value: 'knot', label: 'torus knot' }, 'box', 'sphere']);
object.slider('scale', params.scale, { min: 0.2, max: 3, step: 0.01, format: (v) => v.toFixed(2) });
object.slider('spin x', params.spinX, { min: -3, max: 3, step: 0.1, format: (v) => v.toFixed(1) });
object.slider('spin y', params.spinY, { min: -3, max: 3, step: 0.1, format: (v) => v.toFixed(1) });
object.toggle('wireframe', params.wireframe);
object.color('color', params.color);

const mirror = p.folder('gallery mirror (two-way proof)');
mirror.text('text', g.text);
mirror.number('number', g.number, { min: 0, max: 100, step: 1 });
mirror.slider('range', g.range, { min: 0, max: 1, step: 0.01 });
mirror.toggle('checkbox', g.checkbox);
mirror.select('radio group', g.radio, ['alpha', 'beta', 'gamma']);
mirror.select('select', g.select, ['one', 'two', 'three']);
mirror.readout('last ping', g.pinged);

const experiment = p.folder('experiment');
experiment.button(views.runLabel, actions.run);
experiment.button('reset', actions.reset, { disabled: views.running });
experiment.readout('status', status);
experiment.readout('metric', views.metricLabel);

// ---------- canvas sparkline: one effect, same pattern as the 3D stage ----------
const canvas = document.getElementById('metricChart');
const ctx = canvas.getContext('2d');
effect(() => {
  const data = metricSeries.read();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (data.length < 2) return;
  const finite = data.filter((v) => v !== null);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  ctx.strokeStyle = '#8fc7ff';
  ctx.beginPath();
  let pen = false;
  data.forEach((v, i) => {
    if (v === null) {
      pen = false; // gap: a dead source draws a hole, not a frozen line
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
