import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import type { DiagramRenderResult } from '@supramark/engines';
import type { SupramarkDiagramNode, SupramarkSourceState } from '@supramark/core';

// react-test-renderer 需要显式开启 act 环境，否则 effect 不会同步 flush。
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// 受控 engine：DiagramNode 在模块加载时调用一次 createReactNativeDiagramEngine，
// 因此 mock engine 跨测试共享；每个测试通过 engineState 观察调用与控制 resolve。
const engineState = {
  renderCalls: 0,
  pendingResolve: null as null | ((result: DiagramRenderResult) => void),
};

// 用字符串 host 组件 mock react-native 表面，react-test-renderer 会把它们当作
// host 节点渲染，便于按 testID 断言状态。
mock.module('react-native', () => ({
  View: 'View',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  StyleSheet: { create: (s: unknown) => s },
}));

mock.module('react-native-svg', () => ({
  SvgXml: 'SvgXml',
}));

mock.module('@supramark/engines/rn', () => ({
  createReactNativeDiagramEngine: () => ({
    render: () => {
      engineState.renderCalls += 1;
      return new Promise<DiagramRenderResult>(resolve => {
        engineState.pendingResolve = resolve;
      });
    },
  }),
}));

// 动态 import：确保上方 mock 在 DiagramNode 加载 react-native / engines/rn 前生效。
const { DiagramNode } = await import('../src/DiagramNode');
const { SourceStateContext } = await import('../src/SourceStateContext');

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

// create / update 必须包在 act 里，effect 才会同步 flush；额外的 microtask 等待
// 让 useEffect 内的 setState 在 act 边界内完成，避免 act 警告。
async function renderWithState(
  node: SupramarkDiagramNode,
  state: SupramarkSourceState
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = create(
      React.createElement(
        SourceStateContext.Provider,
        { value: state },
        React.createElement(DiagramNode, { node })
      )
    );
    await Promise.resolve();
  });
  // act 回调内赋值后 TS 不收紧，这里断言已赋值。
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
        React.createElement(DiagramNode, { node })
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
});
