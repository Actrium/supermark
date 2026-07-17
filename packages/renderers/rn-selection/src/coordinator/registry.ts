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

export type RegistryChange = 'register' | 'unregister' | 'layout' | 'units';

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
  private _version = 0;

  constructor(units: readonly SelectionUnit[]) {
    this._index = buildUnitIndex(units);
  }

  /** The current unit index; rebuilt by `setUnits`, read externally only. */
  get index(): SelectionUnitIndex {
    return this._index;
  }

  /**
   * Monotonic revision bumped on every mutation notification. A React overlay
   * subscribes to `subscribe` and reads this as its `useSyncExternalStore`
   * snapshot so that layout/unit changes (which do NOT change the `getBlocks`
   * array reference) still trigger a repaint. Arrow property so it can be passed
   * as a bare `getSnapshot` without losing `this`.
   */
  getVersion = (): number => this._version;

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
    // Preserve a previously measured rect when a re-registration carries none.
    // A React block re-registers (effect cleanup + re-run) with no rect while
    // its `onLayout` does not re-fire on an unchanged layout; without this the
    // measured box would be lost and the overlay/hit-test would go blank.
    const existing = this.blocks.get(block.nodeId);
    const next =
      existing?.rect !== undefined && block.rect === undefined
        ? { ...block, rect: existing.rect }
        : block;
    this.blocks.set(block.nodeId, next);
    this.orderCache = null;
    this.unitToNode = null;
    this.notify('register', block.nodeId);
  }

  /**
   * Replace a registered block's `unitIds` in place, preserving its measured
   * `rect` and native `handle`. Used when a block keeps its `nodeId` but its
   * unit stream grows (streaming markdown); re-registering instead would drop
   * the rect between unregister and register.
   */
  updateUnits(nodeId: SelectionNodeId, unitIds: readonly SelectionNodeId[]): void {
    const block = this.blocks.get(nodeId);
    if (!block) return;
    block.unitIds = unitIds;
    this.orderCache = null;
    this.unitToNode = null;
    this.notify('units', nodeId);
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
    this._version++;
    for (const listener of this.listeners) listener(change, nodeId);
  }
}
