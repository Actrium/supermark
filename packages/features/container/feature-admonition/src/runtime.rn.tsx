import React from 'react';
import { View, Text } from 'react-native';
import type { SupramarkConfig } from '@supramark/core';

export interface RNContainerRenderArgs {
  node: any;
  key: number;
  styles: any;
  config?: SupramarkConfig;
  renderChildren: (children: any[]) => React.ReactNode;
}

export function renderAdmonitionContainerRN({
  node,
  key,
  styles,
  config,
  renderChildren,
}: RNContainerRenderArgs): React.ReactNode {
  const title = node?.data?.title;

  const isEnabled = !config || !config.features || config.features.length === 0
    ? true
    : (config.features.find((f: any) => f.id === '@supramark/feature-admonition')?.enabled ?? true);

  if (!isEnabled) {
    return (
      <View key={key} style={styles.listItem}>
        {title ? <Text style={styles.listItemText}>{title}</Text> : null}
        <Text style={styles.listItemText}>{renderChildren(node.children ?? [])}</Text>
      </View>
    );
  }

  return (
    <View key={key} style={styles.listItem}>
      {title ? (
        <Text style={[styles.listItemText, { fontWeight: '600' }]}>{title}</Text>
      ) : null}
      <Text style={styles.listItemText}>{renderChildren(node.children ?? [])}</Text>
    </View>
  );
}

