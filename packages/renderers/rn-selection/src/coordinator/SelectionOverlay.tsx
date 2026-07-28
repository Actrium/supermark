import React, { useCallback, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { computeOverlayRects } from './overlay';
import { useSelectionContext } from './useDocumentSelection';

export interface SelectionOverlayProps {
  color?: string; // default 'rgba(51,153,255,0.35)'
  zIndex?: number; // default 10
}

/**
 * Paints the current selection as block-level highlight rectangles (registry
 * layout rects merged vertically). Non-interactive (`pointerEvents="none"`) so
 * it never intercepts touches. Text-precision highlight awaits a native
 * selection-rects read command; none exists yet.
 */
export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  color = 'rgba(51,153,255,0.35)',
  zIndex = 10,
}) => {
  const { registry, store, nativePushed } = useSelectionContext();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // Also track the registry: layout / unit / (un)register changes do NOT alter
  // the `getBlocks()` array reference, so without this the overlay would keep
  // painting at stale coordinates (or blank) after a reflow while a selection is
  // active. The version bumps on every registry mutation, forcing a repaint.
  const subscribeRegistry = useCallback(
    (cb: () => void) => registry.subscribe(() => cb()),
    [registry]
  );
  useSyncExternalStore(subscribeRegistry, registry.getVersion, registry.getVersion);
  // Yield for the block the native bridge has taken over (single-block commit):
  // let the native selection (system handles + edit menu) paint alone instead of
  // stacking a full-width block rect underneath. Null for cross-block ranges,
  // so every covered block paints — those are never pushed native.
  const subscribePushed = useCallback(
    (cb: () => void) => nativePushed.subscribe(cb),
    [nativePushed]
  );
  const yieldNodeId = useSyncExternalStore(
    subscribePushed,
    nativePushed.getPushed,
    nativePushed.getPushed
  );
  const rects = computeOverlayRects(registry.getBlocks(), snapshot.units, undefined, yieldNodeId);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex }]}>
      {rects.map((r, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            backgroundColor: color,
            borderRadius: 2,
          }}
        />
      ))}
    </View>
  );
};
