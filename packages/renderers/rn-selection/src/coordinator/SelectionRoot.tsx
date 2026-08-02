import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { offsetAtLocalPoint } from '../metrics';
import type { SelectionRange, SelectionUnit } from '../model';
import {
  buildSegmentSpans,
  segmentSelectionToRange,
  segmentTextFromSpans,
} from '../native/segmentAdapter';
import { buildCopyRequest, type SelectionCopyRequest } from './actions';
import { wordBoundsAt } from '../words';
import { SelectionContext, type SelectionContextValue } from './SelectionContext';
import { createSelectionGesture, type SelectionGesture } from './gesture';
import { computeHandles, hitTestHandle, type HandleEdge } from './handles';
import { chooseBlock, resolvePointToSelection, type Point } from './hitTest';
import { computeSelectionRects, type OverlayRect } from './overlay';
import { SelectionRegistry } from './registry';
import { SelectionHandles } from './SelectionHandles';
import { SelectionOverlay, useSelectionRects } from './SelectionOverlay';
import { SelectionToolbar } from './SelectionToolbar';
import { createSelectionStore } from './state';
import { DEFAULT_TOOLBAR_ITEMS, type Size, type SelectionToolbarItem } from './toolbar';
import { useSelectionContext, useSelectionSnapshot } from './useDocumentSelection';

/** What a host `renderToolbar` receives; enough to place and drive its own bar. */
export interface SelectionToolbarRenderProps {
  visible: boolean;
  items: readonly SelectionToolbarItem[];
  /** Current highlight rectangles, in root space — anchor the bar to these. */
  rects: readonly OverlayRect[];
  /** Root-space visible area, for clamping. */
  viewport: Size;
  run(item: SelectionToolbarItem): void;
}

export interface SelectionRootProps {
  units: readonly SelectionUnit[];
  children?: React.ReactNode;
  onSelectionChange?(range: SelectionRange | null): void;
  onCopy?(request: SelectionCopyRequest): void;
  /** Toolbar actions. Defaults to Copy + Copy as Markdown. */
  toolbarItems?: readonly SelectionToolbarItem[];
  /** Replace the built-in bar entirely. */
  renderToolbar?(props: SelectionToolbarRenderProps): React.ReactNode;
  overlay?: boolean;
  handles?: boolean;
  toolbar?: boolean;
  /** Disable the built-in gestures; the host drives the store itself. */
  gestures?: boolean;
  longPressMs?: number;
  moveTolerance?: number;
}

/**
 * Map a root-coordinate point to a document `SelectionPoint` through a registry.
 * Thin so gesture code stays declarative; all logic lives in `hitTest`.
 */
export function pointToSelectionForRoot(registry: SelectionRegistry, point: Point) {
  return resolvePointToSelection(registry.getBlocks(), point, registry.index);
}

/**
 * Owner of the selection: registry, store, gestures, and the three self-drawn
 * layers (highlight, handles, action bar).
 *
 * Everything that used to be split between us and the platform now lives under
 * this component. A long press starts a selection here, a drag extends it here,
 * a handle moves it here, a tap clears it here, and the bar that appears is a
 * React component. The store is the single source of truth throughout — there
 * is no second selection state anywhere in the tree to reconcile with.
 *
 * Touch points are converted to root space through the root's window origin, so
 * they stay correct wherever the root sits on screen. Gesture *wiring* (touch
 * dispatch, responder negotiation with an enclosing ScrollView) is the one part
 * of this layer that only a device can really exercise; the decision-making it
 * feeds is the pure machine in `gesture.ts`.
 */
