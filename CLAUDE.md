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

## Commands

- `npm test` — build + node --test (must stay green; zero test deps)
- `npm run serve` then open http://localhost:8137/examples/polytopy/
- dist/ is committed (jsDelivr serves it from GitHub); rebuild before commit
  when src/ changed.
