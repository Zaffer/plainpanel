# simpleform

Signals-first micro-library for research dashboard controls.
Real HTML, one store, no build step for consumers. ~800 lines of source, small
enough to read whole.

Three golden rules: **minimal · elegant · simple**.

## The whole idea in 30 seconds

```html
<label>learning rate <output data-text="views.lrLabel"></output><br>
  <input type="range" min="0.001" max="0.1" step="0.001"
         data-bind="params.learningRate" data-wheel></label>
<button data-text="views.trainLabel" data-on="click:actions.train"
        data-disabled="views.running"></button>

<script type="module">
  import { signal, computed, bind } from './dist/simpleform.js';

  const params  = { learningRate: signal(0.01) };
  const status  = signal('idle');
  const views   = {
    lrLabel:    computed(() => params.learningRate().toFixed(3)),
    running:    computed(() => status() === 'running'),
    trainLabel: computed(() => status() === 'running' ? 'pause' : 'train'),
  };
  const actions = { train: () => status(status() === 'running' ? 'paused' : 'running') };

  bind(document.body, { params, views, actions });
</script>
```

State lives in signals. The HTML declares which node projects which path.
`bind()` wires them: one effect per DOM property, one listener per control.
Nothing else reads or writes the DOM.

## The invariants

1. **All state lives in one store of signals; the DOM is a projection of it.**
   Nothing reads a DOM node except the binder.
2. **Attributes hold dot-paths into the store, never expressions.**
   Anything computed is a named `computed()` in the store. Unknown paths throw
   at bind time.
3. **Events feed the store at the edge; each event is one batched write.**
4. **Imperative surfaces (three.js, canvas) sit behind a narrow API** and
   receive data via effects. Never put a foreign object's internals in signals.

## Install

No build step. Either vendor `dist/simpleform.js`, or:

```html
<script type="module">
  import { signal, bind } from 'https://cdn.jsdelivr.net/gh/Zaffer/simpleform@main/dist/simpleform.js';
</script>
```

Optional theme (the polytopy look — dark, monospace, translucent panels):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Zaffer/simpleform@main/simpleform.css">
```

Skip the CSS entirely and everything still works as bare native controls.

## Signals

Signals are callables: read with `s()`, write with `s(next)`. They are frozen —
`s.value = x` throws instead of failing silently.

```js
const count  = signal(1);            // read: count()   write: count(2)
const double = computed(() => count() * 2);
const stop   = effect(() => {        // runs now + on any change of what it read
  render(double());
  return () => cleanup();            // optional; runs before re-run and on stop
});
batch(() => { a(1); b(2); });        // effects run once, after both writes
untracked(() => s());                // read without subscribing
trigger(s);                          // notify after mutating s() in place
effectScope(() => { ... });          // group effects; returned Stop kills all
```

Rules of thumb: replace values immutably (`list([...list(), x])`); the only
in-place mutation lives inside `series()`, which triggers for you. Writes of an
identical value (`===`) are no-ops — echo loops cannot happen.

## bind(root, scope)

Scans `root` for `data-*` attributes, wires them against `scope`, returns a
`Stop` that tears everything down.

| Attribute | On | Does |
|---|---|---|
| `data-text="path"` | any element | `textContent` ← value |
| `data-bind="path"` | input/select/textarea/details | two-way ⇄ **signal** (typed: number/boolean/string by the signal's current value; NaN never written). Checkbox → boolean; radio group → one signal, checked by value; `select[multiple]` → string[]; `type=file` → one-way DOM→signal (File[]); `<details>` → open ⇄ boolean; `<progress>`/`<meter>` → one-way value ← readable (computeds welcome) |
| `data-show="path"` | any element | native `hidden` ← `!value` |
| `data-disabled="path"` | button/input/… | `disabled` ← value — state disables controls, it never hides or moves them |
| `data-inert="path"` | any element | native `inert` ← value — whole-subtree disable (focus, clicks, a11y) |
| `data-on="click:path"` | any element | listener → function in scope (space-separate multiple `event:path` pairs) |
| `data-wheel` | range/number with `data-bind` | mouse wheel nudges by `step` |
| `data-each="path"` | `<template>` | one row per array item; rows see `$item` / `$index` plus outer scope. **Requires `data-key`.** Reconciled by key: content changes update rows **in place** (zero DOM mutation); a kept item at a new position moves its DOM nodes with it, so focus and canvas state travel with the item |
| `data-key="id"` | `<template>` with `data-each` | item identity: a field path into the item (`"id"`), `"$item"` for primitive values, or `"$index"` for explicitly positional rows. Duplicate or object keys throw |

Paths are dot-walked (`params.learningRate`), prototype chain included. A miss
throws with the full path. No expressions, ever.

**Paths read through signals.** A segment holding a signal or computed is read
(reactively) and the walk continues into its value: `data-text="snapshot.pose.x"`
works when `snapshot` is one signal holding the latest server state, and
`$item.size` stays live when a row's item is updated in place.

**Browser rule — sliders and fieldsets.** Chrome silently cancels an
in-progress native slider drag when the child list of the slider's `<fieldset>`
changes (pure-vanilla behavior, any framework triggers it). `data-each` only
mutates structure when the array length changes, but still: put `data-each`
templates in their own container, never beside the controls that drive them.

## panel(title, opts?)

Programmatic panels for quick experiments — generates the same native elements
you'd write by hand, in a `<details>` appended to `opts.parent ?? document.body`.

```js
const p = panel('Training');
p.slider('learning rate', params.lr, { min: 0.001, max: 0.1, step: 0.001, format: v => v.toFixed(3) });
p.number('epochs', params.epochs, { min: 10, max: 1000, step: 10 });
p.toggle('show lines', vis.lines);
p.select('pattern', params.pattern, ['spiral', 'xor', { value: 'rnd', label: 'random' }]);
p.button(views.trainLabel, actions.train, { disabled: views.running }); // label may be a computed
p.readout('loss', views.lossLabel);
p.text('run name', params.runName);
p.color('trace color', params.traceColor);
p.add(myCanvas);                       // escape hatch: any element
const f = p.folder('advanced');        // nested collapsible group
p.dispose();                           // stops every binding, removes the panel
```

Sliders get a live `<output>` readout and wheel support by default.

## Edge helpers

```js
const loss = series(600);   // rolling buffer; push(null) marks a gap
loss.push(0.42);
effect(() => draw(loss.read()));   // read() is reactive — redraws per push

