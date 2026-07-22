import { beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { SupramarkRootNode } from '@supramark/core';

// react-test-renderer requires the act environment flag to flush effects predictably.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const parserState = {
  calls: 0,
};

// Replace only the Rust parser package boundary so @supramark/core stays unmodified
// and this file cannot leak a core-module mock into other renderer tests.
const markdownParserModule = {
  parse: async (markdown: string): Promise<SupramarkRootNode> => {
    parserState.calls += 1;
    if (markdown === 'diagram document') {
      return {
        type: 'root',
        children: [
          {
            type: 'diagram',
            engine: 'mermaid',
            code: 'graph TD; A-->B;',
            fence_closed: true,
          },
        ],
      };
    }
    return {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: markdown }],
        },
      ],
    };
  },
};
mock.module('@supramark/markdown-web', () => markdownParserModule);
mock.module('@supramark/markdown-web/node', () => markdownParserModule);

// Host component mocks keep this test focused on renderer state transitions.
mock.module('react-native', () => ({
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity',
  ActivityIndicator: 'ActivityIndicator',
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  Linking: { openURL: async () => undefined },
  StyleSheet: { create: (styles: unknown) => styles },
}));

mock.module('react-native-svg', () => ({
  SvgXml: 'SvgXml',
}));

const { Supramark } = await import('../src/Supramark');
const { clearReactNativeRendererCaches } = await import('../src/renderCache');

// Reuse one config identity just like a host-level exported Supramark config.
const enabledCacheConfig = {
  options: {
    cache: true,
  },
  diagram: {
    defaultCache: {
      enabled: true,
      maxSize: 10,
      ttl: 60_000,
    },
  },
};

/** Mounts a Supramark document and waits for its asynchronous parse to settle. */
async function renderDocument(
  markdown: string,
  sourceState: 'streaming' | 'complete',
  config = enabledCacheConfig
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = create(
      React.createElement(Supramark, {
        markdown,
        sourceState,
        config,
      })
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer as unknown as ReactTestRenderer;
}

/** Unmounts a renderer inside act so pending effects are cancelled cleanly. */
async function unmount(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => {
    renderer.unmount();
  });
}

/** Detects Supramark's unstyled raw-Markdown parsing fallback. */
function hasRawMarkdownFallback(renderer: ReactTestRenderer, markdown: string): boolean {
  return renderer.root
    .findAllByType('Text' as never)
    .some(node => node.props.style === undefined && node.children.includes(markdown));
}

