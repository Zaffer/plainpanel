/**
 * The attribute binder: HTML files stay the primary surface.
 *
 * `bind(root, scope)` scans for data-* attributes and creates the
 * effect/listener pairs from bindings.ts. Attribute values are dot-paths
 * into the scope object — never expressions. Anything computed lives in the
 * store as a computed(); anything unknown throws loudly at bind time.
 *
 * Paths may cross signals: a segment holding a signal or computed is read
 * (reactively) and the walk continues into its value. So
 * `data-text="snapshot.pose.x"` works when `snapshot` is one signal holding
 * the latest server state, and `$item.size` stays live when a data-each row's
 * item is updated in place.
 *
 * Vocabulary:
 *   data-text="path"        textContent ← value
 *   data-bind="path"        two-way form control ⇄ signal (writable signal required)
 *   data-show="path"        hidden ← !value
 *   data-disabled="path"    disabled ← value
 *   data-on="click:path"    listener → function in scope (space-separate multiple pairs)
 *   data-wheel              wheel nudges a data-bind'ed range/number input by its step
 *   data-each="path"        on <template>: one row per array item; rows see
 *                           $item / $index plus the outer scope. Rows are
 *                           reconciled: content changes update in place (zero
 *                           DOM mutation), only length changes add/remove rows.
 */
import { effect, isComputed, isSignal, signal, untracked, type Signal, type Stop } from './signals';
import { bindDisabled, bindShow, bindText, bindValue, bindWheel, listen } from './bindings';

export type Scope = object;

function isReadable(v: unknown): v is () => unknown {
  return typeof v === 'function' && (isSignal(v as () => void) || isComputed(v as () => void));
}

/** Dot-path walk with loud errors. Reads through signals crossed mid-path; the final leaf is returned raw. */
function walk(scope: Scope, path: string): unknown {
  let current: any = scope;
  for (const key of path.split('.')) {
    if (isReadable(current)) current = current();
    if (current == null || !(key in Object(current))) {
      throw new Error(`simpleform: path "${path}" not found in scope (stopped at "${key}")`);
    }
    current = current[key];
  }
  return current;
}

/**
 * Resolve a path to its current plain value, reading through any signals or
 * computeds along the way — including a final leaf. Reactive when called
 * inside an effect (the signal reads are tracked); each call re-walks the
 * path, so bindings survive items being swapped mid-path.
 */
export function resolveValue(scope: Scope, path: string): unknown {
  const v = walk(scope, path);
  if (isReadable(v)) return v();
  if (typeof v === 'function') {
    throw new Error(`simpleform: path "${path}" resolves to a plain function — bindable values must be signal(), computed(), or plain data`);
  }
  return v;
}

/** Resolve a path to its final raw leaf (a signal to write, a handler to call) without reading it. */
export function resolveTarget(scope: Scope, path: string): unknown {
  return walk(scope, path);
}

const SELECTOR = '[data-text],[data-bind],[data-show],[data-disabled],[data-on],[data-each]';

/**
 * Binds root and its descendants against the scope. Returns a Stop that
 * removes every effect, listener, and data-each row it created.
 */
