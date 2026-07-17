import type { SelectionNodeId, SelectionPoint, SelectionRange } from '../model';
import type { SelectionUnitIndex } from '../resolve';
import type {
  SegmentLongPressEvent,
  SegmentMenuActionEvent,
  TextSegmentHandle,
} from '../nativePrimitive';
import type { RegisteredBlock } from '../coordinator/registry';
import type {
  SelectableRichTextLongPressEvent,
  SelectableRichTextMenuActionEvent,
  SelectableRichTextRef,
} from '../../native/selectable-rich-text/src/types';

/**
 * Pure mapping helpers between a native text segment's local UTF-16 offsets
 * and Supramark's global `SelectionPoint`s, plus a thin non-pure wrapper that
 * turns a vendored `SelectableRichTextRef` into a `TextSegmentHandle`.
 *
 * This module never imports a react-native *value* — only the vendored ref
 * type, and only as `import type` — so it loads cleanly under `bun test`
 * without pulling in React Native at runtime.
 */

/** Segment-local UTF-16 `[start, end)` span contributed by one unit. */
export interface SegmentSpan {
  unitId: SelectionNodeId;
  nodeId: SelectionNodeId;
  start: number;
  end: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Build the segment-local span table for a block's units, in registration
 * order. Only units with `textLength > 0` (text + inline break) participate
 * in the native view's visible plain text; empty-text syntax units are
 * skipped. Unknown unit ids (not present in `index`) are skipped too.
 */
export function buildSegmentSpans(
  block: Pick<RegisteredBlock, 'unitIds'>,
  index: SelectionUnitIndex
): SegmentSpan[] {
  const spans: SegmentSpan[] = [];
  let start = 0;
  for (const unitId of block.unitIds) {
    const unitIndex = index.byUnitId.get(unitId);
    if (unitIndex === undefined) continue;
    const entry = index.entries[unitIndex];
    if (entry.textLength <= 0) continue;
    const end = start + entry.textLength;
    spans.push({ unitId, nodeId: entry.unit.nodeId, start, end });
    start = end;
  }
  return spans;
}

/**
 * Map a segment-local UTF-16 offset to a `SelectionPoint`. `localOffset` is
 * clamped into `[0, total]`. An offset sitting exactly on a shared boundary
 * between two spans resolves to the later span's start (offset 0), except
 * the final end, which resolves to the last span's end — the exact inverse
 * of `pointToSegmentOffset`.
 */
export function segmentOffsetToPoint(
  spans: readonly SegmentSpan[],
  localOffset: number
): SelectionPoint {
  if (spans.length === 0) return { nodeId: '', offset: 0 };
  const last = spans[spans.length - 1];
  const offset = clamp(localOffset, 0, last.end);
  for (const span of spans) {
    if (offset < span.end) {
      return { nodeId: span.nodeId, unitId: span.unitId, offset: offset - span.start };
    }
  }
  return { nodeId: last.nodeId, unitId: last.unitId, offset: last.end - last.start };
}

/**
 * Inverse of `segmentOffsetToPoint`: map a `SelectionPoint` back to a
 * segment-local UTF-16 offset. A direct `unitId` match wins; otherwise the
 * first span sharing `nodeId` is used. Returns `0` when nothing matches.
 */
export function pointToSegmentOffset(
  spans: readonly SegmentSpan[],
  point: SelectionPoint
): number {
  let span =
    point.unitId !== undefined ? spans.find(s => s.unitId === point.unitId) : undefined;
  if (!span) span = spans.find(s => s.nodeId === point.nodeId);
  if (!span) return 0;
  return span.start + clamp(point.offset, 0, span.end - span.start);
}

/** Normalize a native long-press event into a document-agnostic anchor/focus range. */
export function longPressToRange(
  event: SegmentLongPressEvent,
  spans: readonly SegmentSpan[]
): SelectionRange {
  return {
    anchor: segmentOffsetToPoint(spans, event.startUtf16),
    focus: segmentOffsetToPoint(spans, event.endUtf16),
  };
}

/** Normalize a native menu-action event into a document-agnostic anchor/focus range. */
export function menuActionToRange(
  event: SegmentMenuActionEvent,
  spans: readonly SegmentSpan[]
): SelectionRange {
  return {
    anchor: segmentOffsetToPoint(spans, event.startUtf16),
    focus: segmentOffsetToPoint(spans, event.endUtf16),
  };
}

/**
 * Map a document `SelectionRange` back into a segment-local `[start, end]`
 * pair, ordered ascending, ready to hand to `TextSegmentCommands.selectRange`
 * / `copyRange`.
 */
export function rangeToSegmentSelection(
  range: SelectionRange,
  spans: readonly SegmentSpan[]
): { startUtf16: number; endUtf16: number } {
  const a = pointToSegmentOffset(spans, range.anchor);
  const f = pointToSegmentOffset(spans, range.focus);
  return a <= f ? { startUtf16: a, endUtf16: f } : { startUtf16: f, endUtf16: a };
}

/**
 * Normalize the vendored `onTextLongPress` payload into a document-agnostic
 * `SegmentLongPressEvent`. Offsets are preserved verbatim — order-normalization
 * happens downstream in `segmentOffsetToPoint` / `resolveSelectionRange`, not
 * here — while `selectedText` is derived by slicing `paragraphText` with
 * `min`/`max` so it stays stable even if native ever sends reversed offsets.
 */
export function normalizeLongPress(
  e: SelectableRichTextLongPressEvent
): SegmentLongPressEvent {
  const start = Math.min(e.selectionStart, e.selectionEnd);
  const end = Math.max(e.selectionStart, e.selectionEnd);
  return {
    startUtf16: e.selectionStart,
    endUtf16: e.selectionEnd,
    selectedText: e.paragraphText.slice(start, end),
    local: { x: e.locationX, y: e.locationY },
    page: { x: e.pageX, y: e.pageY },
  };
}

/**
 * Normalize the vendored `onMenuAction` payload into a document-agnostic
 * `SegmentMenuActionEvent`. Offsets are preserved verbatim (see
 * `normalizeLongPress`); `selectedText` is passed through as reported by native.
 */
export function normalizeMenuAction(
  e: SelectableRichTextMenuActionEvent
): SegmentMenuActionEvent {
  return {
    id: e.id,
    title: e.title,
    startUtf16: e.selectionStart,
    endUtf16: e.selectionEnd,
    selectedText: e.selectedText,
  };
}

/**
 * Wrap a vendored `SelectableRichTextRef` as a `TextSegmentHandle`. Only the
 * ref's methods are used at runtime; the ref type itself is erased at
 * compile time, so this file never pulls in a react-native value import.
 */
export function createSegmentHandle(
  nodeId: SelectionNodeId,
  ref: SelectableRichTextRef
): TextSegmentHandle {
  return {
    nodeId,
    selectRange: (start, end) => ref.selectRange(start, end),
    clearSelection: () => ref.clearSelection(),
    copyRange: (start, end) => ref.copyRange(start, end),
  };
}
