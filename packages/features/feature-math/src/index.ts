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

// 重新导出核心类型（方便用户使用）
export type { SupramarkMathInlineNode, SupramarkMathBlockNode } from '@supramark/core';
