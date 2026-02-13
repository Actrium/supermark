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

// 重新导出核心类型（方便用户使用）
export type { SupramarkDefinitionListNode, SupramarkDefinitionItemNode } from '@supramark/core';
