import React, { useEffect, useMemo, useRef } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { SelectionRange, SelectionUnit } from '../model';
import type { SegmentEventSink } from '../nativePrimitive';
import { SelectionContext, type SelectionContextValue } from './SelectionContext';
import { resolvePointToSelection, type Point } from './hitTest';
import { SelectionRegistry } from './registry';
import { createSelectionStore } from './state';

export interface SelectionRootProps {
  units: readonly SelectionUnit[];
  children?: React.ReactNode;
  onSelectionChange?(range: SelectionRange | null): void;
}

/**
 * Map a root-coordinate point to a document `SelectionPoint` through a registry.
 * Thin so gesture code stays declarative; all logic lives in `hitTest`.
 */
export function pointToSelectionForRoot(registry: SelectionRegistry, point: Point) {
  return resolvePointToSelection(registry.getBlocks(), point, registry.index);
}

/**
 * Thin React provider that owns the registry + selection store and exposes a
 * registration context. All real logic lives in `registry` / `hitTest` / `state`
 * / `segmentAdapter`; this component is wiring + typecheck coverage only.
 *
 * Overlay highlight rectangles, drag handles, gesture-responder wiring and
 * auto-scroll are deferred (they need a device); the root only wires block
 * registration, the store, and the hit-test entrypoint.
 */
export const SelectionRoot: React.FC<SelectionRootProps> = ({
  units,
  children,
  onSelectionChange,
}) => {
  // Latest units are read lazily by the store so streaming updates are visible.
  const unitsRef = useRef(units);
  unitsRef.current = units;

  const registry = useMemo(() => new SelectionRegistry(units), []);
  const store = useMemo(() => createSelectionStore(() => unitsRef.current), []);
  // Root origin in window coords; child measures subtract it to reach root space.
  const rootOrigin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Re-index when the unit stream changes (streaming markdown).
  useEffect(() => {
    registry.setUnits(units);
  }, [registry, units]);

  // Surface range changes; covered units live on the store snapshot.
  useEffect(() => {
    if (!onSelectionChange) return undefined;
    return store.subscribe(() => onSelectionChange(store.getSnapshot().range));
  }, [store, onSelectionChange]);

  const ctx = useMemo<SelectionContextValue>(() => {
    // Native events are routed per block at their gesture boundary (where the
    // nodeId is known) via segmentAdapter helpers; that wiring is device-deferred.
    const sink: SegmentEventSink = {};
    return {
      registerBlock: block => {
        registry.register(block);
        return () => registry.unregister(block.nodeId);
      },
      updateLayout: (nodeId, rect) => registry.updateLayout(nodeId, rect),
      sink,
    };
  }, [registry]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { x, y } = event.nativeEvent.layout;
    rootOrigin.current = { x, y };
  };

  return (
    <View onLayout={onLayout}>
      <SelectionContext.Provider value={ctx}>{children}</SelectionContext.Provider>
    </View>
  );
};
