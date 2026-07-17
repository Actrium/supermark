import { createContext } from 'react';
import type { SelectionNodeId } from '../model';
import type { SegmentEventSink } from '../nativePrimitive';
import type { LayoutRect, RegisteredBlock } from './registry';

/**
 * Contract a block component uses to plug itself into the document selection.
 * All real logic lives in `SelectionRegistry`; this context is only wiring.
 */
export interface SelectionContextValue {
  /** Register a block; the returned disposer unregisters it. Call from useEffect. */
  registerBlock(block: RegisteredBlock): () => void;
  updateLayout(nodeId: SelectionNodeId, rect: LayoutRect): void;
  /** Sink the coordinator hands blocks so native events flow up as segment-local payloads. */
  sink: SegmentEventSink;
}

export const SelectionContext = createContext<SelectionContextValue | null>(null);
