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

## Commands

- `npm test` — build + node --test (must stay green; zero test deps)
- `npm run serve` then open http://localhost:8137/examples/polytopy/
- dist/ is committed (jsDelivr serves it from GitHub); rebuild before commit
  when src/ changed.
