// @ts-check
// Plain JS, no build step: this file plus the HTML is the whole app.
//
// One example, three ownership domains:
//   server-owned  — the experiment (snap signal, written only by the socket;
//                   commands go out as POSTs, the next snapshot updates the UI)
//   client-owned  — the three.js object params, the control gallery, the UI chrome
//   imperative    — the three.js scene and the canvas chart, behind narrow APIs
//
// Types come from the server's pydantic models: npm run types (regenerates
// api.d.ts from the running server's OpenAPI).
/** @typedef {import('./api').components['schemas']['Snapshot']} Snapshot */
/** @typedef {'arm' | 'disarm' | 'start' | 'stop'} Command */
import { signal, computed, effect, batch, untracked, bind, panel, connect, series } from '../../dist/plainpanel.js';
import { createStage } from './stage.js';

// ---------- SERVER state: one signal, written only by the socket ----------
const snap = signal(/** @type {Snapshot} */ ({
  seq: 0, ready: false, armed: false, running: false,
  battery: 0, metric: 1, pose: { x: 0, y: 0, z: 0 }, // metric 1 = the server's fresh value: empty progress bar
}));
const metricSeries = series(220);
const lastError = signal('');

// The command in flight ('' when none), and what a snapshot looks like once
// each command has landed. See command() below.
const pending = signal(/** @type {Command | ''} */ (''));
/** @type {Record<Command, (s: Snapshot) => boolean>} */
const landed = {
  arm: (s) => s.armed,
  disarm: (s) => !s.armed,
  start: (s) => s.running,
  stop: (s) => !s.running,
};
/** @type {Record<Command, string>} */
const pendingLabel = { arm: 'arming…', disarm: 'disarming…', start: 'starting…', stop: 'stopping…' };

// wss on https hosting (GitHub Pages), ws locally
const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const sock = connect(`${wsProto}://${location.host}/api/ws`, {
  onMessage: (m) => {
    const s = /** @type {Snapshot} */ (m);
    snap(s);
    metricSeries.push(s.running ? s.metric : null); // null = gap while idle
    const cmd = pending();
    if (cmd && landed[cmd](s)) pending(''); // the command is now visible in the state
  },
});
// a dropped socket can never confirm the command in flight: let it go
effect(() => {
  if (!sock.connected()) pending('');
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
  files: signal(/** @type {File[]} */ ([])),
  formText: signal(''),
  hidden: signal('invisible-but-real'),
  inertDemo: signal(5),
  pinged: signal('never'),
};
const ui = {
  textOpen: signal(true), // a <details> open state, in the store
  theme: signal('dark'),
  scene: signal(true), // three.js render loop on/off
  noCss: signal(false), // disables every author stylesheet — raw HTML remains
  page: signal('scene'), // main panel page: a radio group in its legend
  picker: signal(''), // why showPicker() was refused, if it was
};
// panel geometry — effects project these into CSS variables below
const layout = { leftW: signal(320), rightW: signal(280), bottomH: signal(200) };
const stats = signal({ fps: 0, rotationX: 0, rotationY: 0, triangles: 0 });

// busy: no socket, or a command still in flight — every experiment control locks
const busy = computed(() => !sock.connected() || pending() !== '');

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
    const cmd = pending();
    if (cmd) return pendingLabel[cmd];
    if (snap().running) return 'running';
    return snap().armed ? 'armed' : 'idle';
  }),
  running: computed(() => snap().running),
  armLocked: computed(() => busy() || snap().running || (!snap().armed && !snap().ready)),
  startLocked: computed(() => busy() || !snap().armed || snap().running),
  stopLocked: computed(() => busy() || !snap().running),
  battery: computed(() => snap().battery.toFixed(2) + ' V'),
  metricValue: computed(() => snap().metric),
  metricLabel: computed(() => snap().metric.toFixed(4) + ' @ ' + snap().seq),
  progress: computed(() => 1 - snap().metric),
  // main panel pages: data-show takes a path, not page === 'x', so one computed each
  pageScene: computed(() => ui.page() === 'scene'),
  pageStore: computed(() => ui.page() === 'store'),
  pageStats: computed(() => ui.page() === 'stats'),
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
        return [k, Array.isArray(v) ? v.map((x) => (x instanceof File ? x.name : x)) : v];
      }),
    );
    snapshot.textPanelOpen = ui.textOpen();
    snapshot.page = ui.page();
    return JSON.stringify(snapshot, null, 1);
  }),
  features: computed(() => FEATURES.map((f) => ({ label: f.label, value: f.ok ? '✓' : '✗' }))),
  noObservable: computed(() => !('when' in EventTarget.prototype)),
};

