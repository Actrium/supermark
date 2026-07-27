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

async function renderAst(
  ast: SupramarkRootNode,
  options?: { allowDangerousHtml?: boolean }
): Promise<TestContainer> {
  const container = createContainer();
  await act(async () => {
    root?.render(
      <Supramark
        markdown=""
        ast={ast}
        config={options?.allowDangerousHtml ? { options: { allowDangerousHtml: true } } : undefined}
      />
    );
  });
  return container;
}

function makeRoot(children: SupramarkRootNode['children']): SupramarkRootNode {
  return { type: 'root', ast_version: 2, diagnostics: [], children };
}

function paragraph(text: string) {
  return { type: 'paragraph', children: [{ type: 'text', value: text }] } as const;
}

function text(value: string) {
  return { type: 'text', value } as const;
}

function heading(depth: number, content: string) {
  return { type: 'heading', depth, children: [text(content)] } as const;
}

function unorderedList(children: SupramarkRootNode['children']) {
  return { type: 'list', ordered: false, children } as const;
}

function listItem(children: SupramarkRootNode['children']) {
  return { type: 'list_item', children } as const;
}

function raw(value: string, block = true) {
  return { type: 'raw', format: 'html', value, block } as const;
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

describe('CommonMark hard line breaks', () => {
  test('emits a newline after <br /> between text in a paragraph', async () => {
    // commonmark-0.31.2-0633: `foo  \nbaz` -> <p>foo<br />\nbaz</p>
    const ast = makeRoot([
      {
        type: 'paragraph',
        children: [text('foo'), { type: 'break' }, text('baz')],
      },
    ]);
    const container = await renderAst(ast);
    expect(container.innerHTML).toMatch(/foo<br\s*\/?>\nbaz/);
  });

  test('emits a newline after <br /> inside emphasis', async () => {
    // commonmark-0.31.2-0638: `*foo  \nbar*` -> <p><em>foo<br />\nbar</em></p>
    const ast = makeRoot([
      {
        type: 'paragraph',
        children: [
          {
            type: 'emphasis',
            children: [text('foo'), { type: 'break' }, text('bar')],
          },
        ],
      },
    ]);
    const container = await renderAst(ast);
    expect(container.innerHTML).toMatch(/foo<br\s*\/?>\nbar/);
  });
});

describe('CommonMark list item block/inline boundaries', () => {
  test('separates inline text from a nested list with a newline', async () => {
    // commonmark-0.31.2-0323: `- a\n  - b` -> <li>a\n<ul>...
    const ast = makeRoot([
      unorderedList([
        listItem([text('a'), unorderedList([listItem([text('b')])])]),
      ]),
    ]);
    const container = await renderAst(ast);
    expect(container.innerHTML).toMatch(/<li>a\n<ul/);
  });

  test('separates a nested block from following inline text with a newline', async () => {
    // commonmark-0.31.2-0300 (second item): `<h2>Bar</h2>\nbaz`
    const ast = makeRoot([
      unorderedList([listItem([heading(2, 'Bar'), text('baz')])]),
    ]);
    const container = await renderAst(ast);
    expect(container.innerHTML).toMatch(/<h2[^>]*>Bar<\/h2>\nbaz/);
  });

  test('does not insert a newline between adjacent inline nodes in a tight item', async () => {
    const ast = makeRoot([
      unorderedList([
        listItem([
          text('a'),
          { type: 'emphasis', children: [text('b')] },
        ]),
      ]),
    ]);
    const container = await renderAst(ast);
    expect(container.innerHTML).toMatch(/<li>a<em>b<\/em><\/li>/);
  });

  test('does not insert a newline in a tight item with only inline text', async () => {
    const ast = makeRoot([unorderedList([listItem([text('foo')])])]);
    const container = await renderAst(ast);
    expect(container.innerHTML).toMatch(/<li>foo<\/li>/);
  });
});

describe('CommonMark raw HTML', () => {
  test('renders a balanced block raw element via a same-named host', async () => {
    // commonmark-0.31.2-0185: `<div>\nbar\n</div>` stays as <div>\nbar\n</div>
    const ast = makeRoot([raw('<div>\nbar\n</div>')]);
    const container = await renderAst(ast, { allowDangerousHtml: true });
    expect(container.innerHTML).toContain('<div>');
    expect(container.innerHTML).toContain('bar');
    expect(container.innerHTML).toContain('</div>');
    // no extra wrapper element around the raw div
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  test('preserves the literal inner text of a raw block (no markdown processing)', async () => {
    // commonmark-0.31.2-0189: `<div>\n*Emphasized* text.\n</div>` — `*x*` stays literal
    const ast = makeRoot([raw('<div>\n*Emphasized* text.\n</div>')]);
    const container = await renderAst(ast, { allowDangerousHtml: true });
    expect(container.innerHTML).toContain('*Emphasized*');
    expect(container.innerHTML).not.toContain('<em>');
  });

  test('renders a self-closing inline custom element in a paragraph', async () => {
    // commonmark-0.31.2-0617: `Foo <responsive-image src="foo.jpg" />`
    const ast = makeRoot([
      {
        type: 'paragraph',
        children: [text('Foo '), raw('<responsive-image src="foo.jpg" />', false)],
      },
    ]);
    const container = await renderAst(ast, { allowDangerousHtml: true });
    expect(container.innerHTML).toContain('Foo');
    expect(container.innerHTML).toMatch(/<responsive-image[^>]*src="foo.jpg"/);
  });

  test('renders a raw <textarea> with its literal content', async () => {
    // commonmark-0.31.2-0171: textarea content is raw text, not markdown
    const ast = makeRoot([raw('<textarea>\n\n*foo*\n\n</textarea>')]);
    const container = await renderAst(ast, { allowDangerousHtml: true });
    expect(container.innerHTML).toMatch(/<textarea[^>]*>/);
    expect(container.innerHTML).toContain('*foo*');
    expect(container.innerHTML).toContain('</textarea>');
  });

  test('renders a bare open-tag raw fragment as an empty same-named host', async () => {
    // commonmark-0.31.2-0152 splits `<DIV CLASS="foo">` and `</DIV>` into two
    // raw nodes. A bare open-tag fragment with no close tag and no following
    // sibling renders as a same-named host carrying the attributes; the HTML
    // parser auto-closes it. (With a matching close-tag sibling, mergeRawNodes
    // wraps the intervening children — covered by the conformance suite.)
    const ast = makeRoot([raw('<DIV CLASS="foo">')]);
    const container = await renderAst(ast, { allowDangerousHtml: true });
    expect(container.innerHTML).toMatch(/<div[^>]*>/i);
    expect(container.innerHTML).toContain('foo');
  });

  test('renders a comment raw node via DOM injection', async () => {
    // `<!-- foo -->` is a raw fragment React cannot emit as an element, so
    // the renderer parses the value through a <template> and splices the
    // resulting comment node in place.
    const ast = makeRoot([raw('<!-- foo -->')]);
    const container = await renderAst(ast, { allowDangerousHtml: true });
    expect(container.innerHTML).toContain('<!-- foo -->');
  });

  test('drops raw HTML when allowDangerousHtml is not enabled (default off)', async () => {
    // Raw HTML is opt-in. Without the flag, raw nodes are dropped so an
    // upgrade never silently enables script execution from untrusted
    // markdown — matching the pre-raw-HTML behaviour. The raw `<img onerror>`
    // must not reach the DOM; surrounding content still renders.
    const ast = makeRoot([
      raw('<div><img src="x" onerror="alert(1)"></div>'),
      paragraph('after'),
    ]);
    const container = await renderAst(ast);
    expect(container.innerHTML).not.toContain('onerror');
    expect(container.innerHTML).not.toContain('<img');
    expect(container.innerHTML).toContain('after');
  });

  test('drops inline raw HTML inside a paragraph when the flag is off', async () => {
    const ast = makeRoot([
      {
        type: 'paragraph',
        children: [text('hello '), raw('<img src="z" onerror="alert(1)">', false), text(' world')],
      },
    ]);
    const container = await renderAst(ast);
    expect(container.innerHTML).not.toContain('onerror');
    expect(container.innerHTML).not.toContain('<img');
    expect(container.innerHTML).toContain('hello');
    expect(container.innerHTML).toContain('world');
  });

  test('does not duplicate raw output across re-renders', async () => {
    // RawHtml's useLayoutEffect cleanup must remove the nodes it spliced in
    // and restore the placeholder's slot, otherwise every re-render appends
    // another copy — unbounded growth for streaming markdown.
    const ast = makeRoot([
      {
        type: 'paragraph',
        children: [text('a '), raw('<span>x</span>', false)],
      },
    ]);
    const container = await renderAst(ast, { allowDangerousHtml: true });
    const firstHtml = container.innerHTML.replace(/<span style="display: ?none[^>]*><\/span>/, '');
    const spanCount = (firstHtml.match(/<span>x<\/span>/g) ?? []).length;
    expect(spanCount).toBe(1);

    // Re-render the same container with a different raw value.
    const ast2 = makeRoot([
      {
        type: 'paragraph',
        children: [text('b '), raw('<span>y</span>', false)],
      },
    ]);
    await act(async () => {
      root?.render(
        <Supramark
          markdown=""
          ast={ast2}
          config={{ options: { allowDangerousHtml: true } }}
        />
      );
    });
    const secondHtml = container.innerHTML.replace(/<span style="display: ?none[^>]*><\/span>/, '');
    expect((secondHtml.match(/<span>x<\/span>/g) ?? []).length).toBe(0);
    expect((secondHtml.match(/<span>y<\/span>/g) ?? []).length).toBe(1);
  });
});
