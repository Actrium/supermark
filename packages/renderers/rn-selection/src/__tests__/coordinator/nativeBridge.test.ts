import { describe, expect, test } from 'bun:test';
import type { SupramarkTextNode } from '@supramark/core';
import type { SelectionBreakUnit, SelectionTextUnit, SelectionUnit } from '../../model';
import type { TextSegmentHandle } from '../../nativePrimitive';
import { createNativeBridge, planNativeSelection } from '../../coordinator/nativeBridge';
import { SelectionRegistry } from '../../coordinator/registry';
import { createSelectionStore } from '../../coordinator/state';

// The bridge copies `node` through the store but never inspects it.
const NODE = { type: 'text', value: '' } as SupramarkTextNode;
const tUnit = (unitId: string, nodeId: string, text: string): SelectionTextUnit => ({
  kind: 'text',
  unitId,
  nodeId,
  text,
  node: NODE,
});
const brk = (unitId: string, nodeId: string): SelectionBreakUnit => ({
  kind: 'break',
  unitId,
  nodeId,
  text: '\n',
  reason: 'block',
  node: NODE,
});

// Two paragraphs; p1's visible segment text is 'Hello world 🌟' (14 UTF-16 units).
const units: SelectionUnit[] = [
  tUnit('p1#0', 'p1', 'Hello '),
  tUnit('p1#1', 'p1', 'world'),
  tUnit('p1#2', 'p1', ' \u{1F31F}'),
  brk('p1#3', 'p1'),
  tUnit('p2#0', 'p2', 'Second'),
];

type HandleCall = ['select', number, number] | ['clear'] | ['copy', number, number];

function makeHandle(nodeId: string): { handle: TextSegmentHandle; calls: HandleCall[] } {
  const calls: HandleCall[] = [];
  return {
    calls,
    handle: {
      nodeId,
      selectRange: (s, e) => calls.push(['select', s, e]),
      clearSelection: () => calls.push(['clear']),
      copyRange: (s, e) => calls.push(['copy', s, e]),
    },
  };
}

function setup(opts?: { p2Handle?: boolean }) {
  const registry = new SelectionRegistry(units);
  const p1 = makeHandle('p1');
  const p2 = makeHandle('p2');
  registry.register({
    nodeId: 'p1',
    unitIds: ['p1#0', 'p1#1', 'p1#2'],
    kind: 'text',
    handle: p1.handle,
  });
  registry.register({
    nodeId: 'p2',
    unitIds: ['p2#0'],
    kind: 'text',
    ...(opts?.p2Handle === false ? {} : { handle: p2.handle }),
  });
  const store = createSelectionStore(() => units);
  const unsubscribe = createNativeBridge(store, registry);
  return { registry, store, p1, p2, unsubscribe };
}

const P = (nodeId: string, unitId: string, offset: number) => ({ nodeId, unitId, offset });

describe('createNativeBridge', () => {
  test('a committed single-block range is pushed as one segment-local selectRange', () => {
    const { store, p1 } = setup();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p1', 'p1#1', 5));
    // Drag in progress ('selecting'): native must stay untouched.
    expect(p1.calls).toEqual([]);
    store.commit();
    expect(p1.calls).toEqual([['select', 0, 11]]);
  });

  test('a focus on the trailing break selects to the segment end', () => {
    const { store, p1 } = setup();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p1', 'p1#3', 1));
    store.commit();
    expect(p1.calls).toEqual([['select', 0, 14]]);
  });

  test('re-committing the same range is a no-op (no menu re-pop)', () => {
    const { store, p1 } = setup();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p1', 'p1#1', 5));
    store.commit();
    store.commit();
    expect(p1.calls).toEqual([['select', 0, 11]]);
  });

  test('committing a new range in the same block replaces without clearing', () => {
    const { store, p1 } = setup();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p1', 'p1#1', 5));
    store.commit();
    store.beginAt(P('p1', 'p1#0', 6));
    store.extendTo(P('p1', 'p1#1', 5));
    store.commit();
    expect(p1.calls).toEqual([
      ['select', 0, 11],
      ['select', 6, 11],
    ]);
  });

  test('clear propagates deselection to the pushed block', () => {
    const { store, p1 } = setup();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p1', 'p1#1', 5));
    store.commit();
    store.clear();
    expect(p1.calls).toEqual([['select', 0, 11], ['clear']]);
  });

  test('clear with nothing pushed issues no native commands', () => {
    const { store, p1, p2 } = setup();
    store.clear();
    expect(p1.calls).toEqual([]);
    expect(p2.calls).toEqual([]);
  });

  test('a cross-block commit stays on the overlay and clears a previous native push', () => {
    const { store, p1, p2 } = setup();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p1', 'p1#1', 5));
    store.commit();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p2', 'p2#0', 3));
    store.commit();
    expect(p1.calls).toEqual([['select', 0, 11], ['clear']]);
    expect(p2.calls).toEqual([]);
  });

  test('moving the committed selection to another block clears the previous one', () => {
    const { store, p1, p2 } = setup();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p1', 'p1#1', 5));
    store.commit();
    store.beginAt(P('p2', 'p2#0', 0));
    store.extendTo(P('p2', 'p2#0', 6));
    store.commit();
    expect(p1.calls).toEqual([['select', 0, 11], ['clear']]);
    expect(p2.calls).toEqual([['select', 0, 6]]);
  });

  test('a handle-less owning block vetoes the push without crashing', () => {
    const { store, p1, p2 } = setup({ p2Handle: false });
    store.beginAt(P('p2', 'p2#0', 0));
    store.extendTo(P('p2', 'p2#0', 6));
    store.commit();
    expect(p1.calls).toEqual([]);
    expect(p2.calls).toEqual([]);
  });

  test('a block unregistered while pushed drops silently on clear', () => {
    const { registry, store, p1 } = setup();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p1', 'p1#1', 5));
    store.commit();
    registry.unregister('p1');
    store.clear();
    // No clearSelection reached the torn-down handle; no crash either.
    expect(p1.calls).toEqual([['select', 0, 11]]);
  });

  test('unsubscribing detaches the bridge', () => {
    const { store, p1, unsubscribe } = setup();
    unsubscribe();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p1', 'p1#1', 5));
    store.commit();
    expect(p1.calls).toEqual([]);
  });
});

describe('planNativeSelection', () => {
  test('plans nothing while selecting or idle', () => {
    const { registry, store } = setup();
    expect(planNativeSelection(store.getSnapshot(), registry)).toBeNull();
    store.beginAt(P('p1', 'p1#0', 0));
    store.extendTo(P('p1', 'p1#1', 5));
    expect(planNativeSelection(store.getSnapshot(), registry)).toBeNull();
  });

  test('plans the owning block with segment-local offsets when committed', () => {
    const { registry, store } = setup();
    store.beginAt(P('p1', 'p1#0', 2));
    store.extendTo(P('p1', 'p1#2', 3));
    store.commit();
    expect(planNativeSelection(store.getSnapshot(), registry)).toEqual({
      nodeId: 'p1',
      startUtf16: 2,
      endUtf16: 14,
    });
  });

  test('a committed collapsed selection plans nothing', () => {
    const { registry, store } = setup();
    store.beginAt(P('p1', 'p1#0', 2));
    store.commit();
    expect(planNativeSelection(store.getSnapshot(), registry)).toBeNull();
  });
});
