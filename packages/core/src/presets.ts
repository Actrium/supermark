import type { SupramarkFeature } from './feature.js';
import type { SupramarkNode } from './ast.js';

/**
 * The preset configuration type.
 */
export interface SupramarkPreset {
  name: string;
  description: string;
  features: SupramarkFeature<SupramarkNode>[];
}

/**
 * Helper function: create a preset.
 */
export function createPreset(
  name: string,
  description: string,
  features: SupramarkFeature<SupramarkNode>[]
): SupramarkPreset {
  return { name, description, features };
}
