/**
 * Admonition Feature definition
 *
 * Implements the ContainerFeature interface, combining metadata, container
 * definition and parser registration.
 *
 * @example
 * ```markdown
 * :::note Tip title
 * This is the content of a tip box
 * :::
 *
 * :::warning Warning
 * Please pay attention to this warning message
 * :::
 * ```
 *
 * @packageDocumentation
 */

import {
  registerContainerHook,
  type ContainerFeature,
  type ContainerHook,
  type ContainerHookContext,
  type SupramarkContainerNode,
} from '@supramark/core';

type ContainerTokenLike = {
  info?: string;
};

// ============================================================================
// Container name definitions (single source of truth)
// ============================================================================

/**
 * Container names supported by Admonition
 *
 * Globally unique, must not clash with other Features.
 */
export const ADMONITION_CONTAINER_NAMES = [
  'note',
  'tip',
  'info',
  'warning',
  'danger',
] as const;

export type AdmonitionKind = (typeof ADMONITION_CONTAINER_NAMES)[number];

// ============================================================================
// Parsing logic
// ============================================================================

function parseTitle(token: ContainerTokenLike, _kind: string): string | undefined {
  const info = (token.info || '').trim();
  // info looks like "note Title...", the first word is the container name (kind)
  const parts = info.split(/\s+/).filter(Boolean);
  const titleParts = parts.length > 1 ? parts.slice(1) : [];
  return titleParts.length > 0 ? titleParts.join(' ') : undefined;
}

function createAdmonitionContainerHook(kind: string): ContainerHook {
  return {
    name: kind,
    opaque: false,
    onOpen(ctx: ContainerHookContext) {
      const title = parseTitle(ctx.token, kind);
      const node: SupramarkContainerNode = {
        type: 'container' as const,
        name: 'admonition',
        params: ctx.token.info ? String(ctx.token.info) : undefined,
        data: {
          kind,
          title,
        },
        children: [],
      };
      const parent = ctx.stack[ctx.stack.length - 1];
      parent.children.push(node);
      ctx.stack.push(node);
    },
    onClose(ctx: ContainerHookContext) {
      const top = ctx.stack[ctx.stack.length - 1] as SupramarkContainerNode;
      if (top && top.type === 'container' && top.name === 'admonition') {
        ctx.stack.pop();
      }
    },
  };
}

/**
 * Register the Admonition parser
 *
 * Registers a parsing hook for every entry in containerNames.
 */
function registerAdmonitionParser(): void {
  for (const kind of ADMONITION_CONTAINER_NAMES) {
    registerContainerHook(createAdmonitionContainerHook(kind));
  }
}

// ============================================================================
// Feature definition (implements the ContainerFeature interface)
// ============================================================================

/**
 * Admonition Feature
 *
 * Tip-box container block syntax support (note/tip/warning etc.)
 */
export const admonitionFeature: ContainerFeature = {
  // Metadata
  id: '@supramark/feature-admonition',
  name: 'Admonition',
  version: '0.1.0',
  description: 'Tip-box container block syntax support (note/tip/warning etc.)',

  // Container definition
  containerNames: [...ADMONITION_CONTAINER_NAMES],

  // Parser registration
  registerParser: registerAdmonitionParser,

  // Renderer export names
  webRendererExport: 'renderAdmonitionContainerWeb',
  rnRendererExport: 'renderAdmonitionContainerRN',
};

// ============================================================================
// Compatibility exports (kept for backward compatibility)
// ============================================================================

/**
 * @deprecated Use admonitionFeature.registerParser() instead
 */
export const registerAdmonitionContainer = registerAdmonitionParser;
