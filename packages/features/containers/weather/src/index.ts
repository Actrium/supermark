/**
 * Weather Feature
 *
 * A weather card container, supporting JSON/YAML/TOML config formats
 *
 * @packageDocumentation
 */

// Feature definition (main export)
export {
  weatherFeature,
  WEATHER_CONTAINER_NAMES,
  type WeatherContainerName,
  type WeatherConfigFormat,
  type WeatherData,
} from './feature.js';

// Examples
export { weatherExamples } from './examples.js';

// Renderers (for the registry to use)
export { renderWeatherContainerWeb } from './runtime.web.js';
export { renderWeatherContainerRN } from './runtime.rn.js';
