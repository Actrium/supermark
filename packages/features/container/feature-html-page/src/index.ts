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

// 运行时：注册 :::html 容器 hook
import './runtime.js';
