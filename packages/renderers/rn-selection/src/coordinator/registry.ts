import type { SelectionNodeId, SelectionUnit } from '../model';
import { buildUnitIndex, type SelectionUnitIndex } from '../resolve';
import type { TextSegmentHandle } from '../nativePrimitive';

/** A block's laid-out box in the `SelectionRoot`'s coordinate space. */
export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Optional, injectable per-block character mapping: a segment-local point maps
 * to a segment-local UTF-16 offset. Real device text metrics are deferred; the
 * coordinator falls back to before/after when a block supplies no measure. Kept
 * pure so tests can inject fakes.
 */
export interface SegmentMeasure {
  localOffsetAt(localX: number, localY: number): number;
}

/**
 * A rendered document block registered upward into the registry. `handle` and
 * `measure` are present only for native text segments; atoms/boundaries carry
 * neither.
 */
export interface RegisteredBlock {
  nodeId: SelectionNodeId;
  unitIds: readonly SelectionNodeId[];
  kind: 'text' | 'atom' | 'boundary';
  rect?: LayoutRect;
  handle?: TextSegmentHandle;
  measure?: SegmentMeasure;
}

export type RegistryChange = 'register' | 'unregister' | 'layout';

/** Blocks whose units are absent from the index sort after every indexed one. */
const ORDER_LAST = Number.MAX_SAFE_INTEGER;

/**
 * Document-order key for a block: the smallest linearized-unit index across the
 * block's units. Units missing from the index contribute `ORDER_LAST` so a block
 * built only of unknown ids sorts last. Exported for tests.
 */
export function orderKey(block: RegisteredBlock, index: SelectionUnitIndex): number {
  let min = ORDER_LAST;
  for (const unitId of block.unitIds) {
    const idx = index.byUnitId.get(unitId);
    if (idx !== undefined && idx < min) min = idx;
  }
  return min;
}

/**
 * Pure, React-free registry of rendered blocks. Owns block layout plus a
 * document-ordered iteration derived from the linearized unit stream (NOT
 * registration order). Streaming markdown updates re-index via `setUnits`.
 */
export class SelectionRegistry {
  private _index: SelectionUnitIndex;
  private blocks = new Map<SelectionNodeId, RegisteredBlock>();
  private listeners = new Set<(change: RegistryChange, nodeId: SelectionNodeId) => void>();
  private orderCache: RegisteredBlock[] | null = null;
  private unitToNode: Map<SelectionNodeId, SelectionNodeId> | null = null;

  constructor(units: readonly SelectionUnit[]) {
    this._index = buildUnitIndex(units);
  }

  /** The current unit index; rebuilt by `setUnits`, read externally only. */
  get index(): SelectionUnitIndex {
    return this._index;
  }

  /**
   * Rebuild the index for a new unit stream (streaming markdown). Registered
   * blocks are kept; the document-order cache is invalidated because unit
   * positions may have shifted. The unitId -> nodeId map is derived from block
   * registrations, not units, so it stays valid.
   */
  setUnits(units: readonly SelectionUnit[]): void {
    this._index = buildUnitIndex(units);
    this.orderCache = null;
  }

  register(block: RegisteredBlock): void {
    this.blocks.set(block.nodeId, block);
    this.orderCache = null;
    this.unitToNode = null;
    this.notify('register', block.nodeId);
  }

  unregister(nodeId: SelectionNodeId): void {
    if (!this.blocks.delete(nodeId)) return;
    this.orderCache = null;
    this.unitToNode = null;
    this.notify('unregister', nodeId);
  }

  updateLayout(nodeId: SelectionNodeId, rect: LayoutRect): void {
    const block = this.blocks.get(nodeId);
    if (!block) return;
    block.rect = rect;
    this.notify('layout', nodeId);
  }

  getBlock(nodeId: SelectionNodeId): RegisteredBlock | undefined {
    return this.blocks.get(nodeId);
  }

  getBlockForUnit(unitId: SelectionNodeId): RegisteredBlock | undefined {
    if (!this.unitToNode) {
      this.unitToNode = new Map();
      for (const block of this.blocks.values()) {
        for (const id of block.unitIds) this.unitToNode.set(id, block.nodeId);
      }
    }
    const nodeId = this.unitToNode.get(unitId);
    return nodeId === undefined ? undefined : this.blocks.get(nodeId);
  }

  /**
   * Registered blocks in document order (by `orderKey`), cached until the block
   * set or index changes.
   */
  getBlocks(): RegisteredBlock[] {
    if (this.orderCache) return this.orderCache;
    const sorted = [...this.blocks.values()].sort(
      (a, b) => orderKey(a, this._index) - orderKey(b, this._index)
    );
    this.orderCache = sorted;
    return sorted;
  }

  subscribe(listener: (change: RegistryChange, nodeId: SelectionNodeId) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(change: RegistryChange, nodeId: SelectionNodeId): void {
    for (const listener of this.listeners) listener(change, nodeId);
  }
}
