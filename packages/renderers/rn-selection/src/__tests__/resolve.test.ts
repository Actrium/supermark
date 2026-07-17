import { describe, expect, test } from 'bun:test';
import type { SupramarkHeadingNode, SupramarkNode, SupramarkParagraphNode, SupramarkTextNode } from '@supramark/core';
import { linearizeForSelection } from '../linearize';
import type {
  SelectionBoundaryUnit,
  SelectionBreakUnit,
  SelectionSourceRange,
  SelectionTextUnit,
  SelectionUnit,
} from '../model';
import { buildUnitIndex, locateSelectionPoint, resolveSelectionRange } from '../resolve';
import { serializeSelectionUnits } from '../serialize';

// A throwaway AST node — resolve.ts copies `node` but never inspects it.
const NODE = { type: 'text', value: '' } as SupramarkTextNode;

const tUnit = (
  unitId: string,
  nodeId: string,
  text: string,
  sourceRange?: SelectionSourceRange
): SelectionTextUnit => ({ kind: 'text', unitId, nodeId, text, node: NODE, sourceRange });
const brk = (unitId: string, nodeId: string): SelectionBreakUnit => ({
  kind: 'break',
  unitId,
  nodeId,
  text: '\n',
  reason: 'block',
  node: NODE,
});
const bound = (unitId: string, nodeId: string): SelectionBoundaryUnit => ({
  kind: 'boundary',
  unitId,
  nodeId,
  node: NODE,
  reason: 'custom',
});

const text = (value: string): SupramarkTextNode => ({ type: 'text', value }) as SupramarkTextNode;
const paragraph = (...children: SupramarkNode[]): SupramarkParagraphNode =>
  ({ type: 'paragraph', children }) as SupramarkParagraphNode;
const heading = (depth: 1 | 2 | 3 | 4 | 5 | 6, ...children: SupramarkNode[]): SupramarkHeadingNode =>
  ({ type: 'heading', depth, children }) as SupramarkHeadingNode;

describe('resolveSelectionRange', () => {
  test('selecting the whole stream serializes identically to the full stream', () => {
    const units = linearizeForSelection([heading(1, text('Hello')), paragraph(text('world'))]);
    const first = units[0];
    const last = units[units.length - 1];
    const resolved = resolveSelectionRange(units, {
      anchor: { nodeId: first.nodeId, unitId: first.unitId, offset: 0 },
      focus: { nodeId: last.nodeId, unitId: last.unitId, offset: 99 },
    });
    expect(serializeSelectionUnits(resolved, 'plainText')).toBe(
      serializeSelectionUnits(units, 'plainText')
    );
    expect(serializeSelectionUnits(resolved, 'markdown')).toBe(
      serializeSelectionUnits(units, 'markdown')
    );
  });

  test('a collapsed range resolves to nothing', () => {
    const units: SelectionUnit[] = [tUnit('u#0', 'u', 'HelloWorld')];
    const resolved = resolveSelectionRange(units, {
      anchor: { nodeId: 'u', unitId: 'u#0', offset: 4 },
      focus: { nodeId: 'u', unitId: 'u#0', offset: 4 },
    });
    expect(resolved).toEqual([]);
  });

  test('an intra-unit range slices the text and shifts the source range', () => {
    const units: SelectionUnit[] = [
      tUnit('u#0', 'u', 'HelloWorld', { startUtf16: 100, endUtf16: 110 }),
    ];
    const resolved = resolveSelectionRange(units, {
      anchor: { nodeId: 'u', unitId: 'u#0', offset: 2 },
      focus: { nodeId: 'u', unitId: 'u#0', offset: 7 },
    });
    expect(resolved).toHaveLength(1);
    const only = resolved[0] as SelectionTextUnit;
    expect(only.text).toBe('lloWo');
    expect(only.sourceRange?.startUtf16).toBe(102);
    expect(only.sourceRange?.endUtf16).toBe(107);
  });

  test('a reversed range (anchor after focus) normalizes to the forward result', () => {
    const units: SelectionUnit[] = [
      tUnit('u#0', 'u', 'HelloWorld', { startUtf16: 0, endUtf16: 10 }),
    ];
    const forward = resolveSelectionRange(units, {
      anchor: { nodeId: 'u', unitId: 'u#0', offset: 2 },
      focus: { nodeId: 'u', unitId: 'u#0', offset: 7 },
    });
    const reversed = resolveSelectionRange(units, {
      anchor: { nodeId: 'u', unitId: 'u#0', offset: 7 },
      focus: { nodeId: 'u', unitId: 'u#0', offset: 2 },
    });
    expect(reversed).toEqual(forward);
  });

  test('a multi-unit range half-cuts the ends and keeps the middle verbatim', () => {
    const units: SelectionUnit[] = [
      tUnit('a#0', 'a', 'HELLO'),
      bound('m#0', 'm'),
      tUnit('z#0', 'z', 'WORLD'),
    ];
    const resolved = resolveSelectionRange(units, {
      anchor: { nodeId: 'a', unitId: 'a#0', offset: 2 },
      focus: { nodeId: 'z', unitId: 'z#0', offset: 3 },
    });
    expect(resolved).toHaveLength(3);
    expect((resolved[0] as SelectionTextUnit).text).toBe('LLO');
    expect(resolved[1].kind).toBe('boundary');
    expect((resolved[2] as SelectionTextUnit).text).toBe('WOR');
    expect(serializeSelectionUnits(resolved, 'plainText')).toBe('LLOWOR');
  });

  test('an edge boundary is included only when fully covered', () => {
    // nodeId "b0"/"b2" hold a single zero-text boundary each, so the nodeId walk
    // encodes before (offset 0) / after (offset > 0) as intraOffset 0 / 1.
    const units: SelectionUnit[] = [bound('b0#0', 'b0'), tUnit('t1#0', 't1', 'MID'), bound('b2#0', 'b2')];

    // Head boundary fully covered (selection starts before it) -> included.
    const headCovered = resolveSelectionRange(units, {
      anchor: { nodeId: 'b0', offset: 0 },
      focus: { nodeId: 't1', unitId: 't1#0', offset: 3 },
    });
    expect(headCovered[0].kind).toBe('boundary');

    // Head boundary only partially covered (selection starts after it) -> dropped.
    const headSkipped = resolveSelectionRange(units, {
      anchor: { nodeId: 'b0', offset: 1 },
      focus: { nodeId: 't1', unitId: 't1#0', offset: 3 },
    });
    expect(headSkipped.every(u => u.kind !== 'boundary')).toBe(true);

    // Tail boundary fully covered (selection extends past it) -> included.
    const tailCovered = resolveSelectionRange(units, {
      anchor: { nodeId: 't1', unitId: 't1#0', offset: 0 },
      focus: { nodeId: 'b2', offset: 1 },
    });
    expect(tailCovered.some(u => u.kind === 'boundary')).toBe(true);

    // Tail boundary not reached (selection ends before it) -> dropped.
    const tailSkipped = resolveSelectionRange(units, {
      anchor: { nodeId: 't1', unitId: 't1#0', offset: 0 },
      focus: { nodeId: 'b2', offset: 0 },
    });
    expect(tailSkipped.every(u => u.kind !== 'boundary')).toBe(true);
  });
});

