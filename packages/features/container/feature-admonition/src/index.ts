/**
 * Admonition Feature
 *
 * @packageDocumentation
 */

export {
  admonitionFeature,
  type AdmonitionFeatureOptions,
  type AdmonitionFeatureConfig,
  createAdmonitionFeatureConfig,
  getAdmonitionFeatureOptions,
} from './feature.js';
export { admonitionExamples } from './examples.js';

// 重新导出核心类型（方便用户使用）
export type {
  SupramarkAdmonitionNode,
  SupramarkAdmonitionKind,
  SUPRAMARK_ADMONITION_KINDS,
} from '@supramark/core';
