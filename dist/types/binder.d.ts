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
import { type Stop } from './signals';
export type Scope = object;
/** Walks a dot-path through the scope; throws with the full path on a miss. */
export declare function resolvePath(scope: Scope, path: string): unknown;
/**
 * Binds root and its descendants against the scope. Returns a Stop that
 * removes every effect, listener, and data-each row it created.
 */
export declare function bind(root: Element | Document | DocumentFragment, scope: Scope): Stop;
