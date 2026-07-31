/**
 * Admonition Web renderer
 *
 * Implements the ContainerWebRenderer interface
 *
 * @packageDocumentation
 */

import React from 'react';
import type { ContainerWebRenderArgs, FeatureConfig } from '@supramark/core';

/**
 * Web renderer for :::note, :::tip, :::warning etc.
 */
export function renderAdmonitionContainerWeb({
  node,
  key,
  classNames,
  config,
  renderChildren,
}: ContainerWebRenderArgs): React.ReactNode {
  const kind = (node?.data?.kind as string | undefined) ?? 'note';
  const title = node?.data?.title as React.ReactNode;

  // Feature enable check: fall back to a plain paragraph when disabled
  const isEnabled =
    !config || !config.features || config.features.length === 0
      ? true
      : (config.features.find((f: FeatureConfig) => f.id === '@supramark/feature-admonition')?.enabled ??
        true);

  if (!isEnabled) {
    return (
      <p key={key} className={classNames.paragraph}>
        {title ? <strong>{title}</strong> : null}
        {title ? ' ' : null}
        {renderChildren(node.children ?? []) as React.ReactNode}
      </p>
    );
  }

  return (
    <div key={key} className={`admonition admonition-${kind} ${classNames.paragraph ?? ''}`.trim()}>
      {title ? (
        <p>
          <strong>{title}</strong>
        </p>
      ) : null}
      <div>{renderChildren(node.children ?? []) as React.ReactNode}</div>
    </div>
  );
}
