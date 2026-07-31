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

// Re-export core types (for user convenience)
export type {
  SupramarkTableNode,
  SupramarkTableRowNode,
  SupramarkTableCellNode,
  SupramarkDeleteNode,
  SupramarkListItemNode,
} from '@supramark/core';
