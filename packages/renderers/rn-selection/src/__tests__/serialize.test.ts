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
import type { SelectionAtomUnit, SelectionTextUnit } from '../model';
import { resolveSelectionRange } from '../resolve';
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
const cell = (...children: N[]): N => ({ type: 'table_cell', children }) as unknown as N;
const headerCell = (...children: N[]): N =>
  ({ type: 'table_cell', header: true, children }) as unknown as N;
const row = (...cells: N[]): N => ({ type: 'table_row', children: cells }) as unknown as N;
const table = (
  align: ('left' | 'right' | 'center' | null)[] | undefined,
  ...rows: N[]
): N => ({ type: 'table', align, children: rows }) as unknown as N;
const blockquote = (...children: N[]): N =>
  ({ type: 'blockquote', children }) as unknown as N;

const plain = (nodes: N[]): string =>
  (serializeSelectionUnits(linearizeForSelection(nodes), 'plainText') as string).replace(/\n+$/, '');
const md = (nodes: N[]): string =>
  (serializeSelectionUnits(linearizeForSelection(nodes), 'markdown') as string).replace(/\n+$/, '');
const html = (nodes: N[]): string =>
  serializeSelectionUnits(linearizeForSelection(nodes), 'html') as string;

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

describe('table full-selection copy', () => {
  const doc: N[] = [
    table(['left', 'right'], row(cell(text('h1')), cell(text('h2'))), row(cell(text('a')), cell(text('b')))),
  ];

  test('markdown table reconstructs header, alignment row, and body', () => {
    expect(md(doc)).toBe('| h1 | h2 |\n| :--- | ---: |\n| a | b |');
  });

  test('plain text serializes to TSV', () => {
    expect(plain(doc)).toBe('h1\th2\na\tb');
  });

  test('html serializes to a table element', () => {
    const h = html(doc);
    expect(h).toContain('<table');
    expect(h).toContain('<th>h1</th>');
    expect(h).toContain('<th>h2</th>');
    expect(h).toContain('<td>a</td>');
    expect(h).toContain('<td>b</td>');
    expect(h).toContain('</table>');
    expect(h).not.toContain('---');
  });

  test('alignment row reflects the align array', () => {
    const noAlign: N[] = [table(undefined, row(cell(text('h1')), cell(text('h2'))))];
    expect(md(noAlign)).toContain('| --- | --- |');
    const centered: N[] = [table(['center', null], row(cell(text('h1')), cell(text('h2'))))];
    expect(md(centered)).toContain('| :---: | --- |');
  });

  test('nested inline formatting inside a cell round-trips', () => {
    const d: N[] = [table(undefined, row(cell(strong(text('b'))), cell(text('x'))))];
    expect(md(d)).toContain('**b**');
    expect(plain(d)).toBe('b\tx');
    expect(plain(d)).not.toContain('*');
  });

  test('empty cell keeps column structure', () => {
    const d: N[] = [table(undefined, row(cell(text('a')), cell()), row(cell(text('c')), cell()))];
    const m = md(d);
    expect(m).toContain('| a |  |');
    const h = html(d);
    expect(h).toContain('<td></td>');
    expect(plain(d)).toContain('a\t');
  });

  test('multiple all-header rows still emit a single alignment row', () => {
    const d: N[] = [
      table(
        undefined,
        row(cell(text('h1')), cell(text('h2'))),
        row(headerCell(text('g1')), headerCell(text('g2'))),
        row(cell(text('a')), cell(text('b')))
      ),
    ];
    const m = md(d);
    expect(m).toBe('| h1 | h2 |\n| --- | --- |\n| g1 | g2 |\n| a | b |');
    // Exactly one delimiter row; a second one would make most parsers reject it.
    expect(m.split('| --- | --- |').length - 1).toBe(1);
  });
});