const sock = connect(() => `ws://localhost:8780/api/ws?since=${lastSeq()}`, {
  onMessage: (snap) => applySnapshot(snap),   // already JSON.parsed, inside batch()
  reconnectMs: 1000,                          // infinite retry until sock.close()
});
sock.connected();   // computed<boolean>
sock.send({ cmd: 'arm' });
```

For native browser Observables (Chromium 135+), just feed the store:
`button.when('click').subscribe(() => status('armed'))`.

## Imperative escape hatch (three.js, canvas)

Keep foreign libraries in plain modules behind a narrow API; effects push data in:

```js
// stage.js — no signals in here
export function createStage(el) { ...; return { setPose, setTrail, dispose }; }

// app.js
const stage = createStage(container);
effect(() => stage.setPose(snapshot().pose));   // data in, never proxied
```

## Low-level primitives

`bindText` `bindShow` `bindDisabled` `bindValue` `bindWheel` `listen` — each
creates one effect or one listener and returns a `Stop`. The binder and the
panel builder are both built from these; custom widgets should be too.

## Development

```sh
npm install
npm run build      # esbuild bundle + type declarations → dist/
npm test           # build + node --test (zero test deps)
npm run serve      # static server → open /examples/demo/
```

`dist/` is committed so jsDelivr can serve straight from GitHub.

## Example

[`examples/demo/`](examples/demo/) is the kitchen sink, no build step: a
four-panel dashboard (top bar, scrollable left/right panels, bottom bar)
around a three.js object driven by the store through `stage.js`'s narrow API.
The left panel binds **every HTML form control** — all text flavors, number,
range, every date/time picker, color, checkbox, radio group, selects
(single/optgroup/multiple), datalist combobox, file, buttons, form machinery,
output/progress/meter — each feeding a live JSON store snapshot. It also
exercises the native extras (`<details name>` accordions with store-bound open
state, popover, `<dialog>` via `commandfor`, `inert`, `hidden=until-found`)
and a bottom bar of Chromium-only features with live support badges
(customizable `<select>`, anchored popovers, `interesttarget`, `<permission>`,
`showPicker()`). Degrades gracefully when WebGL is unavailable.

## License

MIT
