import { createContext } from 'react';
import type { SelectionNodeId } from '../model';
import type { SegmentEventSink } from '../nativePrimitive';
import type { LayoutRect, RegisteredBlock, SelectionRegistry } from './registry';
import type { SelectionStore } from './state';

/**
 * Contract a block component uses to plug itself into the document selection.
 * All real logic lives in `SelectionRegistry` / `SelectionStore`; this context
 * is only wiring. The registry and store are exposed directly so the overlay
 * and host controls under the root need no prop-drilling; per-block event
 * routing is built through `createBlockSink`.
 */
export interface SelectionContextValue {
  registry: SelectionRegistry;
  store: SelectionStore;
  /** Register a block; the returned disposer unregisters it. Call from useEffect. */
  registerBlock(block: RegisteredBlock): () => void;
  updateLayout(nodeId: SelectionNodeId, rect: LayoutRect): void;
  /** Update a registered block's unit ids in place (streaming markdown growth). */
  updateUnits(nodeId: SelectionNodeId, unitIds: readonly SelectionNodeId[]): void;
  /** Build a per-block event sink bound to this block's nodeId + unit spans. */
  createBlockSink(nodeId: SelectionNodeId): SegmentEventSink;
}

export const SelectionContext = createContext<SelectionContextValue | null>(null);