export const SelectionRoot: React.FC<SelectionRootProps> = ({
  units,
  children,
  onSelectionChange,
  onCopy,
  toolbarItems,
  renderToolbar,
  overlay,
  handles,
  toolbar,
  gestures,
  longPressMs,
  moveTolerance,
}) => {
  // Latest units are read lazily by the store so streaming updates are visible.
  const unitsRef = useRef(units);
  unitsRef.current = units;

  const registry = useMemo(() => new SelectionRegistry(unitsRef.current), []);
  const store = useMemo(() => createSelectionStore(() => unitsRef.current), []);

  // Host callbacks are read through refs so `ctx` stays reference-stable even
  // when the host passes fresh inline identities on every render. A churning
  // `ctx` would re-run every block's registration effect (unregister +
  // re-register), which previously wiped measured rects and blanked the
  // overlay/hit-test.
  const onCopyRef = useRef(onCopy);
  onCopyRef.current = onCopy;

  const items = useMemo(() => toolbarItems ?? DEFAULT_TOOLBAR_ITEMS, [toolbarItems]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const rootRef = useRef<View | null>(null);
  const originRef = useRef<Point>({ x: 0, y: 0 });
  const [viewport, setViewport] = useState<Size>({ w: 0, h: 0 });

  // Re-index when the unit stream changes (streaming markdown).
  useEffect(() => {
    registry.setUnits(units);
  }, [registry, units]);

  // Surface range changes; covered units live on the store snapshot.
  useEffect(() => {
    if (!onSelectionChange) return undefined;
    return store.subscribe(() => onSelectionChange(store.getSnapshot().range));
  }, [store, onSelectionChange]);

  const runToolbarItem = useCallback(
    (item: SelectionToolbarItem) => {
      const snapshot = store.getSnapshot();
      if (snapshot.range === null) return;
      onCopyRef.current?.(buildCopyRequest(item, snapshot.units, snapshot.range));
    },
    [store]
  );

  /** Highlight rectangles as the gesture layer needs them, computed on demand. */
  const currentRects = useCallback((): OverlayRect[] => {
    const snapshot = store.getSnapshot();
    return computeSelectionRects({
      blocks: registry.getBlocks(),
      range: snapshot.range,
      units: snapshot.units,
      index: registry.index,
    });
  }, [registry, store]);

  /**
   * The word under a root-space point, as a document range. A block that has
   * not been measured yet has no notion of words, so a long press on it selects
   * the whole block — coarse, but never nothing.
   */
  const wordAt = useCallback(
    (point: Point): SelectionRange | null => {
      const block = chooseBlock(registry.getBlocks(), point);
      if (block === null || block.rect === undefined) return null;
      const spans = buildSegmentSpans(block, registry.index);
      if (spans.length === 0) return null;
      const wholeBlock = () => segmentSelectionToRange(spans, 0, spans[spans.length - 1].end);

      const metrics = block.metrics;
      if (!metrics || metrics.lines.length === 0) return wholeBlock();

      const origin = block.contentOffset ?? { x: 0, y: 0 };
      const offset = offsetAtLocalPoint(
        metrics,
        point.x - block.rect.x - origin.x,
        point.y - block.rect.y - origin.y
      );
      const bounds = wordBoundsAt(segmentTextFromSpans(registry.index, spans), offset);
      if (bounds.end <= bounds.start) return wholeBlock();
      return segmentSelectionToRange(spans, bounds.start, bounds.end);
    },
    [registry]
  );

  const handleAt = useCallback(
    (point: Point): HandleEdge | null => {
      if (store.getSnapshot().range === null) return null;
      return hitTestHandle(point, computeHandles(currentRects()));
    },
    [currentRects, store]
  );

  const gesture = useMemo<SelectionGesture>(
    () =>
      createSelectionGesture({
        store,
        pointAt: point => resolvePointToSelection(registry.getBlocks(), point, registry.index),
        wordAt,
        handleAt,
        config: { longPressMs, moveTolerance },
      }),
    [store, registry, wordAt, handleAt, longPressMs, moveTolerance]
  );

  // The long-press threshold has to fire while the finger is still, i.e. with
  // no further touch events to hang it off. The gesture machine stays free of
  // timers; this is the one place a real clock enters.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  const refreshRootOrigin = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      originRef.current = { x, y };
    });
  }, []);

  const toRootSpace = useCallback((e: GestureResponderEvent): Point => {
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    if (Number.isFinite(locationX) && Number.isFinite(locationY)) {
      return { x: locationX, y: locationY };
    }
    return { x: pageX - originRef.current.x, y: pageY - originRef.current.y };
  }, []);

  const enabled = gestures !== false;

  const onTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      refreshRootOrigin();
      gesture.touchStart(toRootSpace(e), Date.now());
      clearTimer();
      if (gesture.isPending()) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          gesture.tick(Date.now());
        }, longPressMs ?? undefined);
      }
    },
    [enabled, refreshRootOrigin, gesture, toRootSpace, clearTimer, longPressMs]
  );

  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      refreshRootOrigin();
      gesture.touchMove(toRootSpace(e), Date.now());
      if (!gesture.isPending()) clearTimer();
    },
    [enabled, refreshRootOrigin, gesture, toRootSpace, clearTimer]
  );

  const onTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      refreshRootOrigin();
      clearTimer();
      gesture.touchEnd(toRootSpace(e), Date.now());
    },
    [enabled, refreshRootOrigin, gesture, toRootSpace, clearTimer]
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setViewport(prev => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      refreshRootOrigin();
    },
    [refreshRootOrigin]
  );

  const onStartShouldSetResponder = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return false;
      return gesture.isActive() || handleAt(toRootSpace(e)) !== null;
    },
    [enabled, gesture, handleAt, toRootSpace]
  );

  // Reference-stable: depends only on the memoized registry + store.
  const ctx = useMemo<SelectionContextValue>(
    () => ({
      registry,
      store,
      registerBlock: block => {
        // Capture what was actually stored and hand it back on unregister, so
        // a stale instance's cleanup cannot delete a live registration that
        // reused the same nodeId. See `SelectionRegistry.unregister`.
        const registered = registry.register(block);
        return () => registry.unregister(block.nodeId, registered);
      },
      updateLayout: (nodeId, rect) => registry.updateLayout(nodeId, rect),
      updateUnits: (nodeId, unitIds) => registry.updateUnits(nodeId, unitIds),
      setMetrics: (nodeId, metrics) => registry.setMetrics(nodeId, metrics),
      setContentOffset: (nodeId, offset) => registry.setContentOffset(nodeId, offset),
      get toolbarItems() {
        return itemsRef.current;
      },
      runToolbarItem,
    }),
    [registry, store, runToolbarItem]
  );

  return (
    <View
      ref={rootRef}
      collapsable={false}
      onLayout={onLayout}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => gesture.cancel()}
      // Claim handle grabs immediately: responder negotiation asks before
      // `onTouchStart` drives the gesture machine, so `gesture.isActive()` is
      // still false at the start of a handle drag. Ordinary long-presses remain
      // scroll-friendly until the machine becomes active.
      onStartShouldSetResponder={onStartShouldSetResponder}
      onMoveShouldSetResponder={() => enabled && gesture.isActive()}
      onResponderTerminationRequest={() => !gesture.isActive()}
      onResponderTerminate={() => gesture.cancel()}
    >
      <SelectionContext.Provider value={ctx}>
        {children}
        {overlay !== false && <SelectionOverlay />}
        {handles !== false && <SelectionHandles />}
        {toolbar !== false &&
          (renderToolbar ? (
            <ToolbarSlot viewport={viewport} render={renderToolbar} />
          ) : (
            <SelectionToolbar viewport={viewport} />
          ))}
      </SelectionContext.Provider>
    </View>
  );
};

/**
 * Adapts a host `renderToolbar` to the same subscriptions the built-in bar
 * uses, so a custom bar repaints on exactly the same events. Split out because
 * hooks cannot be called conditionally in `SelectionRoot`.
 */
const ToolbarSlot: React.FC<{
  viewport: Size;
  render(props: SelectionToolbarRenderProps): React.ReactNode;
}> = ({ viewport, render }) => {
  const { store, toolbarItems, runToolbarItem } = useSelectionContext();
  const snapshot = useSelectionSnapshot(store);
  const rects = useSelectionRects();
  return (
    <>
      {render({
        visible: snapshot.phase === 'selected' && rects.length > 0,
        items: toolbarItems,
        rects,
        viewport,
        run: runToolbarItem,
      })}
    </>
  );
};
