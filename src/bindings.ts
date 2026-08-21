/**
 * Low-level element ⇄ signal bindings. One binding is either:
 *   - one effect writing one DOM property (signal → DOM), or
 *   - one event listener writing one signal (DOM → signal).
 * Both the attribute binder and the panel builder are built from these.
 */
import { effect, untracked, type Readable, type Signal, type Stop } from './signals';

type ValueElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** el.textContent tracks the source. */
export function bindText(el: Element, source: Readable<unknown>, format?: (v: unknown) => string): Stop {
  return effect(() => {
    el.textContent = format ? format(source()) : String(source());
  });
}

/** el.hidden tracks !source — uses the native hidden attribute, no CSS involved. */
export function bindShow(el: HTMLElement, source: Readable<unknown>): Stop {
  return effect(() => {
    el.hidden = !source();
  });
}

/** el.disabled tracks source. State disables controls; it never hides or moves them. */
export function bindDisabled(el: Element & { disabled: boolean }, source: Readable<unknown>): Stop {
  return effect(() => {
    el.disabled = !!source();
  });
}

/**
 * Two-way: form control value ⇄ signal.
 * The signal's current type decides coercion (number/boolean/string), so a
 * range slider bound to a number signal round-trips as a number, and a NaN
 * from a half-typed number input is never written into the store.
 * Programmatic writes don't fire 'input', and the signal's === short-circuit
 * kills the echo from our own writeback, so this cannot loop.
 *
 * Element-specific behavior:
 *   checkbox            checked ⇄ boolean signal
 *   radio               checked ⇄ (signal === this radio's value); one signal per group
 *   select[multiple]    selected options ⇄ string[] signal
 *   input[type=file]    one-way DOM → signal (browsers forbid setting a file
 *                       input's value); the signal receives File[]
 *   <details>           open ⇄ boolean signal (via the toggle event)
 *   everything else     value string ⇄ signal, coerced to the signal's type
 */
export function bindValue(el: ValueElement | HTMLDetailsElement, sig: Signal<any>): Stop {
  if (el instanceof HTMLDetailsElement) {
    const stop = effect(() => {
      el.open = !!sig();
    });
    const onToggle = () => sig(el.open);
    el.addEventListener('toggle', onToggle);
    return () => {
      stop();
      el.removeEventListener('toggle', onToggle);
    };
  }

  const type = (el as HTMLInputElement).type;

  if (type === 'file') {
    const onInput = () => sig([...((el as HTMLInputElement).files ?? [])]);
    el.addEventListener('input', onInput);
    return () => el.removeEventListener('input', onInput);
  }

  const kind = untracked(() => typeof sig());
  const coerce = (raw: string) => (kind === 'number' ? Number(raw) : raw);
  let stop: Stop;
  let onInput: () => void;

  if (type === 'checkbox') {
    stop = effect(() => {
      (el as HTMLInputElement).checked = !!sig();
    });
    onInput = () => sig((el as HTMLInputElement).checked);
  } else if (type === 'radio') {
    stop = effect(() => {
      (el as HTMLInputElement).checked = sig() === coerce(el.value);
    });
    onInput = () => {
      if ((el as HTMLInputElement).checked) sig(coerce(el.value));
    };
  } else if (el instanceof HTMLSelectElement && el.multiple) {
    stop = effect(() => {
      const selected = sig();
      if (!Array.isArray(selected)) {
        throw new Error('simpleform: a select[multiple] binding needs a signal holding an array');
      }
      for (const option of el.options) option.selected = selected.includes(option.value);
    });
    onInput = () => sig([...el.selectedOptions].map((o) => o.value));
  } else {
    stop = effect(() => {
      el.value = String(sig());
    });
    onInput = () => {
      if (kind === 'number') {
        const n = Number(el.value);
        if (!Number.isNaN(n)) sig(n);
        return;
      }
      sig(el.value);
    };
  }

  el.addEventListener('input', onInput);

  // A press on a slider is always a thumb drag. When a text selection spans
  // the control, the browser otherwise starts an HTML5 drag OF THE SELECTION
  // mid-gesture (the no-drop cursor; the thumb freezes). Cancelling dragstart
  // keeps the gesture; what is selectable stays the app's decision.
  const onDragStart = (e: Event) => e.preventDefault();
  const isRange = type === 'range';
  if (isRange) el.addEventListener('dragstart', onDragStart);

  return () => {
    stop();
    el.removeEventListener('input', onInput);
    if (isRange) el.removeEventListener('dragstart', onDragStart);
  };
}

/** One-way value display for <progress>/<meter> — no input events exist here. */
export function bindGauge(el: HTMLProgressElement | HTMLMeterElement, source: Readable<unknown>): Stop {
  return effect(() => {
    el.value = Number(source()) || 0;
  });
}

/** Whole-subtree disable via the native inert attribute: focus, clicks, and a11y. */
export function bindInert(el: HTMLElement, source: Readable<unknown>): Stop {
  return effect(() => {
    el.inert = !!source();
  });
}

/** Mouse wheel nudges a range/number input by its step and writes the signal. */
export function bindWheel(el: HTMLInputElement, sig: Signal<number>): Stop {
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) el.stepUp();
    else el.stepDown();
    sig(el.valueAsNumber);
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
}

/** addEventListener with a Stop, so listeners tear down with their scope. */
export function listen<K extends keyof HTMLElementEventMap>(
  el: EventTarget,
  type: K | string,
  handler: (e: Event) => void,
): Stop {
  el.addEventListener(type, handler);
  return () => el.removeEventListener(type, handler);
}
