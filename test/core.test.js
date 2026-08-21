// Pure-logic tests, run with `node --test` against the built dist — zero test
// dependencies. DOM behavior is covered by the example pages in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signal,
  computed,
  effect,
  batch,
  untracked,
  resolveValue,
  resolveTarget,
  series,
} from '../dist/simpleform.js';

test('signal: read, write, === short-circuit', () => {
  const s = signal(1);
  let runs = 0;
  const stop = effect(() => {
    s();
    runs++;
  });
  assert.equal(s(), 1);
  s(2);
  assert.equal(s(), 2);
  assert.equal(runs, 2);
  s(2); // identical value — no effect run
  assert.equal(runs, 2);
  stop();
});

test('signal: frozen, so .value assignment throws instead of silently failing', () => {
  const s = signal(1);
  assert.throws(() => {
    s.value = 5;
  }, TypeError);
  assert.equal(s(), 1);
});

test('computed: cached, recomputes only when a dependency changed', () => {
  const s = signal(2);
  let computations = 0;
  const double = computed(() => {
    computations++;
    return s() * 2;
  });
  assert.equal(double(), 4);
  assert.equal(double(), 4);
  assert.equal(computations, 1);
  s(3);
  assert.equal(double(), 6);
  assert.equal(computations, 2);
});

test('batch: several writes, one effect run, no torn intermediate state', () => {
  const a = signal(1);
  const b = signal(1);
  const seen = [];
  const stop = effect(() => {
    seen.push(a() + b());
  });
  batch(() => {
    a(10);
    b(20);
  });
  assert.deepEqual(seen, [2, 30]); // never sees 11 or 21
  stop();
});

test('untracked: reads inside do not subscribe the enclosing effect', () => {
  const tracked = signal(0);
  const ignored = signal(0);
  let runs = 0;
  const stop = effect(() => {
    tracked();
    untracked(() => ignored());
    runs++;
  });
  ignored(99);
  assert.equal(runs, 1);
  tracked(1);
  assert.equal(runs, 2);
  stop();
});

test('effect: cleanup runs before re-run and on stop', () => {
  const s = signal(0);
  const log = [];
  const stop = effect(() => {
    const v = s();
    log.push(`run ${v}`);
    return () => log.push(`clean ${v}`);
  });
  s(1);
  stop();
  assert.deepEqual(log, ['run 0', 'clean 0', 'run 1', 'clean 1']);
});

test('resolveTarget: walks dots, sees prototype chain, throws loudly on a miss', () => {
  const inner = signal(5);
  const parent = { params: { rate: inner } };
  const child = Object.assign(Object.create(parent), { $index: 3 });
  assert.equal(resolveTarget(child, 'params.rate'), inner);
  assert.equal(resolveTarget(child, '$index'), 3);
  assert.throws(() => resolveTarget(parent, 'params.typo'), /path "params\.typo" not found .* "typo"/);
  assert.throws(() => resolveTarget(parent, 'nope.rate'), /stopped at "nope"/);
});

test('resolveValue: reads through signals mid-path and at the leaf, reactively', () => {
  const snapshot = signal({ pose: { x: 1 } });
  const scope = { snapshot, rate: signal(5), plain: { n: 7 }, fn: () => 9 };
  assert.equal(resolveValue(scope, 'snapshot.pose.x'), 1);
  assert.equal(resolveValue(scope, 'rate'), 5);
  assert.equal(resolveValue(scope, 'plain.n'), 7);
  assert.throws(() => resolveValue(scope, 'fn'), /plain function/);

  // reactive: an effect reading through the signal re-runs when it is swapped
  const seen = [];
  const stop = effect(() => seen.push(resolveValue(scope, 'snapshot.pose.x')));
  snapshot({ pose: { x: 2 } });
  assert.deepEqual(seen, [1, 2]);
  stop();
});

test('series: rolling capacity, gaps, reactive read, clear', () => {
  const s = series(3);
  let snapshots = [];
  const stop = effect(() => {
    snapshots.push([...s.read()]);
  });
  s.push(1);
  s.push(2);
  s.push(null); // gap
  s.push(4); // exceeds capacity — 1 falls off
  assert.deepEqual(s.read(), [2, null, 4]);
  assert.equal(snapshots.length, 5); // initial + 4 pushes
  s.clear();
  assert.deepEqual(s.read(), []);
  stop();
});
