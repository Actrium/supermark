import type { SelectionRange, SelectionUnit } from '../model';
import type {
  SegmentEventSink,
  SegmentLongPressEvent,
  SegmentMenuActionEvent,
} from '../nativePrimitive';
import {
  longPressToRange,
  menuActionToRange,
  type SegmentSpan,
} from '../native/segmentAdapter';
import { resolveSelectionRange } from '../resolve';
import { serializeSelectionUnits, type SelectionSerializeFormat } from '../serialize';
import type { SelectionStore } from './state';

/**
 * A host-facing copy request emitted when a native menu action fires. The
 * package never touches a clipboard library itself; it serializes the covered
 * range in the requested `format` and hands the result to the host `onCopy`.
 */
export interface SelectionCopyRequest {
  /** Native menu action id. */
  id: string;
  format: SelectionSerializeFormat;
  /** Serialized in `format`; `undefined` when the format yields nothing. */
  payload: string | Uint8Array | undefined;
  /** `plainText` convenience — always a string, `''` when nothing is covered. */
  text: string;
  /** The document range that was copied. */
  range: SelectionRange;
}

export interface BlockSinkDeps {
  /** Segment-local spans for THIS block; read lazily so a restream stays correct. */
  getSpans(): readonly SegmentSpan[];
  /** The full document unit stream (for `resolveSelectionRange` on menu action). */
  getUnits(): readonly SelectionUnit[];
  store: Pick<SelectionStore, 'beginAt' | 'extendTo' | 'commit'>;
  /** Host copy delegate. The package never touches a clipboard lib. */
  onCopy?(request: SelectionCopyRequest): void;
  /** Map a native menu action id -> serialize format; defaults to `plainText`. */
  formatForAction?(id: string): SelectionSerializeFormat;
}

/**
 * Per-block event routing layer that closes the "native events carry no nodeId"
 * gap: each sink is bound to exactly one block through its `getSpans` /
 * `getUnits` closures, so a root-level shared sink is unnecessary. The
 * coordinator (`SelectionRoot`) constructs one sink per registered block.
 */
export function createBlockSink(deps: BlockSinkDeps): SegmentEventSink {
  return {
    onLongPress(event: SegmentLongPressEvent) {
      const range = longPressToRange(event, deps.getSpans());
      deps.store.beginAt(range.anchor);
      deps.store.extendTo(range.focus);
      // Left in 'selecting'; the overlay renders from snapshot.units either way.
    },
    onMenuAction(event: SegmentMenuActionEvent) {
      const range = menuActionToRange(event, deps.getSpans());
      // Reflect into the store so the overlay matches what was copied.
      deps.store.beginAt(range.anchor);
      deps.store.extendTo(range.focus);
      deps.store.commit();
      const format = deps.formatForAction?.(event.id) ?? 'plainText';
      const units = resolveSelectionRange(deps.getUnits(), range);
      const payload = serializeSelectionUnits(units, format);
      const textOut = serializeSelectionUnits(units, 'plainText');
      deps.onCopy?.({
        id: event.id,
        format,
        payload,
        text: typeof textOut === 'string' ? textOut : '',
        range,
      });
    },
  };
}
