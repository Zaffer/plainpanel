/**
 * The attribute binder: HTML files stay the primary surface.
 *
 * `bind(root, scope)` scans for data-* attributes and creates the
 * effect/listener pairs from bindings.ts. Attribute values are dot-paths
 * into the scope object — never expressions. Anything computed lives in the
 * store as a computed(); anything unknown throws loudly at bind time.
 *
 * Vocabulary:
 *   data-text="path"        textContent ← readable
 *   data-bind="path"        two-way form control ⇄ signal (writable signal required)
 *   data-show="path"        hidden ← !readable
 *   data-disabled="path"    disabled ← readable
 *   data-on="click:path"    listener → function in scope (space-separate multiple pairs)
 *   data-wheel              wheel nudges a data-bind'ed range/number input by its step
 *   data-each="path"        on <template>: clone content per array item;
 *                           rows see $item / $index plus the outer scope
 */
import { effect, isSignal, type Readable, type Signal, type Stop } from './signals';
import { bindDisabled, bindShow, bindText, bindValue, bindWheel, listen } from './bindings';

export type Scope = object;

/** Walks a dot-path through the scope; throws with the full path on a miss. */
export function resolvePath(scope: Scope, path: string): unknown {
  let current: any = scope;
  for (const key of path.split('.')) {
    if (current == null || !(key in Object(current))) {
      throw new Error(`simpleform: path "${path}" not found in scope (stopped at "${key}")`);
    }
    current = current[key];
  }
  return current;
}

function readable(scope: Scope, path: string): Readable<unknown> {
  const v = resolvePath(scope, path);
  if (typeof v === 'function') return v as Readable<unknown>;
  return () => v; // static leaf (e.g. a plain $item value) — constant readable
}

function writableSignal(scope: Scope, path: string, attr: string): Signal<any> {
  const v = resolvePath(scope, path);
  if (typeof v !== 'function' || !isSignal(v as () => void)) {
    throw new Error(`simpleform: ${attr}="${path}" must point to a signal(), got ${typeof v}`);
  }
  return v as Signal<any>;
}

function handler(scope: Scope, path: string): (e: Event) => void {
  const v = resolvePath(scope, path);
  if (typeof v !== 'function') {
    throw new Error(`simpleform: data-on handler "${path}" is not a function`);
  }
  return v as (e: Event) => void;
}

const SELECTOR = '[data-text],[data-bind],[data-show],[data-disabled],[data-on],[data-each]';

/**
 * Binds root and its descendants against the scope. Returns a Stop that
 * removes every effect, listener, and data-each row it created.
 */
export function bind(root: Element | Document | DocumentFragment, scope: Scope): Stop {
  const stops: Stop[] = [];

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

    if (d.text !== undefined) stops.push(bindText(el, readable(scope, d.text)));
    if (d.show !== undefined) stops.push(bindShow(el as HTMLElement, readable(scope, d.show)));
    if (d.disabled !== undefined) {
      stops.push(bindDisabled(el as Element & { disabled: boolean }, readable(scope, d.disabled)));
    }
    if (d.bind !== undefined) {
      const sig = writableSignal(scope, d.bind, 'data-bind');
      stops.push(bindValue(el as HTMLInputElement, sig));
      if (d.wheel !== undefined) stops.push(bindWheel(el as HTMLInputElement, sig));
    }
    if (d.on !== undefined) {
      for (const pair of d.on.trim().split(/\s+/)) {
        const i = pair.indexOf(':');
        if (i < 1) throw new Error(`simpleform: data-on="${pair}" must be "event:path"`);
        stops.push(listen(el, pair.slice(0, i), handler(scope, pair.slice(i + 1))));
      }
    }
  }

  return () => {
    for (const stop of stops.splice(0)) stop();
  };
}

/**
 * <template data-each="path">: rebuilds all rows whenever the array signal
 * changes identity (or is trigger()ed). Row-internal bindings update in place
 * without a rebuild; structural changes rebuild every row — simple over clever.
 */
function bindEach(tpl: HTMLTemplateElement, scope: Scope): Stop {
  const path = (tpl.dataset.each ?? '').trim();
  const list = readable(scope, path);

  return effect(() => {
    const items = list();
    if (!Array.isArray(items)) {
      throw new Error(`simpleform: data-each="${path}" must read an array, got ${typeof items}`);
    }

    const rowStops: Stop[] = [];
    const rowNodes: ChildNode[] = [];
    const frag = document.createDocumentFragment();

    items.forEach((item, index) => {
      const clone = tpl.content.cloneNode(true) as DocumentFragment;
      const rowScope = Object.assign(Object.create(scope), { $item: item, $index: index });
      rowStops.push(bind(clone, rowScope));
      rowNodes.push(...clone.childNodes);
      frag.append(clone);
    });
    tpl.after(frag);

    return () => {
      for (const stop of rowStops) stop();
      for (const node of rowNodes) node.remove();
    };
  });
}
