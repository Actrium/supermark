import { describe, expect, test } from 'bun:test';
import type {
  SupramarkBlockquoteNode,
  SupramarkCodeNode,
  SupramarkContainerNode,
  SupramarkDefinitionListNode,
  SupramarkFootnoteDefinitionNode,
  SupramarkFootnoteReferenceNode,
  SupramarkHeadingNode,
  SupramarkImageNode,
  SupramarkListItemNode,
  SupramarkListNode,
  SupramarkNode,
  SupramarkParagraphNode,
  SupramarkRawNode,
  SupramarkStrongNode,
  SupramarkTextNode,
  SupramarkThematicBreakNode,
} from '@supramark/core';
import { linearizeForSelection } from '../linearize';
import type { SelectionAtomUnit, SelectionTextUnit, SelectionUnit } from '../model';

// AST literals only — no runtime import from @supramark/core.
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
const blockquote = (...children: N[]): SupramarkBlockquoteNode =>
  ({ type: 'blockquote', children }) as SupramarkBlockquoteNode;
const image = (url: string, alt: string, title?: string): SupramarkImageNode =>
  ({ type: 'image', url, alt, title }) as SupramarkImageNode;
const definitionList = (): SupramarkDefinitionListNode =>
  ({
    type: 'definition_list',
    children: [
      {
        type: 'definition_item',
        children: [
          { type: 'definition_term', children: [text('Term')] },
          { type: 'definition_description', children: [text('Desc')] },
        ],
      },
    ],
  }) as unknown as SupramarkDefinitionListNode;
const footnoteRef = (index: number, label?: string): SupramarkFootnoteReferenceNode =>
  ({
    type: 'footnote_reference',
    index,
    label,
    identifier: label ?? String(index),
  }) as SupramarkFootnoteReferenceNode;
const footnoteDef = (index: number, label: string, ...children: N[]): SupramarkFootnoteDefinitionNode =>
  ({
    type: 'footnote_definition',
    index,
    label,
    identifier: label,
    children,
  }) as SupramarkFootnoteDefinitionNode;
const raw = (value: string): SupramarkRawNode =>
  ({ type: 'raw', format: 'html', value, block: false }) as SupramarkRawNode;
const thematicBreak = (): SupramarkThematicBreakNode =>
  ({ type: 'thematic_break' }) as SupramarkThematicBreakNode;
const codeBlock = (value: string, lang?: string): SupramarkCodeNode =>
  ({ type: 'code', value, lang }) as SupramarkCodeNode;
const strong = (...children: N[]): SupramarkStrongNode =>
  ({ type: 'strong', children }) as SupramarkStrongNode;
const cell = (...children: N[]): N => ({ type: 'table_cell', children }) as unknown as N;
const row = (...cells: N[]): N => ({ type: 'table_row', children: cells }) as unknown as N;
const table = (
  align: ('left' | 'right' | 'center' | null)[] | undefined,
  ...rows: N[]
): N => ({ type: 'table', align, children: rows }) as unknown as N;

const textUnits = (units: SelectionUnit[]): SelectionTextUnit[] =>
  units.filter(u => u.kind === 'text') as SelectionTextUnit[];
const noUnsupported = (units: SelectionUnit[]): boolean =>
  units.every(u => !(u.kind === 'boundary' && u.reason === 'unsupported'));

