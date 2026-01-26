/**
 * Core Markdown Feature
 *
 * @packageDocumentation
 */

export {
  coreMarkdownFeature,
  type CoreMarkdownFeatureOptions,
  type CoreMarkdownFeatureConfig,
  createCoreMarkdownFeatureConfig,
  getCoreMarkdownFeatureOptions,
} from './feature.js';
export { coreMarkdownExamples } from './examples.js';

// 重新导出所有基础 Markdown 节点类型（方便用户使用）
export type {
  // Root
  SupramarkRootNode,

  // Block-level nodes
  SupramarkParagraphNode,
  SupramarkHeadingNode,
  SupramarkCodeNode,
  SupramarkListNode,
  SupramarkListItemNode,
  SupramarkBlockquoteNode,
  SupramarkThematicBreakNode,

  // Inline-level nodes
  SupramarkTextNode,
  SupramarkStrongNode,
  SupramarkEmphasisNode,
  SupramarkInlineCodeNode,
  SupramarkLinkNode,
  SupramarkImageNode,
  SupramarkBreakNode,

  // Base types
  SupramarkNode,
  SupramarkParentNode,
  SupramarkBaseNode,

  // Position types
  Position,
  Point,
} from '@supramark/core';
