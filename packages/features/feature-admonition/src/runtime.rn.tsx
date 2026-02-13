/**
 * Admonition React Native 渲染器
 *
 * 实现 ContainerRNRenderer 接口
 *
 * @packageDocumentation
 */

import React from 'react';
import { View, Text } from 'react-native';
import type { ContainerRNRenderArgs } from '@supramark/core';

/**
 * RN 渲染器 for :::note, :::tip, :::warning 等
 */
export function renderAdmonitionContainerRN({
  node,
  key,
  styles,
  config,
  renderChildren,
}: ContainerRNRenderArgs): React.ReactNode {
  const title = node?.data?.title;

  // Feature enable 检查：如果禁用，退化为普通样式
  const isEnabled =
    !config || !config.features || config.features.length === 0
      ? true
      : (config.features.find((f: any) => f.id === '@supramark/feature-admonition')?.enabled ??
        true);

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
      {title ? <Text style={[styles.listItemText, { fontWeight: '600' }]}>{title}</Text> : null}
      <Text style={styles.listItemText}>{renderChildren(node.children ?? [])}</Text>
    </View>
  );
}
