import React from 'react';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { SupramarkRootNode, SupramarkSourceState } from '@supramark/core';
import type { DiagramRenderResult, DiagramRenderService } from '@supramark/engines';
import { DiagramEngineProvider } from '../src/DiagramEngineProvider';
import { Supramark } from '../src/Supramark';

type TestAct = (callback: () => void | Promise<void>) => Promise<void>;

// React 19 exports act directly, while the renderer still supports React 18 peer types.
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

describe('parsed source snapshots', () => {
  test('keeps the previous streaming state until the replacement AST is ready', async () => {
    const controlled = createControlledEngine();
    const container = createContainer();
    const openAst = createDiagramAst('{"series": [', false);
    const completeAst = createDiagramAst('{"series": []}', true);

    await renderSource(controlled.engine, 'open', openAst, 'streaming');
    expect(container.textContent).toContain('正在接收图表（echarts）…');

    await renderSource(controlled.engine, 'complete', completeAst, 'complete');
    expect(controlled.render).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('正在接收图表（echarts）…');
    expect(container.textContent).not.toContain('正在渲染图表（echarts）…');

    await act(async () => {
      controlled.finish('{"series": []}', successfulResult('complete'));
    });
    expect(container.innerHTML).toContain('<svg');
  });

  test('promotes an EOF auto-closed diagram only after the complete snapshot is ready', async () => {
    const controlled = createControlledEngine();
    const container = createContainer();
    const eofClosedAst = createDiagramAst('{"series": []}', false);

    await renderSource(controlled.engine, 'same', eofClosedAst, 'streaming');
    expect(controlled.render).not.toHaveBeenCalled();
    expect(container.textContent).toContain('正在接收图表（echarts）…');

    await renderSource(controlled.engine, 'same', eofClosedAst, 'complete');
    expect(controlled.render).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('正在接收图表（echarts）…');

    await act(async () => {
      controlled.finish('{"series": []}', successfulResult('eof-complete'));
    });
    expect(container.innerHTML).toContain('<svg');
  });

  test('ignores a stale failure after a newer source version renders successfully', async () => {
    const controlled = createControlledEngine();
    const container = createContainer();
    const openAst = createDiagramAst('{"series":', false);
    const staleAst = createDiagramAst('{"series": [', true);
    const currentAst = createDiagramAst('{"series": []}', true);

    await renderSource(controlled.engine, 'open', openAst, 'streaming');
    await renderSource(controlled.engine, 'stale', staleAst, 'complete');
    await renderSource(controlled.engine, 'current', currentAst, 'complete');
    expect(controlled.render).toHaveBeenCalledTimes(2);

    await act(async () => {
      controlled.finish('{"series": []}', successfulResult('current'));
    });
    expect(container.innerHTML).toContain('<svg');

    await act(async () => {
      controlled.finish('{"series": [', failedResult('stale'));
    });
    expect(container.innerHTML).toContain('<svg');
    expect(container.textContent).not.toContain('Unexpected character');
  });

  test('still exposes a genuine engine error for the committed source version', async () => {
    const controlled = createControlledEngine();
    const container = createContainer();
    const openAst = createDiagramAst('{"series":', false);
    const invalidAst = createDiagramAst('{"series": [', true);

    await renderSource(controlled.engine, 'open', openAst, 'streaming');
    await renderSource(controlled.engine, 'invalid', invalidAst, 'complete');
    expect(container.textContent).toContain('正在接收图表（echarts）…');

    await act(async () => {
      controlled.finish('{"series": [', failedResult('invalid'));
    });
    expect(container.textContent).toContain('Unexpected character');
    expect(container.innerHTML).not.toContain('<svg');
  });
});

function createContainer(): TestContainer {
  const container = browser.document.createElement('div');
  browser.document.body.appendChild(container);
  root = createRoot(container as unknown as HTMLDivElement);
  return container;
}

async function renderSource(
  engine: DiagramRenderService,
  markdown: string,
  ast: SupramarkRootNode,
  sourceState: SupramarkSourceState
): Promise<void> {
  await act(async () => {
    root?.render(
      <DiagramEngineProvider engine={engine}>
        <Supramark markdown={markdown} ast={ast} sourceState={sourceState} />
      </DiagramEngineProvider>
    );
  });
}

function createControlledEngine() {
  const pending = new Map<string, (result: DiagramRenderResult) => void>();
  const render = mock(
    ({ code }: Parameters<DiagramRenderService['render']>[0]) =>
      new Promise<DiagramRenderResult>(resolve => {
        pending.set(code, resolve);
      })
  );
  const engine: DiagramRenderService = { render };

  return {
    engine,
    render,
    finish(code: string, result: DiagramRenderResult) {
      const resolve = pending.get(code);
      if (!resolve) {
        throw new Error(`No pending diagram render for: ${code}`);
      }
      pending.delete(code);
      resolve(result);
    },
  };
}

function createDiagramAst(code: string, fenceClosed: boolean): SupramarkRootNode {
  return {
    type: 'root',
    ast_version: 2,
    diagnostics: [],
    children: [
      {
        type: 'diagram',
        engine: 'echarts',
        code,
        fence_closed: fenceClosed,
      },
    ],
  };
}

function successfulResult(id: string): DiagramRenderResult {
  return {
    id,
    engine: 'echarts',
    success: true,
    format: 'svg',
    payload: '<svg viewBox="0 0 1 1"></svg>',
  };
}

function failedResult(id: string): DiagramRenderResult {
  return {
    id,
    engine: 'echarts',
    success: false,
    format: 'error',
    payload: 'Spec JSON parse error',
    error: {
      code: 'render_error',
      message: 'Rendering failed',
      details: 'Unexpected character',
    },
  };
}