describe('Supramark completed-document cache', () => {
  beforeEach(() => {
    clearReactNativeRendererCaches();
    parserState.calls = 0;
  });

  test('restores a completed parsed document synchronously after remount', async () => {
    const markdown = 'cached paragraph';
    const firstRenderer = await renderDocument(markdown, 'complete');
    expect(parserState.calls).toBe(1);
    await unmount(firstRenderer);

    let secondRenderer: ReactTestRenderer | null = null;
    act(() => {
      secondRenderer = create(
        React.createElement(Supramark, {
          markdown,
          sourceState: 'complete',
          config: enabledCacheConfig,
        })
      );
    });

    expect(parserState.calls).toBe(1);
    expect(hasRawMarkdownFallback(secondRenderer as unknown as ReactTestRenderer, markdown)).toBe(
      false
    );
    await unmount(secondRenderer as unknown as ReactTestRenderer);
  });

  test('shares completed documents across equivalent inline config objects', async () => {
    const markdown = 'inline config paragraph';
    const firstRenderer = await renderDocument(markdown, 'complete', {
      options: { cache: true },
    });
    expect(parserState.calls).toBe(1);
    await unmount(firstRenderer);

    let secondRenderer: ReactTestRenderer | null = null;
    act(() => {
      secondRenderer = create(
        React.createElement(Supramark, {
          markdown,
          sourceState: 'complete',
          config: { options: { cache: true } },
        })
      );
    });

    expect(parserState.calls).toBe(1);
    expect(hasRawMarkdownFallback(secondRenderer as unknown as ReactTestRenderer, markdown)).toBe(
      false
    );
    await unmount(secondRenderer as unknown as ReactTestRenderer);
  });

  test('does not cache a streaming document version', async () => {
    const markdown = 'growing paragraph';
    const streamingRenderer = await renderDocument(markdown, 'streaming');
    await unmount(streamingRenderer);

    const completeRenderer = await renderDocument(markdown, 'complete');
    expect(parserState.calls).toBe(2);
    await unmount(completeRenderer);
  });

  test('diagram.defaultCache retains a completed diagram document without enabling global cache', async () => {
    const diagramOnlyCacheConfig = {
      features: [{ id: '@supramark/feature-mermaid', enabled: false }],
      diagram: {
        defaultCache: {
          enabled: true,
          maxSize: 10,
          ttl: 60_000,
        },
      },
    };
    const firstRenderer = await renderDocument(
      'diagram document',
      'complete',
      diagramOnlyCacheConfig
    );
    await unmount(firstRenderer);
    const secondRenderer = await renderDocument(
      'diagram document',
      'complete',
      diagramOnlyCacheConfig
    );

    expect(parserState.calls).toBe(1);
    await unmount(secondRenderer);
  });

  test('an explicit diagram policy still retains diagram documents when global cache is false', async () => {
    const createConfig = () => ({
      options: { cache: false },
      features: [{ id: '@supramark/feature-mermaid', enabled: false }],
      diagram: {
        defaultCache: {
          enabled: true,
          maxSize: 10,
          ttl: 60_000,
        },
      },
    });
    const firstRenderer = await renderDocument('diagram document', 'complete', createConfig());
    await unmount(firstRenderer);
    const secondRenderer = await renderDocument('diagram document', 'complete', createConfig());

    expect(parserState.calls).toBe(1);
    await unmount(secondRenderer);
  });

  test('an enabled engine cache retains its diagram documents when global cache is false', async () => {
    const createConfig = () => ({
      options: { cache: false },
      features: [{ id: '@supramark/feature-mermaid', enabled: false }],
      diagram: {
        engines: {
          mermaid: {
            cache: {
              enabled: true,
              maxSize: 10,
              ttl: 60_000,
            },
          },
        },
      },
    });
    const firstRenderer = await renderDocument('diagram document', 'complete', createConfig());
    await unmount(firstRenderer);
    const secondRenderer = await renderDocument('diagram document', 'complete', createConfig());

    expect(parserState.calls).toBe(1);
    await unmount(secondRenderer);
  });

  test('diagram.defaultCache does not retain a pure-text document by itself', async () => {
    const diagramOnlyCacheConfig = {
      diagram: {
        defaultCache: {
          enabled: true,
          maxSize: 10,
          ttl: 60_000,
        },
      },
    };
    const firstRenderer = await renderDocument(
      'plain document',
      'complete',
      diagramOnlyCacheConfig
    );
    await unmount(firstRenderer);
    const secondRenderer = await renderDocument(
      'plain document',
      'complete',
      diagramOnlyCacheConfig
    );

    expect(parserState.calls).toBe(2);
    await unmount(secondRenderer);
  });

  test('an enabled engine cache retains documents containing that engine', async () => {
    const engineOnlyCacheConfig = {
      features: [{ id: '@supramark/feature-mermaid', enabled: false }],
      diagram: {
        engines: {
          mermaid: {
            cache: {
              enabled: true,
              maxSize: 10,
              ttl: 60_000,
            },
          },
        },
      },
    };
    const firstRenderer = await renderDocument(
      'diagram document',
      'complete',
      engineOnlyCacheConfig
    );
    await unmount(firstRenderer);
    const secondRenderer = await renderDocument(
      'diagram document',
      'complete',
      engineOnlyCacheConfig
    );

    expect(parserState.calls).toBe(1);
    await unmount(secondRenderer);
  });

  test('does not retain parsed documents when caching is disabled', async () => {
    const markdown = 'uncached paragraph';
    const disabledConfig = {
      diagram: {
        defaultCache: {
          enabled: false,
        },
      },
    };
    const firstRenderer = await renderDocument(markdown, 'complete', disabledConfig);
    await unmount(firstRenderer);
    const secondRenderer = await renderDocument(markdown, 'complete', disabledConfig);

    expect(parserState.calls).toBe(2);
    await unmount(secondRenderer);
  });
});
