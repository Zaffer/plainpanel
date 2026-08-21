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
import { type Stop } from './signals';
export type Scope = object;
/**
 * Resolve a path to its current plain value, reading through any signals or
 * computeds along the way — including a final leaf. Reactive when called
 * inside an effect (the signal reads are tracked); each call re-walks the
 * path, so bindings survive items being swapped mid-path.
 */
export declare function resolveValue(scope: Scope, path: string): unknown;
/** Resolve a path to its final raw leaf (a signal to write, a handler to call) without reading it. */
export declare function resolveTarget(scope: Scope, path: string): unknown;
/**
 * Binds root and its descendants against the scope. Returns a Stop that
 * removes every effect, listener, and data-each row it created.
 */
export declare function bind(root: Element | Document | DocumentFragment, scope: Scope): Stop;
