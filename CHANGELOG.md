# Changelog

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
