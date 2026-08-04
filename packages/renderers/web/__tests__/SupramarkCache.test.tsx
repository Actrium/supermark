import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { Window } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { DiagramRenderResult, DiagramRenderService } from '@supramark/engines';
import type { SupramarkRootNode } from '@supramark/core';

import { Supramark } from '../src/Supramark';
import { DiagramEngineContext } from '../src/DiagramEngineProvider';
import { clearWebRendererCaches } from '../src/renderCache';

/**
 * Integration tests for the web renderer's diagram cache (issue #163).
 *
 * Before this cache existed, `engineConfig.cache` was a silent no-op on web:
 * `buildDiagramRenderOptions` forwarded the field into render `options`, but
 * no web engine read it, so every remount re-ran the full wasm render. These
 * tests pin the contract that a host's cache policy is now honored.
 */

type TestAct = (callback: () => void | Promise<void>) => Promise<void>;
const act = (React as typeof React & { act: TestAct }).act;
const browser = new Window();
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  HTMLElement: browser.HTMLElement,
  Node: browser.Node,
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
type TestContainer = ReturnType<typeof browser.document.createElement>;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  browser.document.body.replaceChildren();
});

function createContainer(): TestContainer {
  const container = browser.document.createElement('div');
  browser.document.body.appendChild(container);
  root = createRoot(container as unknown as HTMLDivElement);
  return container;
}

// Controlled engine: counts render calls so a cache miss/hit is observable.
// Returning a resolved promise mirrors the real async render boundary.
const engineState = {
  renderCalls: 0,
};

const controlledDiagramEngine: DiagramRenderService = {
  render: () => {
    engineState.renderCalls += 1;
    return Promise.resolve(successResult());
  },
};

function successResult(): DiagramRenderResult {
  return {
    id: 'test',
    engine: 'mermaid',
    success: true,
    format: 'svg',
    payload: '<svg data-test="mermaid"></svg>',
  };
}

function diagramAst(): SupramarkRootNode {
  return {
    type: 'root',
    ast_version: 2,
    diagnostics: [],
    children: [
      {
        type: 'diagram',
        engine: 'mermaid',
        code: 'graph TD; A-->B;',
        fence_closed: true,
      } as never,
    ],
  } as SupramarkRootNode;
}

async function renderDocument(config: unknown): Promise<void> {
  createContainer();
  await act(async () => {
    root?.render(
      React.createElement(
        DiagramEngineContext.Provider,
        { value: controlledDiagramEngine },
        React.createElement(Supramark, {
          markdown: '',
          ast: diagramAst(),
          sourceState: 'complete',
          config: config as never,
        })
      )
    );
    // Let the async effect (expandOpaqueContainers + preRenderAll) settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function unmount(): Promise<void> {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
}

describe('Supramark web diagram cache', () => {
  beforeEach(() => {
    clearWebRendererCaches();
    engineState.renderCalls = 0;
  });

  test('reuses an engine render across remounts when cache is enabled', async () => {
    const config = {
      diagram: { defaultCache: { enabled: true, maxSize: 10, ttl: 60_000 } },
    };
    await renderDocument(config);
    expect(engineState.renderCalls).toBe(1);

    await unmount();
    await renderDocument(config);
    // Second mount hits the cache: no additional engine.render call.
    expect(engineState.renderCalls).toBe(1);
  });

  test('shares cache entries across equivalent inline config objects', async () => {
    await renderDocument({ diagram: { defaultCache: { enabled: true, maxSize: 10 } } });
    expect(engineState.renderCalls).toBe(1);

    await unmount();
    // A fresh inline config object with the same resolved policy must hit the
    // same cache bucket (policy key is namespace+maxSize+ttl, not identity).
    await renderDocument({ diagram: { defaultCache: { enabled: true, maxSize: 10 } } });
    expect(engineState.renderCalls).toBe(1);
  });

  test('re-renders on every mount when caching is disabled', async () => {
    const config = {
      diagram: { defaultCache: { enabled: false } },
    };
    await renderDocument(config);
    expect(engineState.renderCalls).toBe(1);

    await unmount();
    await renderDocument(config);
    expect(engineState.renderCalls).toBe(2);
  });

  test('honors an enabled per-engine cache without global cache', async () => {
    const config = () => ({
      options: { cache: false },
      diagram: {
        engines: {
          mermaid: { cache: { enabled: true, maxSize: 10, ttl: 60_000 } },
        },
      },
    });
    await renderDocument(config());
    expect(engineState.renderCalls).toBe(1);

    await unmount();
    await renderDocument(config());
    expect(engineState.renderCalls).toBe(1);
  });

  test('a changed engine instance bypasses the prior cache', async () => {
    // A different engine identity gets a different cache key prefix, so a host
    // swapping engine instances never serves another engine's cached SVG.
    const otherEngine: DiagramRenderService = {
      render: () => {
        engineState.renderCalls += 1;
        return Promise.resolve(successResult());
      },
    };
    const config = {
      diagram: { defaultCache: { enabled: true, maxSize: 10, ttl: 60_000 } },
    };

    createContainer();
    await act(async () => {
      root?.render(
        React.createElement(
          DiagramEngineContext.Provider,
          { value: controlledDiagramEngine },
          React.createElement(Supramark, {
            markdown: '',
            ast: diagramAst(),
            sourceState: 'complete',
            config,
          })
        )
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(engineState.renderCalls).toBe(1);
    await unmount();

    createContainer();
    await act(async () => {
      root?.render(
        React.createElement(
          DiagramEngineContext.Provider,
          { value: otherEngine },
          React.createElement(Supramark, {
            markdown: '',
            ast: diagramAst(),
            sourceState: 'complete',
            config,
          })
        )
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(engineState.renderCalls).toBe(2);
    await unmount();
  });
});
