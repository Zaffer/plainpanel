# Changelog

## 0.5.4 — 2026-10-11

- Every `panel` control takes an optional `{ disabled: readable }`
  (`ControlOptions`, exported), like `button()` already did, so builder
  panels gate by state the same way `data-disabled` does.
- Demo: experiment commands show as pending ("arming…", "starting…") and
  lock their controls until a snapshot confirms them (DESIGN.md rule 6);
  new "signal vs observable" panel; `data-inert="snap.running"` shows a path
  reading through a signal; ping and showPicker() feedback sit next to their
  buttons; page radios get glyphs; scene background matches the panel
  colour; `THREE.Clock` → `THREE.Timer`.
- README: jsDelivr links pin a tag (there is no `main` branch); precise
  slider/fieldset rule; full low-level primitive list.
- DESIGN.md rule 11: appearance is allowed when it shows structure.
- CI runs on pushes to `master`.
- Demo: the builder's armed toggle and the run-parameter form lock by state.

## 0.5.3 — 2026-08-26

- New `data-class` attribute (and `bindClass` primitive): dynamic status
  classes from a path, added on top of the element's authored classes. The
  value is a space-separated string or string[]; authored classes are captured
  at bind time and always kept. Works inside `data-each` rows (`$item.cls`).

## 0.5.2 — 2026-08-24

- Demo: one CSS grid with resizable panels (pointer events → layout
  signals → CSS variables), dark/light theme, menu popover with a no-CSS
  toggle. `stage.setBackground` joins the narrow API.
- `plainpanel.css` colours read `--pp-*` custom properties, so apps can
  retheme the panels.

## 0.5.1 — 2026-08-22

- `connect()`: a synchronous WebSocket constructor throw (bad URL, mixed
  content) is reported once and stops, instead of killing the app.
- Demo uses `wss` on https hosting; README links the GitHub Pages demo.

## 0.5.0 — 2026-08-22

- **Breaking:** renamed simpleform → plainpanel (package, `dist/plainpanel.js`,
  `plainpanel.css`, `pp-` class prefix, `plainpanel:` error prefix).
- One example: `examples/demo/` runs against the FastAPI mock rig
  (`npm run server`); `api.d.ts` is generated from its OpenAPI.

## 0.4.3 — 2026-08-22

- Socket example: controls in front of a live API (server is the source of
  truth, schema-driven parameter panel).

## 0.4.1 / 0.4.2 — 2026-08-21

- Reverted the slider `dragstart` cancel and `user-select` rules: selection
  behaviour belongs to the app, not the library.

## 0.4.0 — 2026-08-21

- Full form-control coverage in `data-bind`: radio groups (one signal per
  group, checked by value), `select[multiple]` (string[] signal),
  `input[type=file]` (one-way DOM→signal, File[]), `<details>` (open ⇄
  boolean via toggle), `<progress>`/`<meter>` (one-way value ← readable,
  computeds welcome).
- New `data-inert` attribute — whole-subtree disable via the native inert
  attribute; `bindGauge`/`bindInert` primitives exported.
- Demo rebuilt as a four-panel kitchen sink: every HTML control bound with a
  live JSON store snapshot, native extras (accordion `<details name>`,
  popover, dialog + commandfor, hidden=until-found), and a Chromium-only
  bottom bar with feature-support badges.

## 0.3.0 — 2026-08-21

- **`data-key` is now compulsory on `data-each`** (Angular-`@for` reasoning: a
  forgotten key is a silent wrong-row-state bug; a missing attribute is a loud,
  self-teaching bind-time error). Forms: a field path (`data-key="id"`),
  `"$item"` for primitive items, `"$index"` for explicitly positional rows.
- Keyed reconciliation: a kept item at a new position moves its DOM nodes with
  it (focus/canvas state travels with the item). Duplicate keys throw;
  object-valued keys throw.
- `$index` is a live signal (positions change under reorder).
- `panel().color(label, sig)` — native color picker.

## 0.2.0 — 2026-08-21

- `data-each` reconciles in place instead of rebuilding all rows: content
  changes cause zero structural DOM mutation. Root cause: Chrome silently
  cancels an in-progress native slider drag when its containing `<fieldset>`'s
  child list changes.
- Paths read through signals mid-path and at the leaf
  (`data-text="snapshot.pose.x"` with `snapshot` as one signal works).
- `effect()` discards non-function returns, so `effect(() => arr.push(x))`
  can't crash as a bogus cleanup.

## 0.1.0 — 2026-08-21

Initial release: hardened alien-signals core (frozen callables), attribute
binder (`data-text/bind/show/disabled/on/each/wheel`, dot-paths only, loud
errors), `panel()` builder on native elements, `series()` ring buffer,
`connect()` reconnecting websocket, polytopy dark theme, zero-dep tests.
