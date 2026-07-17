import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import type { SelectionRange, SelectionUnit } from '../model';
import { buildSegmentSpans } from '../native/segmentAdapter';
import type { SelectionSerializeFormat } from '../serialize';
import { SelectionContext, type SelectionContextValue } from './SelectionContext';
import { createBlockSink, type SelectionCopyRequest } from './blockSink';
import { resolvePointToSelection, type Point } from './hitTest';
import { SelectionRegistry } from './registry';
import { SelectionOverlay } from './SelectionOverlay';
import { createSelectionStore } from './state';

export interface SelectionRootProps {
  units: readonly SelectionUnit[];
  children?: React.ReactNode;
  onSelectionChange?(range: SelectionRange | null): void;
  onCopy?(request: SelectionCopyRequest): void;
  formatForAction?(id: string): SelectionSerializeFormat;
  overlay?: boolean;
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
  onCopy,
  formatForAction,
  overlay,
}) => {
  // Latest units are read lazily by the store so streaming updates are visible.
  const unitsRef = useRef(units);
  unitsRef.current = units;

  const registry = useMemo(() => new SelectionRegistry(unitsRef.current), []);
  const store = useMemo(() => createSelectionStore(() => unitsRef.current), []);

  // Host callbacks are read through refs so `ctx` stays reference-stable even
  // when the host passes fresh inline `onCopy` / `formatForAction` identities on
  // every render. A churning `ctx` would re-run every block's registration
  // effect (unregister + re-register), which previously wiped measured rects and
  // blanked the overlay/hit-test.
  const onCopyRef = useRef(onCopy);
  onCopyRef.current = onCopy;
  const formatForActionRef = useRef(formatForAction);
  formatForActionRef.current = formatForAction;

  // Re-index when the unit stream changes (streaming markdown).
  useEffect(() => {
    registry.setUnits(units);
  }, [registry, units]);

  // Surface range changes; covered units live on the store snapshot.
  useEffect(() => {
    if (!onSelectionChange) return undefined;
    return store.subscribe(() => onSelectionChange(store.getSnapshot().range));
  }, [store, onSelectionChange]);

  // Reference-stable: depends only on the memoized registry + store. The overlay
  // subscribes to both the store (selection changes) and the registry version
  // (layout / unit changes), so it repaints on either.
  const ctx = useMemo<SelectionContextValue>(
    () => ({
      registry,
      store,
      registerBlock: block => {
        registry.register(block);
        return () => registry.unregister(block.nodeId);
      },
      updateLayout: (nodeId, rect) => registry.updateLayout(nodeId, rect),
      updateUnits: (nodeId, unitIds) => registry.updateUnits(nodeId, unitIds),
      // Per-block routing: each sink is bound to one block's nodeId via closures
      // over its spans/units, closing the "events carry no nodeId" gap.
      createBlockSink: nodeId =>
        createBlockSink({
          getSpans: () => {
            const b = registry.getBlock(nodeId);
            return b ? buildSegmentSpans(b, registry.index) : [];
          },
          getUnits: () => unitsRef.current,
          store,
          onCopy: req => onCopyRef.current?.(req),
          formatForAction: id => formatForActionRef.current?.(id) ?? 'plainText',
        }),
    }),
    [registry, store]
  );

  return (
    <View>
      <SelectionContext.Provider value={ctx}>
        {children}
        {overlay !== false && <SelectionOverlay />}
      </SelectionContext.Provider>
    </View>
  );
};
