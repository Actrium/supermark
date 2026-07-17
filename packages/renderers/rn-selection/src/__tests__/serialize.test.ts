import { describe, expect, test } from 'bun:test';
import type {
  SupramarkCodeNode,
  SupramarkDeleteNode,
  SupramarkDiagramNode,
  SupramarkEmphasisNode,
  SupramarkHeadingNode,
  SupramarkImageNode,
  SupramarkLinkNode,
  SupramarkListItemNode,
  SupramarkListNode,
  SupramarkMathBlockNode,
  SupramarkMathInlineNode,
  SupramarkNode,
  SupramarkParagraphNode,
  SupramarkStrongNode,
  SupramarkTextNode,
} from '@supramark/core';
import { linearizeForSelection } from '../linearize';
import type { SelectionAtomUnit } from '../model';
import { serializeSelectionUnits } from '../serialize';

type N = SupramarkNode;
const text = (value: string): SupramarkTextNode => ({ type: 'text', value }) as SupramarkTextNode;
const paragraph = (...children: N[]): SupramarkParagraphNode =>
  ({ type: 'paragraph', children }) as SupramarkParagraphNode;
const heading = (depth: 1 | 2 | 3 | 4 | 5 | 6, ...children: N[]): SupramarkHeadingNode =>
  ({ type: 'heading', depth, children }) as SupramarkHeadingNode;
const listItem = (checked: boolean | undefined, ...children: N[]): SupramarkListItemNode =>
  ({ type: 'list_item', checked, children }) as SupramarkListItemNode;
const list = (ordered: boolean, start: number | undefined, ...items: N[]): SupramarkListNode =>
  ({ type: 'list', ordered, start, children: items }) as SupramarkListNode;
const link = (url: string, title: string | undefined, ...children: N[]): SupramarkLinkNode =>
  ({ type: 'link', url, title, children }) as SupramarkLinkNode;
const strong = (...children: N[]): SupramarkStrongNode =>
  ({ type: 'strong', children }) as SupramarkStrongNode;
const emphasis = (...children: N[]): SupramarkEmphasisNode =>
  ({ type: 'emphasis', children }) as SupramarkEmphasisNode;
const del = (...children: N[]): SupramarkDeleteNode =>
  ({ type: 'delete', children }) as SupramarkDeleteNode;
const image = (url: string, alt: string): SupramarkImageNode =>
  ({ type: 'image', url, alt }) as SupramarkImageNode;
const codeBlock = (value: string, lang?: string): SupramarkCodeNode =>
  ({ type: 'code', value, lang }) as SupramarkCodeNode;

const plain = (nodes: N[]): string =>
  (serializeSelectionUnits(linearizeForSelection(nodes), 'plainText') as string).replace(/\n+$/, '');
const md = (nodes: N[]): string =>
  (serializeSelectionUnits(linearizeForSelection(nodes), 'markdown') as string).replace(/\n+$/, '');

describe('plainText vs markdown reconstruction', () => {
  test('heading marker appears only in markdown', () => {
    const doc: N[] = [heading(1, text('Hello')), paragraph(text('world'))];
    const pt = plain(doc);
    const m = md(doc);
    expect(pt).toBe('Hello\nworld');
    expect(pt).not.toContain('#');
    expect(m).toBe('# Hello\nworld');
    expect(m.startsWith('# ')).toBe(true);
  });

  test('unordered list drops the bullet in plain text', () => {
    const doc: N[] = [list(false, undefined, listItem(undefined, text('item')))];
    expect(plain(doc)).toBe('item');
    expect(md(doc)).toBe('- item');
  });

  test('ordered list numbers by list_item count', () => {
    const doc: N[] = [
      list(true, undefined, listItem(undefined, text('a')), listItem(undefined, text('b'))),
    ];
    const m = md(doc);
    expect(m).toContain('1. a');
    expect(m).toContain('2. b');
    expect(plain(doc)).toBe('a\nb');
  });

  test('task list markers show only in markdown', () => {
    const doc: N[] = [
      list(false, undefined, listItem(true, text('done')), listItem(false, text('todo'))),
    ];
    const m = md(doc);
    expect(m).toContain('- [x] done');
    expect(m).toContain('- [ ] todo');
    expect(plain(doc)).not.toContain('[');
  });

  test('link text is plain; markdown keeps the target (and optional title)', () => {
    expect(plain([paragraph(link('https://x.com', undefined, text('click')))])).toBe('click');
    expect(md([paragraph(link('https://x.com', undefined, text('click')))])).toBe(
      '[click](https://x.com)'
    );
    expect(md([paragraph(link('https://x.com', 'Home', text('click')))])).toBe(
      '[click](https://x.com "Home")'
    );
  });

  test('strong / emphasis / delete wrap in markdown but not plain text', () => {
    const doc: N[] = [paragraph(strong(text('b')), emphasis(text('i')), del(text('s')))];
    const m = md(doc);
    expect(m).toContain('**b**');
    expect(m).toContain('_i_');
    expect(m).toContain('~~s~~');
    const pt = plain(doc);
    expect(pt).toBe('bis');
    expect(pt).not.toMatch(/[*_~]/);
  });

  test('code block keeps raw code plain and fences it in markdown', () => {
    const doc: N[] = [codeBlock('const x = 1', 'js')];
    expect(plain(doc)).toBe('const x = 1');
    expect(plain(doc)).not.toContain('```');
    const m = md(doc);
    expect(m).toContain('```js');
    expect(m).toContain('const x = 1');
    expect(m.trimEnd().endsWith('```')).toBe(true);
  });

  test('image serializes to alt (plain) and Markdown image syntax', () => {
    const doc: N[] = [paragraph(image('u.png', 'alt'))];
    expect(plain(doc)).toBe('alt');
    expect(md(doc)).toBe('![alt](u.png)');
  });
});

describe('atom payload formats', () => {
  const atomOf = (node: N): SelectionAtomUnit => {
    const atom = linearizeForSelection([node]).find(u => u.kind === 'atom');
    if (!atom || atom.kind !== 'atom') throw new Error('expected an atom unit');
    return atom;
  };

  test('math_block payloads are populated; svg stays empty this milestone', () => {
    const atom = atomOf({ type: 'math_block', value: 'a^2' } as SupramarkMathBlockNode);
    expect(atom.payload.plainText).toBe('a^2');
    expect(atom.payload.markdown).toBe('$$\na^2\n$$');
    expect(atom.payload.source).toBe('a^2');
    expect(atom.payload.svg).toBeUndefined();
    expect(serializeSelectionUnits([atom], 'svg')).toBe('');
  });

  test('math_inline payloads are populated', () => {
    const atom = atomOf({ type: 'math_inline', value: 'x' } as SupramarkMathInlineNode);
    expect(atom.payload.plainText).toBe('x');
    expect(atom.payload.markdown).toBe('$x$');
    expect(atom.payload.source).toBe('x');
  });

  test('diagram payloads carry code, fenced markdown, and source', () => {
    const atom = atomOf({ type: 'diagram', engine: 'mermaid', code: 'graph TD' } as SupramarkDiagramNode);
    expect(atom.payload.plainText).toBe('graph TD');
    expect(atom.payload.markdown).toBe('```mermaid\ngraph TD\n```');
    expect(atom.payload.source).toBe('graph TD');
  });
});
