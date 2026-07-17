import { describe, expect, test } from 'bun:test';
import type { SupramarkTextNode } from '@supramark/core';
import type { SelectionTextUnit, SelectionUnit } from '../../model';
import { buildUnitIndex } from '../../resolve';
import {
  buildSegmentSpans,
  longPressToRange,
  menuActionToRange,
  pointToSegmentOffset,
  rangeToSegmentSelection,
  segmentOffsetToPoint,
} from '../../native/segmentAdapter';

// A throwaway AST node — segmentAdapter copies `node` but never inspects it.
const NODE = { type: 'text', value: '' } as SupramarkTextNode;

const tUnit = (unitId: string, nodeId: string, text: string): SelectionTextUnit => ({
  kind: 'text',
  unitId,
  nodeId,
  text,
  node: NODE,
});

describe('buildSegmentSpans', () => {
  test('skips empty-text units and accumulates offsets', () => {
    const units: SelectionUnit[] = [
      tUnit('h#0', 'h', ''),
      tUnit('h#1', 'h', 'Hello'),
      tUnit('h#2', 'h', 'World'),
    ];
    const index = buildUnitIndex(units);
    const block = { unitIds: ['h#0', 'h#1', 'h#2'] };
    const spans = buildSegmentSpans(block, index);

    expect(spans).toEqual([
      { unitId: 'h#1', nodeId: 'h', start: 0, end: 5 },
      { unitId: 'h#2', nodeId: 'h', start: 5, end: 10 },
    ]);
  });

  test('skips unit ids missing from the index', () => {
    const units: SelectionUnit[] = [tUnit('h#1', 'h', 'Hello')];
    const index = buildUnitIndex(units);
    const spans = buildSegmentSpans({ unitIds: ['missing#0', 'h#1'] }, index);
    expect(spans).toEqual([{ unitId: 'h#1', nodeId: 'h', start: 0, end: 5 }]);
  });
});

describe('segmentOffsetToPoint / pointToSegmentOffset', () => {
  const units: SelectionUnit[] = [
    tUnit('h#0', 'h', ''),
    tUnit('h#1', 'h', 'Hello'),
    tUnit('h#2', 'h', 'World'),
  ];
  const index = buildUnitIndex(units);
  const spans = buildSegmentSpans({ unitIds: ['h#0', 'h#1', 'h#2'] }, index);

  test('maps interior offsets to the containing span', () => {
    expect(segmentOffsetToPoint(spans, 3)).toEqual({ nodeId: 'h', unitId: 'h#1', offset: 3 });
    expect(segmentOffsetToPoint(spans, 7)).toEqual({ nodeId: 'h', unitId: 'h#2', offset: 2 });
  });

  test('a shared boundary offset resolves to the later span start', () => {
    expect(segmentOffsetToPoint(spans, 5)).toEqual({ nodeId: 'h', unitId: 'h#2', offset: 0 });
  });

  test('the final end resolves to the last span end', () => {
    expect(segmentOffsetToPoint(spans, 10)).toEqual({ nodeId: 'h', unitId: 'h#2', offset: 5 });
  });

  test('offsets clamp into range', () => {
    expect(segmentOffsetToPoint(spans, 99)).toEqual({ nodeId: 'h', unitId: 'h#2', offset: 5 });
    expect(segmentOffsetToPoint(spans, -1)).toEqual({ nodeId: 'h', unitId: 'h#1', offset: 0 });
  });

  test('pointToSegmentOffset is the exact inverse over the whole range', () => {
    const total = spans[spans.length - 1].end;
    for (let o = 0; o <= total; o++) {
      const point = segmentOffsetToPoint(spans, o);
      expect(pointToSegmentOffset(spans, point)).toBe(o);
    }
  });

  test('pointToSegmentOffset falls back to matching by nodeId when unitId is absent', () => {
    expect(pointToSegmentOffset(spans, { nodeId: 'h', offset: 2 })).toBe(2);
  });

  test('pointToSegmentOffset returns 0 when nothing matches', () => {
    expect(pointToSegmentOffset(spans, { nodeId: 'other', offset: 2 })).toBe(0);
  });
});

describe('event translation', () => {
  const units: SelectionUnit[] = [tUnit('h#1', 'h', 'Hello'), tUnit('h#2', 'h', 'World')];
  const index = buildUnitIndex(units);
  const spans = buildSegmentSpans({ unitIds: ['h#1', 'h#2'] }, index);

  test('longPressToRange builds anchor/focus from segment-local offsets', () => {
    const range = longPressToRange(
      {
        startUtf16: 2,
        endUtf16: 7,
        selectedText: 'lloWo',
        local: { x: 0, y: 0 },
        page: { x: 0, y: 0 },
      },
      spans
    );
    expect(range.anchor).toEqual({ nodeId: 'h', unitId: 'h#1', offset: 2 });
    expect(range.focus).toEqual({ nodeId: 'h', unitId: 'h#2', offset: 2 });
  });

  test('menuActionToRange mirrors the long-press mapping', () => {
    const range = menuActionToRange(
      { startUtf16: 2, endUtf16: 7, selectedText: 'lloWo', id: 'copy' },
      spans
    );
    expect(range.anchor).toEqual({ nodeId: 'h', unitId: 'h#1', offset: 2 });
    expect(range.focus).toEqual({ nodeId: 'h', unitId: 'h#2', offset: 2 });
  });

  test('rangeToSegmentSelection orders the result ascending regardless of direction', () => {
    const forward = rangeToSegmentSelection(
      { anchor: { nodeId: 'h', unitId: 'h#1', offset: 2 }, focus: { nodeId: 'h', unitId: 'h#2', offset: 2 } },
      spans
    );
    const reversed = rangeToSegmentSelection(
      { anchor: { nodeId: 'h', unitId: 'h#2', offset: 2 }, focus: { nodeId: 'h', unitId: 'h#1', offset: 2 } },
      spans
    );
    expect(forward).toEqual({ startUtf16: 2, endUtf16: 7 });
    expect(reversed).toEqual({ startUtf16: 2, endUtf16: 7 });
  });
});