describe('linearize node coverage', () => {
  test('paragraph produces serializable text + trailing break', () => {
    const units = linearizeForSelection([paragraph(text('hello'))]);
    expect(units.length).toBeGreaterThan(0);
    expect(noUnsupported(units)).toBe(true);
    expect(textUnits(units).some(u => u.text === 'hello')).toBe(true);
    expect(units[units.length - 1].kind).toBe('break');
  });

  test('heading emits a syntax unit, never a baked "#" text unit', () => {
    const units = linearizeForSelection([heading(2, text('Title'))]);
    // No visible text unit should carry the marker.
    expect(units.every(u => !(u.kind === 'text' && u.text.startsWith('#')))).toBe(true);
    // The marker lives in a payload-only syntax unit (empty text).
    const syntax = textUnits(units).find(u => u.text === '' && u.payload?.markdown === '## ');
    expect(syntax).toBeDefined();
    expect(textUnits(units).some(u => u.text === 'Title')).toBe(true);
  });

  test('unordered list keeps the marker out of plain text', () => {
    const units = linearizeForSelection([list(false, undefined, listItem(undefined, text('item')))]);
    expect(noUnsupported(units)).toBe(true);
    expect(textUnits(units).some(u => u.text === 'item')).toBe(true);
    expect(units.every(u => !(u.kind === 'text' && u.text.includes('- ')))).toBe(true);
  });

  test('blockquote / definition list / footnotes / raw / thematic break never fall to unsupported', () => {
    for (const node of [
      blockquote(text('quoted')),
      definitionList(),
      footnoteDef(1, '1', text('note')),
      raw('<br>'),
      thematicBreak(),
    ] as N[]) {
      const units = linearizeForSelection([node]);
      expect(units.length).toBeGreaterThan(0);
      expect(noUnsupported(units)).toBe(true);
    }
  });

  test('footnote_reference linearizes to a "[^n]" text unit', () => {
    const units = linearizeForSelection([paragraph(text('x'), footnoteRef(3))]);
    expect(textUnits(units).some(u => u.text === '[^3]')).toBe(true);
    expect(noUnsupported(units)).toBe(true);
  });

  test('a named footnote reference and definition share the same marker (regression)', () => {
    // Named footnote: label "note" differs from numeric index 1. The reference
    // marker must use the label so it round-trips with the definition marker.
    const refUnits = linearizeForSelection([paragraph(footnoteRef(1, 'note'))]);
    const defUnits = linearizeForSelection([footnoteDef(1, 'note', text('body'))]);
    expect(textUnits(refUnits).some(u => u.text === '[^note]')).toBe(true);
    expect(textUnits(defUnits).some(u => u.payload?.markdown === '[^note]: ')).toBe(true);
  });

  test('image is an inline atom carrying alt / markdown / metadata', () => {
    const units = linearizeForSelection([paragraph(text('see '), image('u.png', 'alt', 'cap'), text(' end'))]);
    const atom = units.find(u => u.kind === 'atom') as SelectionAtomUnit | undefined;
    expect(atom).toBeDefined();
    expect(atom?.label).toBe('image');
    expect(atom?.payload.plainText).toBe('alt');
    expect(atom?.payload.markdown).toBe('![alt](u.png)');
    expect(atom?.payload.metadata).toEqual({ url: 'u.png', alt: 'alt', title: 'cap' });
  });

  test('empty table linearizes to structural text units + break; container stays a boundary', () => {
    const tableUnits = linearizeForSelection([table(undefined)]);
    expect(tableUnits.every(u => u.kind !== 'boundary')).toBe(true);
    expect(tableUnits[tableUnits.length - 1].kind).toBe('break');
    expect(noUnsupported(tableUnits)).toBe(true);

    const containerUnits = linearizeForSelection([
      { type: 'container', name: 'note', children: [] } as unknown as SupramarkContainerNode,
    ]);
    expect(containerUnits.map(u => u.kind)).toEqual(['boundary', 'break']);
    expect((containerUnits[0] as { reason: string }).reason).toBe('container');
  });
});

describe('table linearization', () => {
  test('cells linearize to selectable text units', () => {
    const units = linearizeForSelection([
      table(undefined, row(cell(text('h1')), cell(text('h2'))), row(cell(text('a')), cell(text('b')))),
    ]);
    const texts = textUnits(units).map(u => u.text);
    expect(texts).toContain('h1');
    expect(texts).toContain('h2');
    expect(texts).toContain('a');
    expect(texts).toContain('b');
    expect(units.some(u => u.kind === 'break' && u.reason === 'table-row')).toBe(true);
    expect(textUnits(units).some(u => u.text === '\t')).toBe(true);
    expect(noUnsupported(units)).toBe(true);
  });

  test('nested inline formatting inside a cell is preserved', () => {
    const units = linearizeForSelection([table(undefined, row(cell(strong(text('b')))))]);
    expect(textUnits(units).some(u => u.text === 'b')).toBe(true);
    expect(textUnits(units).some(u => u.payload?.markdown === '**')).toBe(true);
  });

  test('unitIds stay globally unique across a table', () => {
    const units = linearizeForSelection([
      table(undefined, row(cell(text('h1')), cell(text('h2'))), row(cell(text('a')), cell(text('b')))),
    ]);
    const ids = units.map(u => u.unitId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('linearize unit identity', () => {
  test('every unitId is globally unique across a mixed document', () => {
    const units = linearizeForSelection([
      heading(1, text('Title')),
      paragraph(text('body')),
      list(true, undefined, listItem(undefined, text('one')), listItem(undefined, text('two'))),
      blockquote(text('quote')),
      codeBlock('const x = 1', 'js'),
      thematicBreak(),
      footnoteDef(1, '1', text('note')),
    ]);
    const ids = units.map(u => u.unitId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('a content unit and its trailing break share nodeId but not unitId', () => {
    const units = linearizeForSelection([codeBlock('code', 'ts')]);
    expect(units).toHaveLength(2);
    const [content, brk] = units;
    expect(content.nodeId).toBe(brk.nodeId);
    expect(content.unitId).not.toBe(brk.unitId);
  });
});
