import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import type { DiagramRenderResult, DiagramRenderService } from '@supramark/engines';
import type { SupramarkDiagramNode, SupramarkSourceState } from '@supramark/core';

import './support/mock-react-native';

// react-test-renderer requires explicitly enabling the act environment, otherwise effects won't flush synchronously.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// A controlled engine: DiagramNode calls createReactNativeDiagramEngine once
// at module load time, so the mock engine is shared across tests; each test
// observes calls and controls resolution via engineState.
const engineState = {
  renderCalls: 0,
  pendingResolve: null as null | ((result: DiagramRenderResult) => void),
};

// Inject a controlled engine through DiagramNode's renderer boundary instead of
// replacing the engines package globally, keeping this test isolated from peers.
const controlledDiagramEngine: DiagramRenderService = {
  render: () => {
    engineState.renderCalls += 1;
    return new Promise<DiagramRenderResult>(resolve => {
      engineState.pendingResolve = resolve;
    });
  },
};

// Dynamic import: ensures the mock above takes effect before DiagramNode loads react-native / engines/rn.
const { DiagramNode } = await import('../src/DiagramNode');
const { clearReactNativeRendererCaches } = await import('../src/renderCache');
const { SourceStateContext } = await import('../src/SourceStateContext');

// Enable an existing diagram.defaultCache config to verify that the RN renderer actually consumes the cache policy.
const enabledCacheConfig = {
  defaultCache: {
    enabled: true,
    maxSize: 10,
    ttl: 60_000,
  },
};

function createDiagramNode(fenceClosed: boolean): SupramarkDiagramNode {
  return {
    type: 'diagram',
    engine: 'mermaid',
    code: 'graph TD; A-->B;',
    fence_closed: fenceClosed,
  };
}

function successfulResult(): DiagramRenderResult {
  return {
    id: 'test',
    engine: 'mermaid',
    success: true,
    format: 'svg',
    payload: '<svg viewBox="0 0 10 10"></svg>',
  };
}

function failedResult(): DiagramRenderResult {
  return {
    id: 'test-error',
    engine: 'mermaid',
    success: false,
    format: 'error',
    payload: 'invalid diagram',
    error: {
      code: 'render_error',
      message: 'Render failed',
    },
  };
}

function normalizationFailureResult(): DiagramRenderResult {
  return {
    id: 'test-normalization-error',
    engine: 'mermaid',
    success: true,
    format: 'svg',
    payload: null as unknown as string,
  };
}

// create / update must be wrapped in act so effects flush synchronously; the
// extra microtask wait lets setState inside useEffect complete within the
// act boundary, avoiding act warnings.
async function renderWithState(
  node: SupramarkDiagramNode,
  state: SupramarkSourceState,
  diagramConfig?: React.ComponentProps<typeof DiagramNode>['diagramConfig'],
  globalCache?: React.ComponentProps<typeof DiagramNode>['globalCache']
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = create(
      React.createElement(
        SourceStateContext.Provider,
        { value: state },
        React.createElement(DiagramNode, {
          node,
          diagramConfig,
          globalCache,
          diagramEngine: controlledDiagramEngine,
        })
      )
    );
    await Promise.resolve();
  });
  // TS doesn't narrow the type after assignment inside the act callback, so assert it's been assigned here.
  return renderer as unknown as ReactTestRenderer;
}

function hasTestId(renderer: ReactTestRenderer, testID: string): boolean {
  return renderer.root.findAllByProps({ testID }).length > 0;
}

async function updateState(
  renderer: ReactTestRenderer,
  node: SupramarkDiagramNode,
  state: SupramarkSourceState
): Promise<void> {
  await act(async () => {
    renderer.update(
      React.createElement(
        SourceStateContext.Provider,
        { value: state },
        React.createElement(DiagramNode, {
          node,
          diagramEngine: controlledDiagramEngine,
        })
      )
    );
    await Promise.resolve();
  });
}

async function unmount(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => {
    renderer.unmount();
  });
}

async function resolveEngine(result: DiagramRenderResult): Promise<void> {
  await act(async () => {
    engineState.pendingResolve?.(result);
    await Promise.resolve();
  });
}

