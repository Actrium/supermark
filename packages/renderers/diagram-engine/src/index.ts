export { DiagramEngine } from './engine.js';
export type {
  DiagramEngineType,
  DiagramRenderRequest,
  DiagramRenderFormat,
  DiagramErrorInfo,
  DiagramRenderResult,
  DiagramRenderService,
  DiagramEngineOptions,
} from './types.js';

import { DiagramEngine } from './engine.js';
import type { DiagramEngineOptions } from './types.js';

export function createDiagramEngine(options?: DiagramEngineOptions): DiagramEngine {
  return new DiagramEngine(options);
}
