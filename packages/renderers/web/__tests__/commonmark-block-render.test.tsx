import React from 'react';
import { afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { SupramarkRootNode } from '@supramark/core';
import { Supramark } from '../src/Supramark';

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

async function renderAst(ast: SupramarkRootNode): Promise<TestContainer> {
  const container = createContainer();
  await act(async () => {
    root?.render(<Supramark markdown="" ast={ast} />);
  });
  return container;
}

function makeRoot(children: SupramarkRootNode['children']): SupramarkRootNode {
  return { type: 'root', ast_version: 2, diagnostics: [], children };
}

function paragraph(text: string) {
  return { type: 'paragraph', children: [{ type: 'text', value: text }] } as const;
}

describe('CommonMark block rendering', () => {
  test('renders a blockquote with its paragraph children', async () => {
    const ast = makeRoot([{ type: 'blockquote', children: [paragraph('quote')] }]);
    const container = await renderAst(ast);
    expect(container.innerHTML).toContain('<blockquote>');
    expect(container.innerHTML).toContain('quote');
    expect(container.innerHTML).toContain('</blockquote>');
  });

  test('renders a thematic break as <hr />', async () => {
    const ast = makeRoot([{ type: 'thematic_break' }]);
    const container = await renderAst(ast);
    expect(container.innerHTML).toMatch(/<hr\s*\/?>/i);
  });

  test('renders ordered list start attribute when start is not 1', async () => {
    const ast = makeRoot([
      {
        type: 'list',
        ordered: true,
        start: 3,
        children: [{ type: 'list_item', children: [paragraph('a')] }],
      },
    ]);
    const container = await renderAst(ast);
    expect(container.innerHTML).toMatch(/<ol[^>]*\sstart="3"[^>]*>/i);
  });

  test('omits start attribute on ordered list when start is 1', async () => {
    const ast = makeRoot([
      {
        type: 'list',
        ordered: true,
        start: 1,
        children: [{ type: 'list_item', children: [paragraph('a')] }],
      },
    ]);
    const container = await renderAst(ast);
    const olMatch = container.innerHTML.match(/<ol[^>]*>/i);
    expect(olMatch).not.toBeNull();
    expect(olMatch![0]).not.toMatch(/\sstart=/i);
  });

  test('emits language-xxx class on fenced code with a lang', async () => {
    const ast = makeRoot([{ type: 'code', lang: 'ruby', value: 'x = 1\n' }]);
    const container = await renderAst(ast);
    expect(container.innerHTML).toContain('class="language-ruby"');
  });

  test('omits language class on fenced code without a lang', async () => {
    const ast = makeRoot([{ type: 'code', value: 'plain\n' }]);
    const container = await renderAst(ast);
    const codeMatch = container.innerHTML.match(/<code[^>]*>/i);
    expect(codeMatch).not.toBeNull();
    expect(codeMatch![0]).not.toMatch(/language-/i);
  });
});
