import type { SupramarkNode } from '@supramark/core';

/**
 * Offset / length contract (fixed for milestone 1)
 *
 * - `SelectionPoint.offset` is a UTF-16 code-unit index into the matched unit's
 *   `text`, valid over `[0, text.length]`.
 * - Text units carry visible `text`; an offset ranges over the whole string.
 * - Atom and boundary units carry no `text` (length 0). For them an offset of 0
 *   means "before" the unit and any offset > 0 means "after" it, so the resolver
 *   only ever needs `offset ∈ {0, 1}` there.
 * - A `break` unit's `text` is the single `'\n'` it contributes to the global
 *   plain-text stream (length 1). Empty syntax units emitted by the linearizer
 *   carry an empty `text` and contribute length 0.
 *
 * All global stream offsets used by `resolve.ts` accumulate
 * `unit.text?.length ?? 0`, so text and break units advance the stream while
 * atom/boundary/empty-syntax units do not.
 */

export type SelectionNodeId = string;

export interface SelectionPoint {
  nodeId: SelectionNodeId;
  /**
   * Optional direct unit hit. When present and resolvable it wins over the
   * `nodeId` walk, letting callers target a specific unit that shares a nodeId
   * with siblings (for example a content unit vs. its trailing break).
   */
  unitId?: SelectionNodeId;
  offset: number;
  /** Reserved for boundary bias; currently not consumed by the resolver. */
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

/**
 * Per-format serialization override. A unit may expose any subset; the
 * serializer falls back to the plain `text` for missing text-unit formats.
 */
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
  /** Globally unique id for this unit. */
  unitId: SelectionNodeId;
  /** Owning AST node id; may be shared by several units. */
  nodeId: SelectionNodeId;
  text: string;
  node: SupramarkNode;
  payload?: SelectionPayload;
  sourceRange?: SelectionSourceRange;
}

export interface SelectionBreakUnit {
  kind: 'break';
  /** Globally unique id for this unit. */
  unitId: SelectionNodeId;
  /** Owning AST node id; may be shared by several units. */
  nodeId: SelectionNodeId;
  text: '\n';
  reason: 'block' | 'line' | 'list-item' | 'table-row' | 'custom';
  node?: SupramarkNode;
}

export interface SelectionAtomUnit {
  kind: 'atom';
  /** Globally unique id for this unit. */
  unitId: SelectionNodeId;
  /** Owning AST node id; may be shared by several units. */
  nodeId: SelectionNodeId;
  label: string;
  node: SupramarkNode;
  payload: SelectionPayload;
}

export interface SelectionBoundaryUnit {
  kind: 'boundary';
  /** Globally unique id for this unit. */
  unitId: SelectionNodeId;
  /** Owning AST node id; may be shared by several units. */
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
