# simpleform — agent notes

Read README.md first: it is the full API and fits in context. The entire
source is ~600 lines across six files in src/ — when in doubt, read it all.

## Non-negotiable invariants

1. All state lives in one store of signals; the DOM is a projection of it.
   Nothing reads or writes a DOM node except the binder / panel primitives.
2. Attributes hold dot-paths into the store, never expressions. Anything
   computed is a named `computed()` in the store.
3. Events feed the store at the edge; each event is one batched write.
4. Imperative surfaces (three.js, canvas) live in plain modules behind a
   narrow API (`setPose`-style); effects push data in. Never store a foreign
   object's internals in signals, never proxy foreign objects.

## Style

- Signals are callables: `s()` reads, `s(v)` writes. Never `.value` (throws).
- Minimal CSS; prefer native elements/attributes (`details`, `fieldset`,
  `output`, `hidden`, `disabled`) over styled divs.
- Errors are loud and prefixed `simpleform:` — never fail silently.
- The library never imposes app-level UX policy (selectability, focus,
  scrolling). Native defaults stay; anything beyond the control element
  itself is the app's decision. (James's rule — do not widen user-select
  back to panels.)
- Keep the library small. A feature that can live in an example instead of
  src/ lives in an example.

## Hard-won rules

- Chrome silently cancels an in-progress native slider drag when the child
  list of the slider's <fieldset> changes (vanilla-reproducible; no event, no
  error). data-each only structurally mutates on length change, but still:
  keep data-each templates in their own container, never in the same fieldset
  as controls that drive them.
- Synthetic events (dispatchEvent) do NOT exercise native drag gestures.
  Verify sliders with real input (CDP Input domain / chrome-devtools drag),
  not just synthetic input events.
- Inside a data-each reconcile effect, row creation and $item/$index writes
  are wrapped in untracked(): row effects must be top-level (nested ones would
  be purged on every re-run) and item writes must not subscribe the effect.
- data-key is compulsory on data-each (Angular @for made track mandatory for
  the same reason): a forgotten key is a silent wrong-row-state bug, a missing
  attribute is a loud bind-time error. "$index" is the explicit positional
  escape hatch; object-valued keys throw because fresh-object identity would
  silently degrade to rebuild-everything.
- Accepted quirk, do NOT "fix" (James, 2026-08-21): if a text selection spans
  a slider, dragging the slider becomes a drag of the selection (no-drop
  cursor, thumb freezes) until the selection is cleared. A dragstart-cancel
  in bindValue fixed it and was removed on purpose — user-error UX quirks are
  not worth JS in the library. The slider's user-select: none went too:
  selection behavior belongs entirely to the app. The library never touches
  selection.

## Versioning

- Patch bumps by default (0.4.0 → 0.4.1), including for new features. Bump
  the minor (0.5.0) only for breaking API changes, and only when James asks
  or confirms. Tag releases (vX.Y.Z) so jsDelivr can pin them.

## Commands

- `npm test` — build + node --test (must stay green; zero test deps)
- `npm run serve` then open http://localhost:8137/examples/demo/
- Verifying the demo in a headless/WSL browser: WebGL may be unavailable —
  the stage stubs itself out and the dashboard still runs; test 3D visually
  in a real browser.
- dist/ is committed (jsDelivr serves it from GitHub); rebuild before commit
  when src/ changed.
