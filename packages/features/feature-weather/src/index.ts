/**
 * Weather Feature
 *
 * 天气卡片容器，支持 JSON/YAML/TOML 配置格式
 *
 * @packageDocumentation
 */

// Feature 定义（主导出）
export {
  weatherFeature,
  WEATHER_CONTAINER_NAMES,
  type WeatherContainerName,
  type WeatherConfigFormat,
  type WeatherData,
} from './feature.js';

// 示例
export { weatherExamples } from './examples.js';

// 渲染器（供 registry 使用）
export { renderWeatherContainerWeb } from './runtime.web.js';
export { renderWeatherContainerRN } from './runtime.rn.js';
