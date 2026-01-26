/**
 * Map Feature
 *
 * @packageDocumentation
 */

export {
  mapFeature,
  type MapFeatureOptions,
  type MapFeatureConfig,
  createMapFeatureConfig,
  getMapFeatureOptions,
} from './feature.js';
export { mapExamples } from './examples.js';

// 运行时：注册 :::map 容器 hook
import './runtime.js';
