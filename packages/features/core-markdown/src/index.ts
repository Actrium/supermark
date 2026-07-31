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

// Re-export all base Markdown node types (for user convenience)
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
