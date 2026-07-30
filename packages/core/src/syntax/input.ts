import type { SupramarkParentNode } from '../ast.js';
import type { SupramarkConfig } from '../feature.js';

export interface SupramarkInputToken {
  type?: string;
  info?: string;
  map?: [number, number] | number[] | null;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Input syntax processing context.
 *
 * Scanning for %%% input in AST v2 has moved to the Rust `supramark-markdown` crate.
 * This context is kept only so old feature runtimes still compile, and for
 * post-processing migration use.
 */
export interface InputProcessorContext {
  config?: SupramarkConfig;
  sourceLines: string[];
  stack: SupramarkParentNode[];
}

export interface InputHookContext extends InputProcessorContext {
  token: SupramarkInputToken;
  name: string;
  phase: 'open' | 'close';
}

export interface InputHook {
  /** The input block name, corresponding to `name` in %%%name. */
  name: string;

  /** A legacy field; AST v2 expresses transparent/opaque via the node's `mode`. */
  opaque?: boolean;

  onOpen: (ctx: InputHookContext) => void;
  onClose?: (ctx: InputHookContext) => void;
}

const customInputHooks: InputHook[] = [];

export function registerInputHook(hook: InputHook): void {
  const existingIndex = customInputHooks.findIndex(existing => existing.name === hook.name);
  if (existingIndex >= 0) {
    customInputHooks[existingIndex] = hook;
    return;
  }
  customInputHooks.push(hook);
}

export function getRegisteredInputHooks(): readonly InputHook[] {
  return customInputHooks;
}

/**
 * @deprecated Markdown token registration was removed in AST v2.
 */
export function registerInputSyntax(_parser: unknown, _config?: SupramarkConfig): void {
  // AST v2 inputs are scanned by supramark-markdown.
}

/**
 * @deprecated Token processors are no longer part of the public parser path.
 */
export function createInputProcessor(
  _context: InputProcessorContext
): (_token: SupramarkInputToken) => boolean {
  return () => false;
}

/**
 * Extract the input block's raw inner text from legacy token.map information.
 */
export function extractInputInnerText(token: SupramarkInputToken, sourceLines: string[]): string {
  if (!Array.isArray(token.map) || token.map.length !== 2) {
    return '';
  }
  const [start, end] = token.map;
  if (typeof start !== 'number' || typeof end !== 'number') {
    return '';
  }
  const innerStart = start + 1;
  const innerEnd = end - 1 > innerStart ? end - 1 : end;
  return sourceLines.slice(innerStart, innerEnd).join('\n');
}
