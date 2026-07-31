/**
 * HTML Page Feature
 *
 * @packageDocumentation
 */

export {
  htmlPageFeature,
  type HtmlPageFeatureOptions,
  type HtmlPageFeatureConfig,
  createHtmlPageFeatureConfig,
  getHtmlPageFeatureOptions,
} from './feature.js';
export { htmlPageExamples } from './examples.js';

// Runtime: registers the :::html container hook
import './runtime.js';