describe('DiagramNode streaming defer/render', () => {
  beforeEach(() => {
    clearReactNativeRendererCaches();
    engineState.renderCalls = 0;
    engineState.pendingResolve = null;
  });

  afterEach(() => {
    engineState.pendingResolve = null;
  });

  test('keeps an open streamed fence in the receiving state without invoking the engine', async () => {
    const renderer = await renderWithState(createDiagramNode(false), 'streaming');
    expect(hasTestId(renderer, 'supramark-diagram-receiving')).toBe(true);
    expect(engineState.renderCalls).toBe(0);
    await unmount(renderer);
  });

  test('renders an explicitly closed fence immediately even while streaming', async () => {
    const renderer = await renderWithState(createDiagramNode(true), 'streaming');
    expect(engineState.renderCalls).toBe(1);
    expect(hasTestId(renderer, 'supramark-diagram-rendering')).toBe(true);

    await resolveEngine(successfulResult());

    expect(hasTestId(renderer, 'supramark-diagram-svg')).toBe(true);
    await unmount(renderer);
  });

  test('transitions from receiving to rendering to svg when the source completes', async () => {
    const node = createDiagramNode(false);
    const renderer = await renderWithState(node, 'streaming');
    expect(hasTestId(renderer, 'supramark-diagram-receiving')).toBe(true);
    expect(engineState.renderCalls).toBe(0);

    await updateState(renderer, node, 'complete');
    expect(engineState.renderCalls).toBe(1);
    expect(hasTestId(renderer, 'supramark-diagram-rendering')).toBe(true);

    await resolveEngine(successfulResult());
    expect(hasTestId(renderer, 'supramark-diagram-svg')).toBe(true);
    await unmount(renderer);
  });

  test('restores a completed svg synchronously after remount without invoking the engine again', async () => {
    const node = createDiagramNode(true);
    const firstRenderer = await renderWithState(node, 'complete', enabledCacheConfig);
    expect(engineState.renderCalls).toBe(1);

    await resolveEngine(successfulResult());
    expect(hasTestId(firstRenderer, 'supramark-diagram-svg')).toBe(true);
    await unmount(firstRenderer);

    const secondRenderer = await renderWithState(node, 'complete', {
      defaultCache: {
        enabled: true,
        maxSize: 10,
        ttl: 60_000,
      },
    });
    expect(engineState.renderCalls).toBe(1);
    expect(hasTestId(secondRenderer, 'supramark-diagram-svg')).toBe(true);
    expect(hasTestId(secondRenderer, 'supramark-diagram-rendering')).toBe(false);
    await unmount(secondRenderer);
  });

  test('uses the global cache option when no diagram cache policy is configured', async () => {
    const node = createDiagramNode(true);
    const firstRenderer = await renderWithState(node, 'complete', undefined, true);
    expect(engineState.renderCalls).toBe(1);

    await resolveEngine(successfulResult());
    await unmount(firstRenderer);

    const secondRenderer = await renderWithState(node, 'complete', undefined, true);
    expect(engineState.renderCalls).toBe(1);
    expect(hasTestId(secondRenderer, 'supramark-diagram-svg')).toBe(true);
    expect(hasTestId(secondRenderer, 'supramark-diagram-rendering')).toBe(false);
    await unmount(secondRenderer);
  });

  test('does not retain svg results when the configured cache is disabled', async () => {
    const node = createDiagramNode(true);
    const disabledCacheConfig = {
      defaultCache: {
        enabled: false,
      },
    };
    const firstRenderer = await renderWithState(node, 'complete', disabledCacheConfig, true);
    await resolveEngine(successfulResult());
    await unmount(firstRenderer);

    const secondRenderer = await renderWithState(node, 'complete', disabledCacheConfig, true);
    expect(engineState.renderCalls).toBe(2);
    expect(hasTestId(secondRenderer, 'supramark-diagram-rendering')).toBe(true);
    await unmount(secondRenderer);
  });

  test('lets an engine-level cache override disable the diagram default', async () => {
    const node = createDiagramNode(true);
    const engineOverrideConfig = {
      defaultCache: {
        enabled: true,
        maxSize: 10,
      },
      engines: {
        mermaid: {
          cache: {
            enabled: false,
          },
        },
      },
    };
    const firstRenderer = await renderWithState(node, 'complete', engineOverrideConfig);
    await resolveEngine(successfulResult());
    await unmount(firstRenderer);

    const secondRenderer = await renderWithState(node, 'complete', engineOverrideConfig);
    expect(engineState.renderCalls).toBe(2);
    await unmount(secondRenderer);
  });

  test('does not cache a failed diagram result', async () => {
    const node = createDiagramNode(true);
    const firstRenderer = await renderWithState(node, 'complete', enabledCacheConfig);
    await resolveEngine(failedResult());
    expect(hasTestId(firstRenderer, 'supramark-diagram-error')).toBe(true);
    await unmount(firstRenderer);

    const secondRenderer = await renderWithState(node, 'complete', enabledCacheConfig);
    expect(engineState.renderCalls).toBe(2);
    expect(hasTestId(secondRenderer, 'supramark-diagram-rendering')).toBe(true);
    await unmount(secondRenderer);
  });

  test('keeps normalization failures distinguishable from engine render failures', async () => {
    const renderer = await renderWithState(createDiagramNode(true), 'complete');
    await resolveEngine(normalizationFailureResult());

    expect(hasTestId(renderer, 'supramark-diagram-error')).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain('SVG normalization failed:');
    await unmount(renderer);
  });

  test('deduplicates an in-flight render shared by equivalent diagram nodes', async () => {
    const node = createDiagramNode(true);
    const firstRenderer = await renderWithState(node, 'complete', enabledCacheConfig);
    const secondRenderer = await renderWithState(node, 'complete', enabledCacheConfig);

    expect(engineState.renderCalls).toBe(1);
    await resolveEngine(successfulResult());
    expect(hasTestId(firstRenderer, 'supramark-diagram-svg')).toBe(true);
    expect(hasTestId(secondRenderer, 'supramark-diagram-svg')).toBe(true);

    await unmount(firstRenderer);
    await unmount(secondRenderer);
  });
});
