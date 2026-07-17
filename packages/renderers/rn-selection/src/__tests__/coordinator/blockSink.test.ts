import { describe, expect, test } from 'bun:test';
import type { SupramarkTextNode } from '@supramark/core';
import type {
  SelectionBreakUnit,
  SelectionPayload,
  SelectionTextUnit,
  SelectionUnit,
} from '../../model';
import type {
  SegmentLongPressEvent,
  SegmentMenuActionEvent,
} from '../../nativePrimitive';
import type { RegisteredBlock } from '../../coordinator/registry';
import { createSelectionStore } from '../../coordinator/state';
import { createBlockSink, type SelectionCopyRequest } from '../../coordinator/blockSink';
import { buildSegmentSpans } from '../../native/segmentAdapter';
import { buildUnitIndex } from '../../resolve';
import { serializeSelectionUnits, type SelectionSerializeFormat } from '../../serialize';

// blockSink copies `node` but never inspects it.
const NODE = { type: 'text', value: '' } as SupramarkTextNode;
const tUnit = (
  unitId: string,
  nodeId: string,
  text: string,
  payload?: SelectionPayload
): SelectionTextUnit => ({
  kind: 'text',
  unitId,
  nodeId,
  text,
  node: NODE,
  ...(payload ? { payload } : {}),
});
const brk = (unitId: string, nodeId: string): SelectionBreakUnit => ({
  kind: 'break',
  unitId,
  nodeId,
  text: '\n',
  reason: 'block',
  node: NODE,
});

// Two blocks in one doc stream. p1's visible units are p1#0..p1#2 (no trailing
// break), p2 is a second paragraph.
const units: SelectionUnit[] = [
  tUnit('p1#0', 'p1', 'Hello '),
  tUnit('p1#1', 'p1', 'world', { markdown: '**world**' }),
  tUnit('p1#2', 'p1', ' \u{1F31F}'),
  brk('p1#3', 'p1'),
  tUnit('p2#0', 'p2', 'Second'),
];

const blockP1: RegisteredBlock = { nodeId: 'p1', unitIds: ['p1#0', 'p1#1', 'p1#2'], kind: 'text' };
const blockP2: RegisteredBlock = { nodeId: 'p2', unitIds: ['p2#0'], kind: 'text' };

const lp = (startUtf16: number, endUtf16: number): SegmentLongPressEvent => ({
  startUtf16,
  endUtf16,
  selectedText: '',
  local: { x: 0, y: 0 },
  page: { x: 0, y: 0 },
});
const ma = (id: string, startUtf16: number, endUtf16: number): SegmentMenuActionEvent => ({
  id,
  startUtf16,
  endUtf16,
  selectedText: '',
});

function makeDeps(
  block: RegisteredBlock,
  opts?: { formatForAction?(id: string): SelectionSerializeFormat }
) {
  const store = createSelectionStore(() => units);
  const captured: SelectionCopyRequest[] = [];
  const deps = {
    getSpans: () => buildSegmentSpans(block, buildUnitIndex(units)),
    getUnits: () => units,
    store,
    onCopy: (r: SelectionCopyRequest) => captured.push(r),
    formatForAction: opts?.formatForAction,
  };
  return { deps, store, captured };
}

describe('createBlockSink', () => {
  test('onLongPress maps a segment range into store selection', () => {
    const { deps, store } = makeDeps(blockP1);
    createBlockSink(deps).onLongPress?.(lp(0, 11));
    const snap = store.getSnapshot();
    expect(snap.phase).toBe('selecting');
    expect(serializeSelectionUnits(snap.units, 'plainText')).toBe('Hello world');
  });

  test('onLongPress with reversed offsets still covers the ascending range', () => {
    const { deps, store } = makeDeps(blockP1);
    createBlockSink(deps).onLongPress?.(lp(11, 0));
    expect(serializeSelectionUnits(store.getSnapshot().units, 'plainText')).toBe('Hello world');
  });

  test('onMenuAction reflects into the store and commits', () => {
    const { deps, store } = makeDeps(blockP1);
    createBlockSink(deps).onMenuAction?.(ma('copy', 0, 11));
    const snap = store.getSnapshot();
    expect(snap.phase).toBe('selected');
    expect(snap.units.length).toBeGreaterThan(0);
  });

  test('onMenuAction serializes markdown via formatForAction and calls onCopy once', () => {
    const { deps, captured } = makeDeps(blockP1, {
      formatForAction: id => (id === 'copy-md' ? 'markdown' : 'plainText'),
    });
    // Segment offsets [6, 11) cover exactly the 'world' unit (p1#1).
    createBlockSink(deps).onMenuAction?.(ma('copy-md', 6, 11));
    expect(captured).toHaveLength(1);
    expect(captured[0].id).toBe('copy-md');
    expect(captured[0].format).toBe('markdown');
    expect(captured[0].payload).toBe('**world**');
    expect(captured[0].text).toBe('world');
  });

  test('onMenuAction defaults to plainText when no formatForAction', () => {
    const { deps, captured } = makeDeps(blockP1);
    createBlockSink(deps).onMenuAction?.(ma('copy', 6, 11));
    expect(captured[0].format).toBe('plainText');
    expect(captured[0].payload).toBe(captured[0].text);
  });

  test('a collapsed menu range copies empty text and does not populate units', () => {
    const { deps, store, captured } = makeDeps(blockP1);
    createBlockSink(deps).onMenuAction?.(ma('copy', 3, 3));
    expect(captured[0].text).toBe('');
    expect(store.getSnapshot().units).toEqual([]);
  });

  test('per-block binding: two sinks map the same local offset to different nodeIds', () => {
    const p1 = makeDeps(blockP1);
    const p2 = makeDeps(blockP2);
    createBlockSink(p1.deps).onLongPress?.(lp(0, 3));
    createBlockSink(p2.deps).onLongPress?.(lp(0, 3));
    const u1 = p1.store.getSnapshot().units;
    const u2 = p2.store.getSnapshot().units;
    expect(u1[0].nodeId).toBe('p1');
    expect(u2[0].nodeId).toBe('p2');
    expect(u1[0].nodeId).not.toBe(u2[0].nodeId);
  });

  test('spans are read lazily', () => {
    let currentBlock: RegisteredBlock = { nodeId: 'p1', unitIds: ['p1#0'], kind: 'text' };
    const store = createSelectionStore(() => units);
    const sink = createBlockSink({
      getSpans: () => buildSegmentSpans(currentBlock, buildUnitIndex(units)),
      getUnits: () => units,
      store,
    });
    // Only p1#0 visible -> [0,6) covers just 'Hello '.
    sink.onLongPress?.(lp(0, 6));
    expect(serializeSelectionUnits(store.getSnapshot().units, 'plainText')).toBe('Hello ');
    // Swap the block for one exposing more units; getSpans must re-read it.
    currentBlock = { nodeId: 'p1', unitIds: ['p1#0', 'p1#1', 'p1#2'], kind: 'text' };
    sink.onLongPress?.(lp(0, 11));
    expect(serializeSelectionUnits(store.getSnapshot().units, 'plainText')).toBe('Hello world');
  });
});
