import type { SupramarkParentNode } from '../ast.js';
import type { SupramarkConfig } from '../feature.js';

export interface SupramarkContainerToken {
  type?: string;
  info?: string;
  map?: [number, number] | number[] | null;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Container syntax processing context.
 *
 * Container scanning for AST v2 has moved to the Rust `supramark-markdown` crate.
 * This context is kept only so old feature runtimes still compile, and for
 * post-processing migration use.
 */
export interface ContainerProcessorContext {
  config?: SupramarkConfig;
  sourceLines: string[];
  stack: SupramarkParentNode[];
}

export interface ContainerHookContext extends ContainerProcessorContext {
  token: SupramarkContainerToken;
  name: string;
  phase: 'open' | 'close';
}

export interface ContainerHook {
  /** The container name, corresponding to `name` in :::name. */
  name: string;

  /** A legacy field; AST v2 expresses transparent/opaque via the node's `mode`. */
  opaque?: boolean;

  onOpen: (ctx: ContainerHookContext) => void;
  onClose?: (ctx: ContainerHookContext) => void;
}

const customContainerHooks: ContainerHook[] = [];

export function registerContainerHook(hook: ContainerHook): void {
  const existingIndex = customContainerHooks.findIndex(existing => existing.name === hook.name);
  if (existingIndex >= 0) {
    customContainerHooks[existingIndex] = hook;
    return;
  }
  customContainerHooks.push(hook);
}

export function getRegisteredContainerHooks(): readonly ContainerHook[] {
  return customContainerHooks;
}

/**
 * @deprecated Markdown token registration was removed in AST v2.
 */
export function registerContainerSyntax(_parser: unknown, _config?: SupramarkConfig): void {
  // AST v2 containers are scanned by supramark-markdown.
}

/**
 * @deprecated Token processors are no longer part of the public parser path.
 */
export function createContainerTokenProcessor(
  _context: ContainerProcessorContext
): (_token: SupramarkContainerToken) => boolean {
  return () => false;
}

/**
 * Extract the container's raw inner text from legacy token.map information.
 */
export function extractContainerInnerText(
  token: SupramarkContainerToken,
  sourceLines: string[]
): string {
  if (!Array.isArray(token.map) || token.map.length !== 2) {
    return '';
  }
  const [start, end] = token.map;
  if (typeof start !== 'number' || typeof end !== 'number') {
    return '';
  }
  return sourceLines.slice(start + 1, end).join('\n');
}
