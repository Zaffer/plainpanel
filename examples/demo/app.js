// Plain JS, no build step: this file plus the HTML is the whole app.
// One store drives three surfaces: the hand-written HTML panel (bind), the
// generated panel (panel builder), and the three.js scene (imperative
// escape hatch behind stage.js's narrow API).
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
const metricSeries = series(240);
const stats = signal({ fps: 0, rotationX: 0, rotationY: 0, triangles: 0 });
const TOTAL_STEPS = 500;

const views = {
  scaleLabel: computed(() => params.scale().toFixed(2)),
  spinXLabel: computed(() => params.spinX().toFixed(1)),
  spinYLabel: computed(() => params.spinY().toFixed(1)),
  running: computed(() => status() === 'running'),
  done: computed(() => status() === 'done'),
  runLabel: computed(
    () => ({ idle: '▶ run', running: '⏸ pause', paused: '▶ resume', done: '▶ run' })[status()],
  ),
  metricLabel: computed(() => `${metric().toFixed(4)} @ step ${step()}/${TOTAL_STEPS}`),
  stats: computed(() => {
    const s = stats();
    return [
      { label: 'fps', value: String(s.fps) },
      { label: 'rotation x', value: s.rotationX.toFixed(2) },
      { label: 'rotation y', value: s.rotationY.toFixed(2) },
      { label: 'triangles', value: String(s.triangles) },
    ];
  }),
};

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
bind(document.body, { params, views, actions, status });

// ---------- entry point 2: the same store through the panel builder ----------
const p = panel('controls (panel builder)');
p.el.style.left = 'auto';
p.el.style.right = '10px';

const object = p.folder('object');
object.select('shape', params.shape, [{ value: 'knot', label: 'torus knot' }, 'box', 'sphere']);
object.slider('scale', params.scale, { min: 0.2, max: 3, step: 0.01, format: (v) => v.toFixed(2) });
object.slider('spin x', params.spinX, { min: -3, max: 3, step: 0.1, format: (v) => v.toFixed(1) });
object.slider('spin y', params.spinY, { min: -3, max: 3, step: 0.1, format: (v) => v.toFixed(1) });
object.toggle('wireframe', params.wireframe);
object.color('color', params.color);

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
