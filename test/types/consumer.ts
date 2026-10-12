// Compile-only check: the published types resolve for a consumer using
// Node-style ESM resolution (NodeNext), with nothing silently `any`.
// Run by `npm run typecheck` (part of `npm test`); never executed.
import { signal, computed, trigger, isSignal, isComputed, bind, panel, connect, series } from 'plainpanel';

type IsAny<T> = 0 extends 1 & T ? true : false;
const notAny: [
  IsAny<typeof signal>,
  IsAny<typeof computed>,
  IsAny<typeof trigger>,
  IsAny<typeof isSignal>,
  IsAny<typeof isComputed>,
  IsAny<typeof bind>,
  IsAny<typeof panel>,
  IsAny<typeof connect>,
  IsAny<typeof series>,
] = [false, false, false, false, false, false, false, false, false];
void notAny;

// panel.select takes a signal of the option type, string or number
export function selectTakesEitherSignal(p: ReturnType<typeof panel>): void {
  p.select('mode', signal('auto'), ['auto', 'manual']).select('level', signal(1), [1, 2, 3]);
}