// feature detection for the bottom bar (static — computed for uniformity)
const FEATURES = [
  { label: 'Observable (EventTarget.when)', ok: 'when' in EventTarget.prototype },
  { label: '<input switch>', ok: 'switch' in HTMLInputElement.prototype },
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

// ---------- commands go TO the server; they never write snap ----------
// DESIGN.md rule 6: a command reads as pending ("arming…") from the click
// until a snapshot shows it landed, or the server refuses it. Every
// experiment control stays locked meanwhile, so nobody clicks twice
// wondering whether the first one took.
/**
 * @param {Command} name
 * @param {Record<string, unknown>} [body]
 * @returns {Promise<boolean>} whether the server accepted it
 */
async function command(name, body) {
  pending(name);
  try {
    const r = await fetch('/api/' + name, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const res = await r.json();
    batch(() => {
      lastError(res.ok ? '' : res.error);
      if (!res.ok) pending(''); // refused: nothing will land
    });
    return !!res.ok;
  } catch (err) {
    batch(() => {
      lastError(String(err));
      pending('');
    });
    return false;
  }
}
/** @typedef {'left' | 'right' | 'bottom'} Handle */
/** @type {{ which: Handle, x: number, y: number, from: number } | null} */
let drag = null; // transient gesture state, not app state — nothing renders from it
/** @type {(v: number, lo: number, hi: number) => number} */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const actions = {
  stop: () => command('stop'),
  ping() {
    g.pinged(new Date().toLocaleTimeString());
  },
  /** @param {SubmitEvent} e */
  formSubmit(e) {
    e.preventDefault(); // never actually post — the store is the truth
    g.pinged('form submit ' + new Date().toLocaleTimeString());
  },
  openDatePicker() {
    try {
      /** @type {HTMLInputElement} */ (document.getElementById('galleryDate')).showPicker();
      ui.picker(''); // the picker itself is the feedback
    } catch (err) {
      ui.picker('refused: ' + (err instanceof Error ? err.name : String(err)));
    }
  },
  // panel resizing: pointer capture keeps move/up on the handle itself,
  // so three listeners per handle cover the whole gesture. One write per move.
  /** @param {PointerEvent} e */
  rzDown(e) {
    const el = /** @type {HTMLElement} */ (e.currentTarget);
    el.setPointerCapture(e.pointerId);
    const which = /** @type {Handle} */ (el.dataset.rz);
    const sig = { left: layout.leftW, right: layout.rightW, bottom: layout.bottomH }[which];
    drag = { which, x: e.clientX, y: e.clientY, from: sig() };
    e.preventDefault();
  },
  /** @param {PointerEvent} e */
  rzMove(e) {
    if (!drag) return;
    if (drag.which === 'left') layout.leftW(clamp(drag.from + e.clientX - drag.x, 180, window.innerWidth * 0.45));
    else if (drag.which === 'right') layout.rightW(clamp(drag.from - (e.clientX - drag.x), 180, window.innerWidth * 0.45));
    else layout.bottomH(clamp(drag.from - (e.clientY - drag.y), 64, window.innerHeight * 0.6));
  },
  rzUp() {
    drag = null;
  },
};
// ---------- arm state: a checkbox switch, not a toggling button (DESIGN.md rule 2) ----------
// The checkbox writes arm.on; when it differs from the server, the effect
// sends the matching command. The server's answer arrives as a snapshot and
// re-syncs the checkbox; a refused command snaps it back at once.
const serverArmed = computed(() => snap().armed); // changes only on a real flip
const arm = { on: signal(false) };
effect(() => arm.on(serverArmed()));
effect(() => {
  const want = arm.on();
  if (want === untracked(serverArmed)) return;
  command(want ? 'arm' : 'disarm').then((ok) => {
    if (!ok) arm.on(untracked(serverArmed));
  });
});

// ---------- signal vs observable: the same clicks, two models ----------
// An observable is events over time: it has no current value, and every
// event is delivered. A signal is the value now: a write of the same value
// is a no-op, so its effects run only on a real change. The plainpanel rule
// (invariant 3): the stream stays at the edge and writes the store.
const sv = {
  events: signal(0), // events the observable delivered
  value: signal(0), // the signal: the latest roll
  runs: signal(0), // runs of the effect that reads sv.value
};
effect(() => {
  sv.value();
  untracked(() => sv.runs(sv.runs() + 1));
});
if (!views.noObservable()) {
  /** @type {any} */ (document.getElementById('rollButton'))
    .when('click')
    .map(() => 1 + Math.floor(Math.random() * 3))
    .subscribe((/** @type {number} */ roll) => batch(() => {
      sv.events(sv.events() + 1);
      sv.value(roll);
    }));
}

// ---------- three.js: imperative escape hatch, data flows in via effects ----------
const stage = createStage(/** @type {HTMLCanvasElement} */ (document.getElementById('scene')));
effect(() => stage.setShape(params.shape()));
effect(() => stage.setScale(params.scale()));
effect(() => stage.setSpin(params.spinX(), params.spinY()));
effect(() => stage.setWireframe(params.wireframe()));
effect(() => stage.setColor(params.color()));
effect(() => stage.setRunning(ui.scene()));
stage.onStats(stats); // a signal is a setter: ~5 Hz snapshots out of the render loop → one signal write

// ---------- layout & chrome: the same pattern — effects push store values out ----------
const rootStyle = document.documentElement.style;
effect(() => rootStyle.setProperty('--left-w', layout.leftW() + 'px'));
effect(() => rootStyle.setProperty('--right-w', layout.rightW() + 'px'));
effect(() => rootStyle.setProperty('--bottom-h', layout.bottomH() + 'px'));
effect(() => {
  document.documentElement.dataset.theme = ui.theme();
});
effect(() => stage.setBackground(ui.theme() === 'light' ? '#eeeeee' : '#111111')); // = --panel in demo.css
effect(() => {
  const off = ui.noCss(); // "no CSS": the same HTML, zero styling
  for (const el of document.querySelectorAll('link[rel=stylesheet], style')) {
    /** @type {HTMLLinkElement} */ (el).disabled = off;
  }
});

// ---------- entry point 1: bind the hand-written HTML ----------
bind(document.body, { params, views, actions, snap, lastError, g, ui, arm, sv });

// ---------- entry point 2: the same store through the panel builder ----------
const builder = /** @type {Element} */ (document.getElementById('builder'));
const p = panel('controls (panel builder)', { parent: builder });

const object = p.folder('object');
object.select('shape', params.shape, [{ value: 'knot', label: '🥨 torus knot' }, { value: 'box', label: '📦 box' }, { value: 'sphere', label: '🔵 sphere' }]);
object.slider('scale', params.scale, { min: 0.2, max: 3, step: 0.01, format: (v) => v.toFixed(2) });
object.slider('spin x', params.spinX, { min: -3, max: 3, step: 0.1, format: (v) => v.toFixed(1) });
object.slider('spin y', params.spinY, { min: -3, max: 3, step: 0.1, format: (v) => v.toFixed(1) });
object.toggle('🕸 wireframe', params.wireframe);
object.color('color', params.color);

const mirror = p.folder('gallery mirror (two-way proof)', false);
mirror.text('text', g.text);
mirror.number('number', g.number, { min: 0, max: 100, step: 1 });
mirror.slider('range', g.range, { min: 0, max: 1, step: 0.01 });
mirror.toggle('☑ checkbox', g.checkbox);
mirror.select('radio group', g.radio, [{ value: 'alpha', label: 'α alpha' }, { value: 'beta', label: 'β beta' }, { value: 'gamma', label: 'γ gamma' }]);
mirror.select('select', g.select, [{ value: 'one', label: '1️⃣ one' }, { value: 'two', label: '2️⃣ two' }, { value: 'three', label: '3️⃣ three' }]);
mirror.readout('last ping', g.pinged);

const experiment = p.folder('experiment (server-owned)');
experiment.toggle('⚡ armed', arm.on, { disabled: views.armLocked });
experiment.button('⏹ stop', actions.stop, { disabled: views.stopLocked });
experiment.readout('status', views.statusLabel);
experiment.readout('metric', views.metricLabel);

// ---------- canvas sparkline: one effect, same pattern as the 3D stage ----------
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('metricChart'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
effect(() => {
  const stroke = ui.theme() === 'light' ? '#1f6fd6' : '#8fc7ff'; // read first: redraw on theme flip
  const data = metricSeries.read();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (data.length < 2) return;
  const finite = /** @type {number[]} */ (data.filter((v) => v !== null));
  if (!finite.length) return;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  ctx.strokeStyle = stroke;
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

// ---------- schema-driven form: the server defines it, the panel renders it ----------
try {
  const schema = await (await fetch('/api/params')).json();
  const form = /** @type {Record<string, ReturnType<typeof signal>>} */ ({});
  const sp = panel('run parameters — schema from the server', { parent: /** @type {Element} */ (document.getElementById('schemaPanel')) });
  for (const param of schema) {
    const sig = (form[param.name] = signal(param.default));
    // the server reads these only at start: lock them while a run is going
    const locked = { disabled: views.running };
    if (param.type === 'float') sp.slider(param.name, sig, { min: param.min, max: param.max, step: param.step, ...locked });
    else if (param.type === 'choice') sp.select(param.name, sig, param.options, locked);
    else if (param.type === 'bool') sp.toggle(param.name, sig, locked);
    else sp.text(param.name, sig, locked);
  }
  sp.button(
    '▶ start run',
    () => command('start', Object.fromEntries(Object.entries(form).map(([k, s]) => [k, s()]))),
    { disabled: views.startLocked },
  );
} catch {
  lastError('no server — run parameters unavailable (npm run server)');
}
