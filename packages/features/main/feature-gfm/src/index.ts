/**
 * GFM Feature
 *
 * @packageDocumentation
 */

export {
  gfmFeature,
  type GFMFeatureOptions,
  type GFMFeatureConfig,
  createGFMFeatureConfig,
  // Compatibility alias for docs/examples using camelCase 'Gfm'
  createGfmFeatureConfig,
  getGFMFeatureOptions,
} from './feature.js';
export { gfmExamples } from './examples.js';

// 重新导出核心类型（方便用户使用）
export type {
  SupramarkTableNode,
  SupramarkTableRowNode,
  SupramarkTableCellNode,
  SupramarkDeleteNode,
  SupramarkListItemNode,
} from '@supramark/core';
