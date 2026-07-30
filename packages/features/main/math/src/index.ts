/**
 * Math Feature
 *
 * @packageDocumentation
 */

export {
  mathFeature,
  type MathFeatureOptions,
  type MathFeatureConfig,
  createMathFeatureConfig,
  getMathFeatureOptions,
} from './feature.js';

export { mathExamples } from './examples.js';

// Re-export core types (for user convenience)
export type { SupramarkMathInlineNode, SupramarkMathBlockNode } from '@supramark/core';
