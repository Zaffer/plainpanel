/**
 * Reactive core: alien-signals, re-exported with one hardening rule.
 *
 * Signals are callables: read with `s()`, write with `s(next)`.
 * Every signal and computed is frozen at creation so the classic mistake
 * `s.value = x` throws a TypeError (modules are strict mode) instead of
 * silently assigning a dead property to a function object.
 */
import {
  signal as alienSignal,
  computed as alienComputed,
  effect as alienEffect,
  effectScope as alienEffectScope,
  isSignal,
  isComputed,
  trigger,
  startBatch,
  endBatch,
  setActiveSub,
} from 'alien-signals';

/** Read with `s()`, write with `s(next)`. Writes of an identical value (===) are no-ops. */
export type Signal<T> = {
  (): T;
  (next: T): void;
};

/** Read-only derived value; lazily cached, recomputed only when a dependency changed. */
export type Computed<T> = () => T;

/** Anything an effect or binding can read reactively. */
export type Readable<T> = Signal<T> | Computed<T>;

/** Returned by effect/effectScope/bind/panel — call once to tear down. */
export type Stop = () => void;

export function signal<T>(initial: T): Signal<T> {
  return Object.freeze(alienSignal(initial)) as Signal<T>;
}

export function computed<T>(getter: (previous?: T) => T): Computed<T> {
  return Object.freeze(alienComputed(getter)) as Computed<T>;
}

/**
 * Runs `fn` now and again whenever any signal it read changes.
 * `fn` may return a cleanup function; it runs before each re-run and on stop.
 * Effects created inside another effect are cleaned up when the outer re-runs.
 * Non-function returns are discarded, so `effect(() => arr.push(x))` — an
 * arrow's implicit return — can't be mistaken for a cleanup and crash later.
 */
export function effect(fn: () => unknown): Stop {
  return alienEffect(() => {
    const cleanup = fn();
    return typeof cleanup === 'function' ? (cleanup as () => void) : undefined;
  });
}

/** Groups every effect created inside `fn`; the returned Stop disposes them all. */
export function effectScope(fn: () => void): Stop {
  return alienEffectScope(fn);
}

/** Apply several writes as one atomic update: effects run once, after all writes. */
export function batch(fn: () => void): void {
  startBatch();
  try {
    fn();
  } finally {
    endBatch();
  }
}

/** Read signals inside `fn` without the enclosing effect subscribing to them. */
export function untracked<T>(fn: () => T): T {
  const previous = setActiveSub(undefined);
  try {
    return fn();
  } finally {
    setActiveSub(previous);
  }
}

export { trigger, isSignal, isComputed };
