import React, { useEffect, useRef } from 'react';
import {
  Text,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextLayoutEventData,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { buildTextMetrics, type SegmentTextMetrics } from '../metrics';
import type { SelectionNodeId } from '../model';
import type { ContentOffset, LayoutRect } from './registry';
import { useSelectionContext } from './useDocumentSelection';

declare const __DEV__: boolean | undefined;

/**
 * Concatenated string content of a React subtree. Only literal string/number
 * leaves count — which is exactly the invariant we are checking, since those
 * are what the text engine will lay out as plain text.
 */
function flattenRenderedText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenRenderedText).join('');
  if (React.isValidElement(node)) {
    const { children } = node.props as { children?: React.ReactNode };
    return flattenRenderedText(children);
  }
  return '';
}

export interface SelectableBlockProps {
  nodeId: SelectionNodeId;
  /**
   * VISIBLE text unit ids only — exclude the trailing block break, which the
   * document stream owns, not this block's text. Their concatenated text must
   * equal the plain text this block renders.
   *
   * This is load-bearing: every offset in this block's line metrics is an index
   * into the text the block laid out, and every offset we resolve back to the
   * document is computed from these units' lengths. If the two disagree by even
   * one character — a rendered bullet, a heading mark, collapsed whitespace —
   * every offset past that point is wrong. The `__DEV__` check below compares
   * both the rendered subtree and the measured line table against the units.
   */
  unitIds: readonly SelectionNodeId[];
  /** The text subtree; its concatenated plain text MUST equal the units' text. */
  children?: React.ReactNode;
  /** Text styling. Put box styling (padding, background) on `containerStyle`. */
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * One selectable text block.
 *
 * It renders a plain React Native `<Text>` — no native selection component.
 * With the selection UI self-drawn (see `SELECTION_PLAN.md`), the only thing
 * this block owes the coordinator is geometry, and `onTextLayout` supplies it:
 * one entry per laid-out line, as public RN API on both platforms, on Paper and
 * Fabric alike. That is what removed the vendored native dependency, its
 * Fabric-only / Android >= 0.85 floors, and the second selection state that
 * used to live inside it.
 *
 * Two measurements are published upward:
 *
 * - `onLayout` on the wrapper triggers a native measurement against
 *   `SelectionRoot`, so nested parents such as FlatList cells do not leak their
 *   local coordinate space into the registry;
 * - `onLayout` on the `<Text>` gives the content offset inside it, so padding
 *   on `containerStyle` does not shift every highlight rectangle.
 */
export const SelectableBlock: React.FC<SelectableBlockProps> = ({
  nodeId,
  unitIds,
  children,
  style,
  containerStyle,
}) => {
  const ctx = useSelectionContext();
  const blockRef = useRef<View | null>(null);
  const layoutRef = useRef<LayoutRect | null>(null);
  const metricsRef = useRef<SegmentTextMetrics | null>(null);
  const contentOffsetRef = useRef<ContentOffset | null>(null);

  // Latest unitIds, read by the mount effect so its initial registration is not
  // frozen to the first render's value.
  const unitIdsRef = useRef(unitIds);
  unitIdsRef.current = unitIds;

  useEffect(() => {
    const dispose = ctx.registerBlock({
      nodeId,
      unitIds: [...unitIdsRef.current],
      kind: 'text',
      rect: layoutRef.current ?? undefined,
      metrics: metricsRef.current ?? undefined,
      contentOffset: contentOffsetRef.current ?? undefined,
    });
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, nodeId]);

  // Push unitId changes in place (streaming markdown grows a paragraph) without
  // re-registering, so the measured rect and line table survive. Keyed on the
  // unit contents, not identity, so a fresh array with equal ids is a no-op.
  const unitIdsKey = unitIds.join(' ');
  useEffect(() => {
    ctx.updateUnits(nodeId, [...unitIdsRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, nodeId, unitIdsKey]);

  // Dev-only guard for the props invariant: summed unit text length must equal
  // the string content this block renders. Runs after every content change, so
  // a host that renders a marker or collapses whitespace inside the block hears
  // about it at the point of the mistake rather than through mysteriously
  // off-by-N selections later. Silent in production.
  const renderedText = flattenRenderedText(children);
  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    const index = ctx.registry.index;
    let expected = 0;
    let allKnown = true;
    for (const unitId of unitIds) {
      const at = index.byUnitId.get(unitId);
      if (at === undefined) {
        // A unit not yet in the stream: the block re-rendered before the root's
        // `setUnits` effect. Nothing to compare against, so skip this pass.
        allKnown = false;
        break;
      }
      expected += index.entries[at].textLength;
    }
    if (!allKnown || expected === renderedText.length) return;
    console.warn(
      `[supramark] SelectableBlock "${nodeId}": unitIds sum to ${expected} UTF-16 units ` +
        `but the block renders ${renderedText.length} (${JSON.stringify(renderedText.slice(0, 40))}). ` +
        'Selection offsets will be wrong past the first divergence. ' +
        "The children must render exactly the units' concatenated text — no markers, " +
        'no extra whitespace, no text from nodes outside unitIds.'
    );
  }, [ctx, nodeId, unitIdsKey, renderedText, unitIds]);

  const onBlockLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    const fallback = { x, y, w: width, h: height };
    layoutRef.current = fallback;
    ctx.updateLayout(nodeId, fallback);
    if (ctx.measureLayout) {
      ctx.measureLayout(nodeId, blockRef.current, fallback);
    }
  };

  const onTextBoxLayout = (e: LayoutChangeEvent) => {
    const { x, y } = e.nativeEvent.layout;
    const offset = { x, y };
    contentOffsetRef.current = offset;
    ctx.setContentOffset(nodeId, offset);
  };

  const onTextLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    const metrics = buildTextMetrics(e.nativeEvent.lines);
    metricsRef.current = metrics;
    ctx.setMetrics(nodeId, metrics);
  };

  return (
    <View ref={blockRef} collapsable={false} style={containerStyle} onLayout={onBlockLayout}>
      <Text style={style} onLayout={onTextBoxLayout} onTextLayout={onTextLayout}>
        {/* Cast: react-native resolves its own copy of @types/react, whose
            ReactNode differs from ours by `bigint`. Structurally identical for
            everything a text block can hold. */}
        {children as React.ComponentProps<typeof Text>['children']}
      </Text>
    </View>
  );
};
