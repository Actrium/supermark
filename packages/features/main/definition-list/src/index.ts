/**
 * Definition List Feature
 *
 * @packageDocumentation
 */

export {
  definitionListFeature,
  type DefinitionListFeatureOptions,
  type DefinitionListFeatureConfig,
  createDefinitionListFeatureConfig,
  getDefinitionListFeatureOptions,
} from './feature.js';
export { definitionListExamples } from './examples.js';

// Re-export core types (for user convenience)
export type { SupramarkDefinitionListNode, SupramarkDefinitionItemNode } from '@supramark/core';