describe('splitTextUnit payload preservation (regression)', () => {
  const codeUnit: SelectionTextUnit = {
    kind: 'text',
    unitId: 'c#0',
    nodeId: 'c',
    text: 'foo',
    node: NODE,
    payload: { plainText: 'foo', markdown: '`foo`', source: '`foo`' },
  };

  test('a fully covered payload unit keeps its whole-unit markdown/source', () => {
    const resolved = resolveSelectionRange([codeUnit], {
      anchor: { nodeId: 'c', unitId: 'c#0', offset: 0 },
      focus: { nodeId: 'c', unitId: 'c#0', offset: 3 },
    });
    expect(serializeSelectionUnits(resolved, 'markdown')).toBe('`foo`');
    expect(serializeSelectionUnits(resolved, 'source')).toBe('`foo`');
    expect(serializeSelectionUnits(resolved, 'plainText')).toBe('foo');
  });

  test('a partial slice drops the whole-unit syntax instead of leaking it', () => {
    const resolved = resolveSelectionRange([codeUnit], {
      anchor: { nodeId: 'c', unitId: 'c#0', offset: 1 },
      focus: { nodeId: 'c', unitId: 'c#0', offset: 3 },
    });
    expect(serializeSelectionUnits(resolved, 'markdown')).toBe('oo');
  });
});

describe('zero-text units addressed by unitId (regression)', () => {
  test('a boundary selected via {unitId, offset 0..1} is kept, not collapsed', () => {
    const units: SelectionUnit[] = [bound('b#0', 'b')];
    const resolved = resolveSelectionRange(units, {
      anchor: { nodeId: 'b', unitId: 'b#0', offset: 0 },
      focus: { nodeId: 'b', unitId: 'b#0', offset: 1 },
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].kind).toBe('boundary');
  });
});

describe('locateSelectionPoint', () => {
  test('a unitId hit wins over the nodeId walk', () => {
    const units: SelectionUnit[] = [tUnit('shared#0', 'shared', 'AAAA'), brk('shared#1', 'shared')];
    const index = buildUnitIndex(units);

    const byUnit = locateSelectionPoint(index, { nodeId: 'shared', unitId: 'shared#1', offset: 0 });
    expect(byUnit.unitIndex).toBe(1); // the trailing break, targeted directly

    const byNode = locateSelectionPoint(index, { nodeId: 'shared', offset: 2 });
    expect(byNode.unitIndex).toBe(0); // walks to the content unit
    expect(byNode.intraOffset).toBe(2);
  });

  test('offsets past a node clamp to the end of its last content unit', () => {
    const units: SelectionUnit[] = [tUnit('shared#0', 'shared', 'AAAA'), brk('shared#1', 'shared')];
    const index = buildUnitIndex(units);
    const located = locateSelectionPoint(index, { nodeId: 'shared', offset: 999 });
    // The break (length 1) is the last content unit reachable by the walk.
    expect(located.unitIndex).toBe(1);
    expect(located.intraOffset).toBe(1);
  });
});
