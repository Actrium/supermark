import React from 'react';
import type { SupramarkConfig } from '@supramark/core';

export interface WebContainerRenderArgs {
  node: any;
  key: number;
  classNames: any;
  config?: SupramarkConfig;
  renderChildren: (children: any[]) => React.ReactNode;
}

export function renderAdmonitionContainerWeb({
  node,
  key,
  classNames,
  config,
  renderChildren,
}: WebContainerRenderArgs): React.ReactNode {
  const kind = node?.data?.kind ?? 'note';
  const title = node?.data?.title;

  // 复用原有的 feature enable 逻辑：如果禁用，则退化为普通段落表现
  const isEnabled = !config || !config.features || config.features.length === 0
    ? true
    : (config.features.find((f: any) => f.id === '@supramark/feature-admonition')?.enabled ?? true);

  if (!isEnabled) {
    return (
      <p key={key} className={classNames.paragraph}>
        {title ? <strong>{title}</strong> : null}
        {title ? ' ' : null}
        {renderChildren(node.children ?? [])}
      </p>
    );
  }

  return (
    <div
      key={key}
      className={`admonition admonition-${kind} ${classNames.paragraph ?? ''}`.trim()}
    >
      {title ? <p><strong>{title}</strong></p> : null}
      <div>{renderChildren(node.children ?? [])}</div>
    </div>
  );
}

