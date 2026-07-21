import type { SupramarkDiagramNode } from './ast.js';

/** Indicates whether the current Markdown source may still receive appended content. */
export type SupramarkSourceState = 'streaming' | 'complete';

/**
 * Defers diagram engine work only while an open fence can still receive streamed content.
 * Complete sources keep CommonMark's EOF auto-close behaviour.
 */
export function shouldDeferDiagramRender(
  node: SupramarkDiagramNode,
  sourceState: SupramarkSourceState
): boolean {
  return sourceState === 'streaming' && !node.fence_closed;
}
