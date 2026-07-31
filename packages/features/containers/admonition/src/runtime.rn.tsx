/**
 * Admonition React Native renderer
 *
 * Implements the ContainerRNRenderer interface
 *
 * @packageDocumentation
 */

import React from 'react';
import { View, Text } from 'react-native';
import type { StyleProp, ViewStyle, TextStyle } from 'react-native';
import type { ContainerRNRenderArgs, FeatureConfig } from '@supramark/core';

// React Native's bundled @types/react differs from the workspace React types
// (e.g. on bigint in ReactNode); derive the node type from Text's own children.
type RNNode = React.ComponentProps<typeof Text>['children'];

/**
 * RN renderer for :::note, :::tip, :::warning etc.
 */
export function renderAdmonitionContainerRN({
  node,
  key,
  styles,
  config,
  renderChildren,
}: ContainerRNRenderArgs): React.ReactNode {
  const title = node?.data?.title as RNNode;
  const viewStyle = styles.listItem as StyleProp<ViewStyle>;
  const textStyle = styles.listItemText as StyleProp<TextStyle>;

  // Feature enable check: fall back to plain styling when disabled
  const isEnabled =
    !config || !config.features || config.features.length === 0
      ? true
      : (config.features.find((f: FeatureConfig) => f.id === '@supramark/feature-admonition')?.enabled ??
        true);

  if (!isEnabled) {
    return (
      <View key={key} style={viewStyle}>
        {title ? <Text style={textStyle}>{title}</Text> : null}
        <Text style={textStyle}>{renderChildren(node.children ?? []) as RNNode}</Text>
      </View>
    );
  }

  return (
    <View key={key} style={viewStyle}>
      {title ? <Text style={[textStyle, { fontWeight: '600' }]}>{title}</Text> : null}
      <Text style={textStyle}>{renderChildren(node.children ?? []) as RNNode}</Text>
    </View>
  );
}
