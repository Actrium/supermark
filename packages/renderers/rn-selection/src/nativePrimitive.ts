import type { SelectionNodeId, SelectionPayload, SelectionRange } from './model';

export interface NativePoint {
  x: number;
  y: number;
}

export interface NativeSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  nodeId?: SelectionNodeId;
}

export interface NativeTextSelectionSnapshot {
  range: SelectionRange;
  selectedText: string;
  rects: NativeSelectionRect[];
  payload?: SelectionPayload;
}

export interface NativeTextSelectionPrimitive {
  selectAt(point: NativePoint): Promise<NativeTextSelectionSnapshot | null>;
  setSelection(range: SelectionRange): Promise<NativeTextSelectionSnapshot | null>;
  clearSelection(): Promise<void>;
  getSelection(): Promise<NativeTextSelectionSnapshot | null>;
  getSelectionRects(range?: SelectionRange): Promise<NativeSelectionRect[]>;
}

export interface SelectableLibraryPrimitiveOptions {
  /**
   * Native component ref exposed by vendor/selectable-library or a fork of it.
   *
   * This is intentionally `unknown` here. The bridge package should keep the
   * third-party native API below Supramark's document selection model.
   */
  ref: unknown;
}
