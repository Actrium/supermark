/**
 * Footnote Feature
 *
 * @packageDocumentation
 */

export {
  footnoteFeature,
  type FootnoteFeatureOptions,
  type FootnoteFeatureConfig,
  createFootnoteFeatureConfig,
  getFootnoteFeatureOptions,
} from './feature.js';
export { footnoteExamples } from './examples.js';

// Re-export core types (for user convenience)
export type {
  SupramarkFootnoteReferenceNode,
  SupramarkFootnoteDefinitionNode,
} from '@supramark/core';
