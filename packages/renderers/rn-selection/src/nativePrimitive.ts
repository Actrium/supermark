import type { SelectionNodeId } from './model';

/**
 * `TextSegmentHandle` contract — the imperative command + event surface a
 * single rendered native text view (a "segment") exposes upward.
 *
 * All offsets here are UTF-16 code units **local to the segment**: they index
 * into the segment's own visible plain text, not the document-wide selection
 * stream. This module sits strictly below the coordinator (see
 * `src/coordinator/`) and knows nothing about document ranges, `nodeId`
 * walks, or `SelectionPoint`s — that translation lives in
 * `src/native/segmentAdapter.ts`.
 *
 * The real vendored primitive (`native/selectable-rich-text`) is
 * command+event based, not a synchronous point-to-character measurement API:
 * there is no `selectAt`/`getSelectionRects` snapshot to await. Commands are
 * fire-and-forget; the native side fires events back (long-press, menu
 * action) carrying segment-local offsets.
 */

export interface SegmentLocalPoint {
  x: number;
  y: number;
}

export interface SegmentSelection {
  startUtf16: number;
  endUtf16: number;
  selectedText: string;
}

/** Normalized form of the vendored `onTextLongPress` event. */
export interface SegmentLongPressEvent extends SegmentSelection {
  local: SegmentLocalPoint;
  page: SegmentLocalPoint;
}

/** Normalized form of the vendored `onMenuAction` event. */
export interface SegmentMenuActionEvent extends SegmentSelection {
  id: string;
  title?: string;
}

/** The three imperative commands a segment supports; offsets are segment-local. */
export interface TextSegmentCommands {
  selectRange(startUtf16: number, endUtf16: number): void;
  clearSelection(): void;
  copyRange(startUtf16: number, endUtf16: number): void;
}

/**
 * The object a rendered text block registers upward with the coordinator.
 * Commands only — events are delivered through `SegmentEventSink` so the
 * coordinator, not the handle, owns event routing.
 */
export interface TextSegmentHandle extends TextSegmentCommands {
  readonly nodeId: SelectionNodeId;
}

/** Callbacks the coordinator hands a block so native events flow up as segment-local payloads. */
export interface SegmentEventSink {
  onLongPress?(event: SegmentLongPressEvent): void;
  onMenuAction?(event: SegmentMenuActionEvent): void;
}
