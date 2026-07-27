import { describe, expect, test } from 'bun:test';
import type { SupramarkTextNode } from '@supramark/core';
import type { SelectionBreakUnit, SelectionTextUnit } from '../../model';
import type { LayoutRect, RegisteredBlock } from '../../coordinator/registry';
import { computeOverlayRects } from '../../coordinator/overlay';

// overlay copies `node` but never inspects it.
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

const block = (
  nodeId: string,
  unitIds: string[],
  rect: LayoutRect | undefined
): RegisteredBlock => ({ nodeId, unitIds, kind: 'text', rect });

describe('computeOverlayRects', () => {
  test('empty selection yields no rects', () => {
    const blocks = [block('a', ['a#0'], { x: 0, y: 0, w: 10, h: 20 })];
    expect(computeOverlayRects(blocks, [])).toEqual([]);
  });

  test('a single covered block yields its rect', () => {
    const rect = { x: 0, y: 0, w: 10, h: 20 };
    const blocks = [block('a', ['a#0'], rect)];
    expect(computeOverlayRects(blocks, [tUnit('a#0', 'a', 'x')])).toEqual([rect]);
  });

  test('a covered block without a layout rect is skipped', () => {
    const blocks = [block('a', ['a#0'], undefined)];
    expect(computeOverlayRects(blocks, [tUnit('a#0', 'a', 'x')])).toEqual([]);
  });

  test('partial unit coverage still highlights the whole block', () => {
    const rect = { x: 0, y: 0, w: 10, h: 20 };
    const blocks = [block('a', ['a#0', 'a#1'], rect)];
    // Only a#0 covered; block-level highlight still returns the full rect.
    expect(computeOverlayRects(blocks, [tUnit('a#0', 'a', 'x')])).toEqual([rect]);
  });

  test('two vertically contiguous covered blocks merge into one union rect', () => {
    const blocks = [
      block('a', ['a#0'], { x: 0, y: 0, w: 30, h: 20 }),
      block('b', ['b#0'], { x: 0, y: 20, w: 50, h: 20 }),
    ];
    const covered = [tUnit('a#0', 'a', 'x'), tUnit('b#0', 'b', 'y')];
    expect(computeOverlayRects(blocks, covered)).toEqual([{ x: 0, y: 0, w: 50, h: 40 }]);
  });

  test('blocks separated by more than mergeGap stay distinct', () => {
    const rectA = { x: 0, y: 0, w: 30, h: 20 };
    const rectB = { x: 0, y: 40, w: 50, h: 20 };
    const blocks = [block('a', ['a#0'], rectA), block('b', ['b#0'], rectB)];
    const covered = [tUnit('a#0', 'a', 'x'), tUnit('b#0', 'b', 'y')];
    expect(computeOverlayRects(blocks, covered)).toEqual([rectA, rectB]);
  });

  test('an uncovered middle block splits the overlay', () => {
    const rectA = { x: 0, y: 0, w: 30, h: 20 };
    const rectB = { x: 0, y: 20, w: 30, h: 20 };
    const rectC = { x: 0, y: 40, w: 30, h: 20 };
    const blocks = [
      block('a', ['a#0'], rectA),
      block('b', ['b#0'], rectB),
      block('c', ['c#0'], rectC),
    ];
    // Middle uncovered: a and c are non-adjacent (gap from y=20 top of a to
    // y=40 of c exceeds mergeGap) so they stay two rects.
    const covered = [tUnit('a#0', 'a', 'x'), tUnit('c#0', 'c', 'z')];
    expect(computeOverlayRects(blocks, covered)).toEqual([rectA, rectC]);
  });

  test('a covered break unit not owned by any block adds no phantom rect', () => {
    const rectA = { x: 0, y: 0, w: 30, h: 20 };
    const blocks = [block('a', ['a#0'], rectA)];
    const covered = [tUnit('a#0', 'a', 'x'), brk('a#1', 'a')];
    // a#1 (break) is not in any block.unitIds -> only the text block highlights.
    expect(computeOverlayRects(blocks, covered)).toEqual([rectA]);
  });

  test('merge is order-independent', () => {
    const rectA = { x: 0, y: 0, w: 30, h: 20 };
    const rectB = { x: 0, y: 20, w: 50, h: 20 };
    const covered = [tUnit('a#0', 'a', 'x'), tUnit('b#0', 'b', 'y')];
    const sorted = [block('a', ['a#0'], rectA), block('b', ['b#0'], rectB)];
    const reversed = [block('b', ['b#0'], rectB), block('a', ['a#0'], rectA)];
    expect(computeOverlayRects(reversed, covered)).toEqual(computeOverlayRects(sorted, covered));
  });

  test('the merge does not mutate the source registry rects', () => {
    const rectA = { x: 0, y: 0, w: 30, h: 20 };
    const rectB = { x: 0, y: 20, w: 50, h: 20 };
    const blocks = [block('a', ['a#0'], rectA), block('b', ['b#0'], rectB)];
    const covered = [tUnit('a#0', 'a', 'x'), tUnit('b#0', 'b', 'y')];
    computeOverlayRects(blocks, covered);
    expect(rectA).toEqual({ x: 0, y: 0, w: 30, h: 20 });
    expect(rectB).toEqual({ x: 0, y: 20, w: 50, h: 20 });
  });
});
