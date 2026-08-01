import React from 'react';
import { StyleSheet, View } from 'react-native';
import { computeHandles, HANDLE_KNOB_RADIUS } from './handles';
import { useSelectionRects } from './SelectionOverlay';

export interface SelectionHandlesProps {
  color?: string; // default '#3399ff'
  zIndex?: number; // default 11
  /** Width of the vertical caret bar at each selection edge. */
  barWidth?: number;
}

/**
 * The two drag handles at the ends of the selection.
 *
 * These used to be drawn by UIKit / Android as a side effect of pushing a range
 * into a native text view, which is also why they only ever appeared for
 * single-block selections. Drawn here they look the same on both platforms and
 * work across blocks.
 *
 * `pointerEvents="none"`: the handles are painted here but *grabbed* on
 * `SelectionRoot`, which hit-tests them against the same geometry
 * (`hitTestHandle`) with a much larger touch radius than the drawn knob. Making
 * these views touchable instead would put a ~12pt target on screen and would
 * take the touch away from the root before the gesture machine sees it.
 */
export const SelectionHandles: React.FC<SelectionHandlesProps> = ({
  color = '#3399ff',
  zIndex = 11,
  barWidth = 2,
}) => {
  const rects = useSelectionRects();
  const handles = computeHandles(rects);
  if (handles === null) return null;

  const diameter = HANDLE_KNOB_RADIUS * 2;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex }]}>
      {[handles.start, handles.end].map(handle => (
        <React.Fragment key={handle.edge}>
          <View
            style={{
              position: 'absolute',
              left: handle.x - barWidth / 2,
              top: handle.y,
              width: barWidth,
              height: handle.h,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: handle.knobX - HANDLE_KNOB_RADIUS,
              top: handle.knobY - HANDLE_KNOB_RADIUS,
              width: diameter,
              height: diameter,
              borderRadius: HANDLE_KNOB_RADIUS,
              backgroundColor: color,
            }}
          />
        </React.Fragment>
      ))}
    </View>
  );
};
