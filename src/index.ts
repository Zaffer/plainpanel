/**
 * plainpanel — signals-first micro-library for research dashboard controls.
 *
 * The invariants (the whole framework, in four sentences):
 *   1. All state lives in one store of signals; the DOM is a projection of it.
 *   2. Attributes hold dot-paths into the store, never expressions —
 *      anything computed is a named computed() in the store.
 *   3. Events feed the store at the edge; each event is one batched write.
 *   4. Imperative surfaces (three.js, canvas) sit behind a narrow API and
 *      receive data via effects; the library never proxies foreign objects.
 */
export {
  signal,
  computed,
  effect,
  effectScope,
  batch,
  untracked,
  trigger,
  isSignal,
  isComputed,
  type Signal,
  type Computed,
  type Readable,
  type Stop,
} from './signals.js';

export { bind, resolveValue, resolveTarget, type Scope } from './binder.js';

export {
  bindText,
  bindShow,
  bindClass,
  bindDisabled,
  bindInert,
  bindGauge,
  bindValue,
  bindWheel,
  listen,
} from './bindings.js';

export { panel, Panel, type PanelOptions, type ControlOptions, type SliderOptions, type SelectOption } from './panel.js';

export { series, connect, type Series, type Socket, type SocketOptions } from './edge.js';
