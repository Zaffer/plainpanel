// Plain JS, no build step: this file plus the HTML is the whole app.
import { signal, computed, effect, batch, bind, panel, series } from '../../dist/simpleform.js';

// ---------- store: the only place state lives ----------
const params = {
  depth: signal(2),
  hiddenSize: signal(8),
  epochs: signal(200),
  learningRate: signal(0.01),
  pattern: signal('spiral'),
};
const vis = {
  trainingData: signal(true),
  network: signal(true),
  predictions: signal(true),
  lines: signal(false),
  analytic: signal(false),
  sampled: signal(true),
};
const status = signal('idle'); // idle | running | paused | done
const epoch = signal(0);
const loss = signal(1);
const lossSeries = series(240);

const views = {
  running: computed(() => status() === 'running'),
  trainLabel: computed(
    () => ({ idle: '▶ train', running: '⏸ pause', paused: '▶ resume', done: '▶ train' })[status()],
  ),
  lrLabel: computed(() => params.learningRate().toFixed(3)),
  lossLabel: computed(() => `${loss().toFixed(4)} @ epoch ${epoch()}/${params.epochs()}`),
  isDraw: computed(() => params.pattern() === 'draw'),
  layers: computed(() => {
    const sizes = [2, ...Array.from({ length: params.depth() }, () => params.hiddenSize()), 1];
    return sizes.map((size, index) => ({ index, size }));
  }),
};

// ---------- fake training loop (stands in for the real experiment) ----------
let timer;
function step() {
  batch(() => {
    epoch(epoch() + 1);
    const l = Math.max(0.001, loss() * (0.97 + Math.random() * 0.04));
    loss(l);
    lossSeries.push(l);
    if (epoch() >= params.epochs()) status('done');
  });
  if (status() === 'running') timer = setTimeout(step, 30);
}

const actions = {
  train() {
    if (status() === 'running') {
      clearTimeout(timer);
      status('paused');
      return;
    }
    if (status() === 'done') actions.reset();
    status('running');
    step();
  },
  reset() {
    clearTimeout(timer);
    batch(() => {
      status('idle');
      epoch(0);
      loss(1);
    });
    lossSeries.clear();
  },
};

// ---------- entry point 1: bind the hand-written HTML ----------
bind(document.body, { params, vis, views, actions, status });

// ---------- entry point 2: the same store through the panel builder ----------
const p = panel('controls (panel builder)');
p.el.style.left = 'auto';
p.el.style.right = '10px';

const net = p.folder('network');
net.slider('depth', params.depth, { min: 1, max: 5, step: 1 });
net.slider('hidden size', params.hiddenSize, { min: 2, max: 20, step: 1 });

const training = p.folder('training');
training.slider('epochs', params.epochs, { min: 10, max: 1000, step: 10 });
training.slider('learning rate', params.learningRate, { min: 0.001, max: 0.1, step: 0.001, format: (v) => v.toFixed(3) });
training.select('pattern', params.pattern, ['spiral', 'xor', 'circle', 'checker', 'random', 'draw']);
training.button(views.trainLabel, actions.train);
training.button('reset', actions.reset, { disabled: views.running });
training.readout('status', status);
training.readout('loss', views.lossLabel);

const visibility = p.folder('visibility');
visibility.toggle('training data', vis.trainingData);
visibility.toggle('neural network', vis.network);
visibility.toggle('predictions', vis.predictions);
visibility.toggle('lines', vis.lines);
visibility.toggle('analytic', vis.analytic);
visibility.toggle('sampled', vis.sampled);

// ---------- imperative escape hatch: canvas sparkline, one effect ----------
const canvas = document.getElementById('lossChart');
const ctx = canvas.getContext('2d');
effect(() => {
  const data = lossSeries.read();
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
      pen = false; // gap: dead source draws a hole, not a frozen line
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