describe('table partial-selection copy', () => {
  test('a two-cell partial selection degrades to tab-separated plain text', () => {
    const units = linearizeForSelection([
      table(undefined, row(cell(text('AAA')), cell(text('BBB')))),
    ]);
    const texts = units.filter((u): u is SelectionTextUnit => u.kind === 'text');
    const a = texts.find(u => u.text === 'AAA');
    const b = texts.find(u => u.text === 'BBB');
    if (!a || !b) throw new Error('expected AAA/BBB text units');
    const resolved = resolveSelectionRange(units, {
      anchor: { nodeId: a.nodeId, unitId: a.unitId, offset: 1 },
      focus: { nodeId: b.nodeId, unitId: b.unitId, offset: 2 },
    });
    expect(serializeSelectionUnits(resolved, 'plainText')).toBe('AA\tBB');
    expect(serializeSelectionUnits(resolved, 'plainText')).not.toContain('|');
  });

  test('partial selection across a row break leaks no structural markup in any flavor', () => {
    const units = linearizeForSelection([
      table(
        undefined,
        row(cell(text('AA')), cell(text('BBB'))),
        row(cell(text('CCC')), cell(text('DD')))
      ),
    ]);
    const texts = units.filter((u): u is SelectionTextUnit => u.kind === 'text');
    const a = texts.find(u => u.text === 'AA');
    const d = texts.find(u => u.text === 'DD');
    if (!a || !d) throw new Error('expected AA/DD text units');
    // From mid-cell-1, across the row break, to mid-cell-4.
    const resolved = resolveSelectionRange(units, {
      anchor: { nodeId: a.nodeId, unitId: a.unitId, offset: 1 },
      focus: { nodeId: d.nodeId, unitId: d.unitId, offset: 1 },
    });
    const tsv = 'A\tBBB\nCCC\tD';
    expect(serializeSelectionUnits(resolved, 'plainText')).toBe(tsv);
    // markdown must not leak pipes or a stray alignment row.
    const m = serializeSelectionUnits(resolved, 'markdown') as string;
    expect(m).toBe(tsv);
    expect(m).not.toContain('|');
    expect(m).not.toContain('---');
    // html must not leak unbalanced table tags.
    const h = serializeSelectionUnits(resolved, 'html') as string;
    expect(h).toBe(tsv);
    expect(h).not.toContain('<t');
    expect(h).not.toContain('</t');
  });

  test('full-table selection via resolve keeps the markdown scaffolding', () => {
    const units = linearizeForSelection([
      table(['left', 'right'], row(cell(text('h1')), cell(text('h2'))), row(cell(text('a')), cell(text('b')))),
    ]);
    // Anchor before the first structural unit, focus after the trailing break:
    // the whole group is covered, so the pipes and alignment row survive.
    const first = units[0];
    const last = units[units.length - 1];
    const resolved = resolveSelectionRange(units, {
      anchor: { nodeId: first.nodeId, unitId: first.unitId, offset: 0 },
      focus: { nodeId: last.nodeId, unitId: last.unitId, offset: 1 },
    });
    const m = (serializeSelectionUnits(resolved, 'markdown') as string).replace(/\n+$/, '');
    expect(m).toBe('| h1 | h2 |\n| :--- | ---: |\n| a | b |');
  });
});

describe('blockquote per-line prefixing', () => {
  test('two paragraphs prefix every markdown line', () => {
    const d: N[] = [blockquote(paragraph(text('one')), paragraph(text('two')))];
    expect(md(d)).toBe('> one\n> two');
    md(d)
      .split('\n')
      .forEach(l => expect(l.startsWith('> ')).toBe(true));
    expect(plain(d)).toBe('one\ntwo');
    expect(plain(d)).not.toContain('>');
  });

  test('single paragraph keeps a single prefix', () => {
    const d: N[] = [blockquote(paragraph(text('quoted')))];
    expect(md(d)).toBe('> quoted');
    expect(plain(d)).toBe('quoted');
  });

  test('pure nested blockquote emits no dangling empty quoted line', () => {
    const d: N[] = [blockquote(blockquote(paragraph(text('deep'))))];
    // No trailing '> ' line: the only interior break is a trailing block break.
    expect(md(d)).toBe('> > deep');
    md(d)
      .split('\n')
      .forEach(l => expect(l).not.toBe('> '));
    expect(plain(d)).toBe('deep');
  });

  test('nested quote followed by a sibling paragraph keeps the blank quoted line', () => {
    const d: N[] = [blockquote(blockquote(paragraph(text('inner'))), paragraph(text('after')))];
    expect(md(d)).toBe('> > inner\n> \n> after');
  });
});
