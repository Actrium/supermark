import type { SupramarkFeature } from './feature.js';

/**
 * 预设配置类型
 */
export interface SupramarkPreset {
  name: string;
  description: string;
  features: SupramarkFeature<any>[];
}

/**
 * 助手函数：创建一个预设
 */
export function createPreset(
  name: string,
  description: string,
  features: SupramarkFeature<any>[]
): SupramarkPreset {
  return { name, description, features };
}