export function bind(root: Element | Document | DocumentFragment, scope: Scope): Stop {
  const stops: Stop[] = [];

  // Fail loudly at bind time, and never subscribe whatever effect we may be
  // running inside (e.g. a data-each rebuild) to these validation reads.
  const read = (path: string) => {
    untracked(() => resolveValue(scope, path));
    return () => resolveValue(scope, path);
  };

  const writable = (path: string, attr: string): Signal<any> => {
    const leaf = untracked(() => resolveTarget(scope, path));
    if (!(typeof leaf === 'function' && isSignal(leaf as () => void))) {
      throw new Error(`simpleform: ${attr}="${path}" must point to a signal(), got ${typeof leaf}`);
    }
    // Re-resolve per use so the binding stays live when the path crosses a
    // signal whose value is swapped (a data-each row's $item, for instance).
    return ((...args: unknown[]) => {
      const target = resolveTarget(scope, path) as Signal<unknown>;
      return args.length ? target(args[0]) : target();
    }) as Signal<any>;
  };

  const handler = (path: string) => {
    const leaf = untracked(() => resolveTarget(scope, path));
    if (typeof leaf !== 'function' || isReadable(leaf)) {
      throw new Error(`simpleform: data-on handler "${path}" is not a function`);
    }
    return (e: Event) => (resolveTarget(scope, path) as (e: Event) => void)(e);
  };

  const targets: Element[] = [];
  if (root instanceof Element && root.matches(SELECTOR)) targets.push(root);
  targets.push(...root.querySelectorAll(SELECTOR));

  for (const el of targets) {
    const d = (el as HTMLElement).dataset;

    if (d.each !== undefined) {
      if (!(el instanceof HTMLTemplateElement)) {
        throw new Error(`simpleform: data-each="${d.each}" only works on <template> elements`);
      }
      stops.push(bindEach(el, scope));
      continue;
    }

    if (d.text !== undefined) stops.push(bindText(el, read(d.text)));
    if (d.show !== undefined) stops.push(bindShow(el as HTMLElement, read(d.show)));
    if (d.disabled !== undefined) {
      stops.push(bindDisabled(el as Element & { disabled: boolean }, read(d.disabled)));
    }
    if (d.bind !== undefined) {
      const sig = writable(d.bind, 'data-bind');
      stops.push(bindValue(el as HTMLInputElement, sig));
      if (d.wheel !== undefined) stops.push(bindWheel(el as HTMLInputElement, sig));
    }
    if (d.on !== undefined) {
      for (const pair of d.on.trim().split(/\s+/)) {
        const i = pair.indexOf(':');
        if (i < 1) throw new Error(`simpleform: data-on="${pair}" must be "event:path"`);
        stops.push(listen(el, pair.slice(0, i), handler(pair.slice(i + 1))));
      }
    }
  }

  return () => {
    for (const stop of stops.splice(0)) stop();
  };
}

/**
 * <template data-each="path">, reconciled by position:
 *   - same length: each row's $item signal is written in place — zero DOM
 *     structural mutation (unchanged items are === no-ops);
 *   - longer: new rows are appended at the tail;
 *   - shorter: tail rows are torn down and removed.
 * Structural DOM mutation therefore happens only when the array length
 * changes. This matters beyond economy: Chrome silently cancels an
 * in-progress native slider drag when the child list of its containing
 * <fieldset> changes, so keep data-each templates in their own container,
 * not beside the controls that drive them.
 */
function bindEach(tpl: HTMLTemplateElement, scope: Scope): Stop {
  const path = (tpl.dataset.each ?? '').trim();
  type Row = { item: Signal<unknown>; stop: Stop; nodes: ChildNode[] };
  const rows: Row[] = [];

  const removeRow = (row: Row) => {
    row.stop();
    for (const node of row.nodes) node.remove();
  };

  const stopEffect = effect(() => {
    const items = resolveValue(scope, path);
    if (!Array.isArray(items)) {
      throw new Error(`simpleform: data-each="${path}" must read an array, got ${typeof items}`);
    }
    // Row effects must be top-level (not children of this effect, which would
    // purge kept rows' bindings on every re-run), and item writes must not
    // subscribe this effect to anything a row reads.
    untracked(() => {
      for (let i = 0; i < Math.min(rows.length, items.length); i++) {
        rows[i].item(items[i]);
      }
      for (let i = rows.length; i < items.length; i++) {
        const item = signal<unknown>(items[i]);
        const clone = tpl.content.cloneNode(true) as DocumentFragment;
        const rowScope = Object.assign(Object.create(scope), { $item: item, $index: i });
        const stop = bind(clone, rowScope);
        const nodes = [...clone.childNodes];
        const anchor = rows.length ? rows[rows.length - 1].nodes[rows[rows.length - 1].nodes.length - 1] : tpl;
        anchor.after(clone);
        rows.push({ item, stop, nodes });
      }
      while (rows.length > items.length) removeRow(rows.pop()!);
    });
  });

  return () => {
    stopEffect();
    for (const row of rows.splice(0)) removeRow(row);
  };
}
