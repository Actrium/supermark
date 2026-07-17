import type { SupramarkNode } from '@supramark/core';

export type SelectionNodeId = string;

export interface SelectionPoint {
  nodeId: SelectionNodeId;
  offset: number;
  affinity?: 'upstream' | 'downstream';
}

export interface SelectionRange {
  anchor: SelectionPoint;
  focus: SelectionPoint;
}

export type SelectionUnitKind = 'text' | 'break' | 'atom' | 'boundary';

export interface SelectionSourceRange {
  startUtf16?: number;
  endUtf16?: number;
  startByte?: number;
  endByte?: number;
}

export interface SelectionPayload {
  plainText?: string;
  markdown?: string;
  html?: string;
  svg?: string;
  png?: Uint8Array | string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface SelectionTextUnit {
  kind: 'text';
  nodeId: SelectionNodeId;
  text: string;
  node: SupramarkNode;
  payload?: SelectionPayload;
  sourceRange?: SelectionSourceRange;
}

export interface SelectionBreakUnit {
  kind: 'break';
  nodeId: SelectionNodeId;
  text: '\n';
  reason: 'block' | 'line' | 'list-item' | 'table-row' | 'custom';
  node?: SupramarkNode;
}

export interface SelectionAtomUnit {
  kind: 'atom';
  nodeId: SelectionNodeId;
  label: string;
  node: SupramarkNode;
  payload: SelectionPayload;
}

export interface SelectionBoundaryUnit {
  kind: 'boundary';
  nodeId: SelectionNodeId;
  node: SupramarkNode;
  reason: 'table' | 'diagram' | 'math' | 'container' | 'input' | 'unsupported' | 'custom';
}

export type SelectionUnit =
  | SelectionTextUnit
  | SelectionBreakUnit
  | SelectionAtomUnit
  | SelectionBoundaryUnit;

export type SelectionBehavior = 'text' | 'atom' | 'none' | 'boundary' | 'custom';

export interface SelectionNodeDescriptor<TNode extends SupramarkNode = SupramarkNode> {
  node: TNode;
  nodeId: SelectionNodeId;
  behavior: SelectionBehavior;
  units?: SelectionUnit[];
  payload?: SelectionPayload;
}

export interface SelectionContext {
  source?: string;
}

export type SelectionPathSegment = string | number;
