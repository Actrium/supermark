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

// Runtime: register the :::map container hook
import './runtime.js';
