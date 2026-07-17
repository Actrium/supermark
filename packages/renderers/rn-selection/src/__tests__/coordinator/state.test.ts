import { describe, expect, test } from 'bun:test';
import type { SupramarkTextNode } from '@supramark/core';
import type { SelectionBreakUnit, SelectionTextUnit, SelectionUnit } from '../../model';
import { createSelectionStore } from '../../coordinator/state';
import { serializeSelectionUnits } from '../../serialize';

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

// text 'HELLO' (node a), break, text 'WORLD' (node b).
const units: SelectionUnit[] = [
  tUnit('a#0', 'a', 'HELLO'),
  brk('a#1', 'a'),
  tUnit('b#0', 'b', 'WORLD'),
];

describe('createSelectionStore', () => {
  test('starts idle with an empty snapshot', () => {
    const store = createSelectionStore(() => units);
    const snap = store.getSnapshot();
    expect(snap.phase).toBe('idle');
    expect(snap.range).toBeNull();
    expect(snap.units).toEqual([]);
  });

  test('getSnapshot returns a stable reference until an action', () => {
    const store = createSelectionStore(() => units);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  test('beginAt enters selecting with a collapsed empty selection', () => {
    const store = createSelectionStore(() => units);
    store.beginAt({ nodeId: 'a', unitId: 'a#0', offset: 1 });
    const snap = store.getSnapshot();
    expect(snap.phase).toBe('selecting');
    expect(snap.units).toEqual([]);
    expect(snap.range).not.toBeNull();
  });

  test('extendTo derives covered units via resolveSelectionRange', () => {
    const store = createSelectionStore(() => units);
    store.beginAt({ nodeId: 'a', unitId: 'a#0', offset: 1 });
    store.extendTo({ nodeId: 'b', unitId: 'b#0', offset: 3 });
    const snap = store.getSnapshot();
    expect(snap.phase).toBe('selecting');
    expect(snap.units).toHaveLength(3);
    expect((snap.units[0] as SelectionTextUnit).text).toBe('ELLO');
    expect((snap.units[snap.units.length - 1] as SelectionTextUnit).text).toBe('WOR');
    expect(serializeSelectionUnits(snap.units, 'plainText')).toBe('ELLO\nWOR');
  });

  test('extendTo before beginAt is ignored', () => {
    const store = createSelectionStore(() => units);
    store.extendTo({ nodeId: 'b', unitId: 'b#0', offset: 3 });
    expect(store.getSnapshot().phase).toBe('idle');
  });

  test('commit freezes selecting into selected without changing units', () => {
    const store = createSelectionStore(() => units);
    store.beginAt({ nodeId: 'a', unitId: 'a#0', offset: 1 });
    store.extendTo({ nodeId: 'b', unitId: 'b#0', offset: 3 });
    const before = store.getSnapshot().units;
    store.commit();
    const after = store.getSnapshot();
    expect(after.phase).toBe('selected');
    expect(serializeSelectionUnits(after.units, 'plainText')).toBe(
      serializeSelectionUnits(before, 'plainText')
    );
  });

  test('clear resets to the idle empty snapshot', () => {
    const store = createSelectionStore(() => units);
    store.beginAt({ nodeId: 'a', unitId: 'a#0', offset: 1 });
    store.extendTo({ nodeId: 'b', unitId: 'b#0', offset: 3 });
    store.clear();
    const snap = store.getSnapshot();
    expect(snap.phase).toBe('idle');
    expect(snap.range).toBeNull();
    expect(snap.units).toEqual([]);
  });

  test('subscribe fires on each mutating action', () => {
    const store = createSelectionStore(() => units);
    let count = 0;
    const unsub = store.subscribe(() => {
      count += 1;
    });
    store.beginAt({ nodeId: 'a', unitId: 'a#0', offset: 1 });
    store.extendTo({ nodeId: 'b', unitId: 'b#0', offset: 3 });
    store.commit();
    store.clear();
    unsub();
    expect(count).toBe(4);
  });

  test('the snapshot reference changes after a mutating action', () => {
    const store = createSelectionStore(() => units);
    const before = store.getSnapshot();
    store.beginAt({ nodeId: 'a', unitId: 'a#0', offset: 1 });
    expect(store.getSnapshot()).not.toBe(before);
  });
});
