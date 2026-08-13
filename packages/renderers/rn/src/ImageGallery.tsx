import React, { useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** Minimum horizontal movement required before the gallery claims a drag gesture. */
const HORIZONTAL_DRAG_THRESHOLD = 6;

export interface ImageGalleryProps {
  /** Stable viewport style; its height should match the configured image container. */
  viewportStyle: StyleProp<ViewStyle>;
  /** Single-row image-track style, including the externally configurable gap. */
  contentStyle: StyleProp<ViewStyle>;
  children: React.ComponentProps<typeof View>['children'];
}

/** Keeps a candidate track offset between its left and right content boundaries. */
function clampTrackOffset(candidate: number, viewportWidth: number, contentWidth: number): number {
  // Content narrower than the viewport has no horizontal range and stays left-aligned.
  if (contentWidth <= viewportWidth) {
    return 0;
  }

  /** Furthest left position that still keeps the track's right edge inside the viewport. */
  const minimumOffset = viewportWidth - contentWidth;
  return Math.max(minimumOffset, Math.min(0, candidate));
}

/** Renders a native image track that only claims explicit horizontal drags. */
export function ImageGallery({
  viewportStyle,
  contentStyle,
  children,
}: ImageGalleryProps): React.ReactElement {
  /** Current measured viewport width used to calculate the track's horizontal boundary. */
  const viewportWidthRef = useRef(0);
  /** Current measured content width used to calculate the track's horizontal boundary. */
  const contentWidthRef = useRef(0);
  /** Committed horizontal offset retained between separate drag gestures. */
  const offsetRef = useRef(0);
  /** Horizontal offset captured when the current drag begins. */
  const dragStartOffsetRef = useRef(0);
  /** Animated transform value so dragging updates the track without rerendering every image. */
  const translateXRef = useRef(new Animated.Value(0));

  /** Applies a bounded offset to both the retained model and the animated track. */
  const applyTrackOffset = useCallback((candidate: number) => {
    /** Offset after enforcing the currently measured content boundaries. */
    const nextOffset = clampTrackOffset(
      candidate,
      viewportWidthRef.current,
      contentWidthRef.current
    );
    offsetRef.current = nextOffset;
    translateXRef.current.setValue(nextOffset);
  }, []);

  /** Recomputes the right boundary whenever the gallery viewport changes width. */
  const handleViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportWidthRef.current = event.nativeEvent.layout.width;
      applyTrackOffset(offsetRef.current);
    },
    [applyTrackOffset]
  );

  /** Recomputes the right boundary whenever images or their configured sizes change. */
  const handleContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      contentWidthRef.current = event.nativeEvent.layout.width;
      applyTrackOffset(offsetRef.current);
    },
    [applyTrackOffset]
  );

  /** Direction-aware responder that leaves vertical movement to the outer list. */
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => {
          /** Absolute horizontal distance travelled in the current gesture. */
          const horizontalDistance = Math.abs(gesture.dx);
          /** Absolute vertical distance used to reject outer-list scroll gestures. */
          const verticalDistance = Math.abs(gesture.dy);
          return (
            horizontalDistance > HORIZONTAL_DRAG_THRESHOLD && horizontalDistance > verticalDistance
          );
        },
        onPanResponderGrant: () => {
          dragStartOffsetRef.current = offsetRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          applyTrackOffset(dragStartOffsetRef.current + gesture.dx);
        },
        // Once a horizontal drag is claimed, keep its boundary calculations consistent until it ends.
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_event, gesture) => {
          applyTrackOffset(dragStartOffsetRef.current + gesture.dx);
        },
        onPanResponderTerminate: (_event, gesture) => {
          applyTrackOffset(dragStartOffsetRef.current + gesture.dx);
        },
      }),
    [applyTrackOffset]
  );

  return (
    <View style={viewportStyle} onLayout={handleViewportLayout} {...panResponder.panHandlers}>
      <Animated.View style={{ transform: [{ translateX: translateXRef.current }] }}>
        <View onLayout={handleContentLayout} style={contentStyle}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}
