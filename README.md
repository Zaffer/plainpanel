# plainpanel

A small signals library for dashboard control panels.
Plain HTML, one store, no build step. ~800 lines of source.

**Live demo - https://zaffer.github.io/plainpanel/examples/demo/**.
Run `npm run server` on your machine, and go http://localhost:8780/examples/demo/ for full version.

## The idea

```html
<label>volume slider
  <output data-text="views.label"></output><br>
  <input type="range" min="0" max="100" data-bind="state.volume">
</label>
<button data-on="click:actions.reset">reset</button>

<script type="module">
  import { signal, computed, bind } from './dist/plainpanel.js';

  const state   = { volume: signal(40) };
  const views   = { label: computed(() => state.volume() + ' %') };
  const actions = { reset: () => state.volume(40) };

  bind(document.body, { state, views, actions });
</script>
```

State lives in signals. The HTML says which path each node shows.
`bind()` connects them: one effect for each DOM property, one listener for
each control. Nothing else reads or writes the DOM.

## Install

No build step. Copy `dist/plainpanel.js` into your project, or:

```html
<script type="module">
  import { signal, bind } from 'https://cdn.jsdelivr.net/gh/Zaffer/plainpanel@main/dist/plainpanel.js';
</script>
```

Optional theme (dark, monospace, translucence):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Zaffer/plainpanel@main/plainpanel.css">
```

## Signals

A signal is a function. Read with `s()`. Write with `s(next)`. Signals are
frozen: `s.value = x` throws an error.

```js
const count  = signal(1);            // read: count()   write: count(2)
const double = computed(() => count() * 2);
const stop   = effect(() => {        // runs now, and again when a read value changes
  render(double());
  return () => cleanup();            // optional; runs before each re-run and on stop
});
batch(() => { a(1); b(2); });        // effects run once, after both writes
untracked(() => s());                // read without a subscription
trigger(s);                          // notify effects after an in-place change of s()
effectScope(() => { ... });          // group effects; the returned Stop stops all
```

Rules:

- Replace values, do not mutate them: `list([...list(), x])`. Only `series()`
  mutates in place, and it notifies for you.
- A write of an identical value (`===`) does nothing. Echo loops cannot happen.

## bind(root, scope)

`bind()` scans `root` for `data-*` attributes and connects them to `scope`.
It returns a `Stop` that removes all bindings.

| Attribute | On | Does |
|---|---|---|
| `data-text="path"` | any element | `textContent` ← value |
| `data-bind="path"` | input/select/textarea/details | two-way ⇄ **signal**. The signal's current value sets the type (number/boolean/string); NaN is never written. Checkbox → boolean; radio group → one signal, checked by value; `select[multiple]` → string[]; `type=file` → one-way DOM→signal (File[]); `<details>` → open ⇄ boolean; `<progress>`/`<meter>` → one-way value ← readable (computeds welcome) |
| `data-show="path"` | any element | native `hidden` ← `!value` |
| `data-class="path"` | any element | dynamic classes ← value (string or string[]), ADDED to the element's authored classes. Status classes (`ok`/`bad`) come and go; layout classes stay. The class attribute is owned by the binding |
| `data-disabled="path"` | button/input/… | `disabled` ← value. State disables controls; it never hides or moves them |
| `data-inert="path"` | any element | native `inert` ← value. Disables the full subtree (focus, clicks, a11y) |
| `data-on="click:path"` | any element | listener → function in scope. Separate multiple `event:path` pairs with spaces |
| `data-wheel` | range/number with `data-bind` | the mouse wheel changes the value by `step` |
| `data-each="path"` | `<template>` | one row for each array item. Rows see `$item` / `$index` and the outer scope. **`data-key` is required.** Rows reconcile by key: a content change updates the row **in place** (zero DOM mutation); a kept item at a new position moves its DOM nodes with it, so focus and canvas state travel with the item |
| `data-key="id"` | `<template>` with `data-each` | item identity: a field path into the item (`"id"`), `"$item"` for primitive values, or `"$index"` for positional rows. Duplicate or object keys throw |

Paths are dot-walked (`state.volume`); the prototype chain is included. A
missing path throws an error that shows the full path. No expressions, ever.

**Paths read through signals.** When a path segment holds a signal or a
computed, the binder reads it (reactively) and continues into its value.
`data-text="snapshot.pose.x"` works when `snapshot` is one signal that holds
the latest server state, and `$item.size` stays live when a row's item is
updated in place.

**Browser rule — sliders and fieldsets.** Chrome cancels a slider drag when
the child list of the slider's `<fieldset>` changes. This is native browser
behavior; every framework triggers it. `data-each` changes structure only
when the array length changes. Still: put `data-each` templates in their own
container, never next to the controls that drive them.

## panel(title, opts?)

Build panels from code, for quick experiments. The output is the same native
elements you write by hand, in a `<details>` appended to
`opts.parent ?? document.body`.

```js
const p = panel('settings');
p.slider('speed', state.speed, { min: 0, max: 5, step: 0.1, format: v => v.toFixed(1) });
p.number('count', state.count, { min: 0, max: 100, step: 1 });
p.toggle('show grid', state.grid);
p.select('mode', state.mode, ['auto', 'manual', { value: 'off', label: 'disabled' }]);
p.button(views.runLabel, actions.run, { disabled: views.running }); // label may be a computed
p.readout('status', views.statusLabel);
p.text('name', state.name);
p.color('trace color', state.color);
p.add(myCanvas);                       // escape hatch: any element
const f = p.folder('advanced');        // nested collapsible group
p.dispose();                           // stops all bindings, removes the panel
```

Sliders get a live `<output>` readout and wheel support by default.

## Edge helpers

```js
const metric = series(600);   // rolling buffer; push(null) marks a gap
metric.push(0.42);
effect(() => draw(metric.read()));   // read() is reactive — redraws on each push

const sock = connect(() => `ws://localhost:8780/api/ws?since=${lastSeq()}`, {
  onMessage: (snap) => applySnapshot(snap),   // already JSON.parsed, inside batch()
  reconnectMs: 1000,                          // retries forever, until sock.close()
});
sock.connected();   // computed<boolean>
sock.send({ cmd: 'arm' });
```

Native browser Observables fit the same way, just feed the store:
`button.when('click').subscribe(() => status('armed'))`.

## Imperative escape hatch (three.js, canvas)

Keep foreign libraries in plain modules, behind a narrow API. Effects push
data in:

```js
// stage.js — no signals in here
export function createStage(el) { ...; return { setPose, setTrail, dispose }; }

// app.js
const stage = createStage(container);
effect(() => stage.setPose(snapshot().pose));   // data in, never proxied
```

## Low-level primitives

`bindText` `bindShow` `bindDisabled` `bindValue` `bindWheel` `listen` — each
one creates one effect or one listener and returns a `Stop`. The binder and
the panel builder are built from these. Build custom widgets from them too.

## Development

```sh
npm install
npm run build      # esbuild bundle + type declarations → dist/
npm test           # build + node --test (zero test deps)
npm run server     # FastAPI mock rig + statics → open http://localhost:8780/examples/demo/
npm run types      # regenerate examples/demo/api.d.ts from the running server
npm run serve      # static-only server (no API) → open :8137/examples/demo/
```

`dist/` is committed, so jsDelivr can serve it directly from GitHub.

## Example

[`examples/demo/`](examples/demo/) is one dashboard with no build step. It
shows three ownership domains on one page: a server-owned experiment, a
client-owned control gallery, and imperative escape hatches.
