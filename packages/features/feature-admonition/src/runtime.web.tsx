/**
 * Admonition Web 渲染器
 *
 * 实现 ContainerWebRenderer 接口
 *
 * @packageDocumentation
 */

import React from 'react';
import type { ContainerWebRenderArgs } from '@supramark/core';

/** 每种 kind 对应的配色 */
const kindTheme: Record<string, { border: string; bg: string; color: string; icon: string }> = {
  note: { border: '#448aff', bg: '#e3f2fd', color: '#1565c0', icon: 'ℹ️' },
  tip: { border: '#00c853', bg: '#e8f5e9', color: '#2e7d32', icon: '💡' },
  info: { border: '#448aff', bg: '#e3f2fd', color: '#1565c0', icon: 'ℹ️' },
  warning: { border: '#ff9100', bg: '#fff3e0', color: '#e65100', icon: '⚠️' },
  danger: { border: '#ff1744', bg: '#fce4ec', color: '#b71c1c', icon: '🚨' },
};

const defaultTheme = kindTheme.note;

/**
 * Web 渲染器 for :::note, :::tip, :::warning 等
 */
export function renderAdmonitionContainerWeb({
  node,
  key,
  classNames,
  config,
  renderChildren,
}: ContainerWebRenderArgs): React.ReactNode {
  const kind = node?.data?.kind ?? 'note';
  const title = node?.data?.title;

  // Feature enable 检查：如果禁用，退化为普通段落
  const isEnabled =
    !config || !config.features || config.features.length === 0
      ? true
      : (config.features.find((f: any) => f.id === '@supramark/feature-admonition')?.enabled ??
        true);

  if (!isEnabled) {
    return (
      <p key={key} className={classNames.paragraph}>
        {title ? <strong>{title}</strong> : null}
        {title ? ' ' : null}
        {renderChildren(node.children ?? [])}
      </p>
    );
  }

  const theme = kindTheme[kind] ?? defaultTheme;

  const containerStyle: React.CSSProperties = {
    borderLeft: `4px solid ${theme.border}`,
    background: theme.bg,
    borderRadius: '4px',
    padding: '12px 16px',
    margin: '12px 0',
  };

  const titleStyle: React.CSSProperties = {
    margin: '0 0 8px 0',
    fontWeight: 600,
    color: theme.color,
  };

  return (
    <div key={key} className={`admonition admonition-${kind}`} style={containerStyle}>
      {title ? (
        <p style={titleStyle}>
          {theme.icon} {title}
        </p>
      ) : null}
      <div>{renderChildren(node.children ?? [])}</div>
    </div>
  );
}
