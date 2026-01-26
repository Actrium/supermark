/**
 * Container parser registration entry.
 *
 * The actual parser for `:::weather` is registered by importing `runtime.ts`.
 * This module exists so the registry generator can call a stable exported function.
 */

import './runtime.js';

export function registerWeatherContainerParser(): void {
  // runtime.ts registers the container hook as a side-effect.
}
