import { describe, expect, test } from 'bun:test';
import type { SupramarkTextNode } from '@supramark/core';
import type { SelectionTextUnit, SelectionUnit } from '../../model';
import { buildUnitIndex } from '../../resolve';
import type { LayoutRect, RegisteredBlock } from '../../coordinator/registry';
import {
  chooseBlock,
  localizePoint,
  pointInRect,
  resolvePointToSelection,
  verticalGap,
} from '../../coordinator/hitTest';

const NODE = { type: 'text', value: '' } as SupramarkTextNode;
const tUnit = (unitId: string, nodeId: string, text: string): SelectionTextUnit => ({
  kind: 'text',
  unitId,
  nodeId,
  text,
  node: NODE,
});

// Three stacked text blocks (root coords): A y0..20, B y30..50, C y60..80, x 0..100.
const units: SelectionUnit[] = [
  tUnit('A#0', 'A', 'AAAAA'),
  tUnit('B#0', 'B', 'BBBBB'),
  tUnit('C#0', 'C', 'CCCCC'),
];
const index = buildUnitIndex(units);

const rectA: LayoutRect = { x: 0, y: 0, w: 100, h: 20 };
const rectB: LayoutRect = { x: 0, y: 30, w: 100, h: 20 };
const rectC: LayoutRect = { x: 0, y: 60, w: 100, h: 20 };

const blocks = (): RegisteredBlock[] => [
  { nodeId: 'A', unitIds: ['A#0'], kind: 'text', rect: rectA },
  { nodeId: 'B', unitIds: ['B#0'], kind: 'text', rect: rectB },
  { nodeId: 'C', unitIds: ['C#0'], kind: 'text', rect: rectC },
];

describe('hitTest primitives', () => {
  test('pointInRect is inclusive on the rect edges', () => {
    expect(pointInRect({ x: 0, y: 0 }, rectA)).toBe(true);
    expect(pointInRect({ x: 100, y: 20 }, rectA)).toBe(true);
    expect(pointInRect({ x: 101, y: 10 }, rectA)).toBe(false);
  });

  test('verticalGap is 0 inside the band and grows outside', () => {
    expect(verticalGap({ x: 0, y: 10 }, rectA)).toBe(0);
    expect(verticalGap({ x: 0, y: -5 }, rectA)).toBe(5);
    expect(verticalGap({ x: 0, y: 25 }, rectA)).toBe(5);
  });
});

describe('resolvePointToSelection', () => {
  test('point inside a block, left half -> before', () => {
    expect(resolvePointToSelection(blocks(), { x: 10, y: 10 }, index)).toEqual({
      nodeId: 'A',
      unitId: 'A#0',
      offset: 0,
    });
  });

  test('point inside a block, right/lower half -> after', () => {
    expect(resolvePointToSelection(blocks(), { x: 90, y: 15 }, index)).toEqual({
      nodeId: 'A',
      unitId: 'A#0',
      offset: 1,
    });
  });

  test('point in the gap between A and B picks the nearer block', () => {
    // Gap 20..30, midpoint 25. y=24 is nearer A -> A after; y=27 nearer B -> B before.
    expect(resolvePointToSelection(blocks(), { x: 50, y: 24 }, index)).toEqual({
      nodeId: 'A',
      unitId: 'A#0',
      offset: 1,
    });
    expect(resolvePointToSelection(blocks(), { x: 50, y: 27 }, index)).toEqual({
      nodeId: 'B',
      unitId: 'B#0',
      offset: 0,
    });
  });

  test('point before the first block clamps to document start', () => {
    expect(resolvePointToSelection(blocks(), { x: 50, y: -10 }, index)).toEqual({
      nodeId: 'A',
      unitId: 'A#0',
      offset: 0,
    });
  });

  test('point after the last block clamps to document end', () => {
    expect(resolvePointToSelection(blocks(), { x: 50, y: 200 }, index)).toEqual({
      nodeId: 'C',
      unitId: 'C#0',
      offset: 1,
    });
  });

  test('point beside a block within its vertical band localizes by x', () => {
    // x=150 is right of A but in A's y-band -> A wins the band, right half -> after.
    expect(resolvePointToSelection(blocks(), { x: 150, y: 10 }, index)).toEqual({
      nodeId: 'A',
      unitId: 'A#0',
      offset: 1,
    });
  });

  test('a block with an injected measure returns a precise offset', () => {
    const measured = blocks();
    measured[0].measure = { localOffsetAt: () => 3 };
    expect(resolvePointToSelection(measured, { x: 10, y: 10 }, index)).toEqual({
      nodeId: 'A',
      unitId: 'A#0',
      offset: 3,
    });
  });

  test('no laid-out blocks returns null', () => {
    const bare: RegisteredBlock[] = [
      { nodeId: 'A', unitIds: ['A#0'], kind: 'text' },
      { nodeId: 'B', unitIds: ['B#0'], kind: 'text' },
    ];
    expect(resolvePointToSelection(bare, { x: 10, y: 10 }, index)).toBeNull();
    expect(chooseBlock(bare, { x: 10, y: 10 })).toBeNull();
  });

  test('localizePoint honors an injected measure directly', () => {
    const block: RegisteredBlock = {
      nodeId: 'A',
      unitIds: ['A#0'],
      kind: 'text',
      rect: rectA,
      measure: { localOffsetAt: () => 4 },
    };
    const point = localizePoint(block, { x: 10, y: 10 }, index);
    expect(point.unitId).toBe('A#0');
    expect(point.offset).toBe(4);
  });
});
