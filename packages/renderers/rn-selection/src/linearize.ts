import type {
  SupramarkBlockquoteNode,
  SupramarkBreakNode,
  SupramarkCodeNode,
  SupramarkContainerNode,
  SupramarkDefinitionDescriptionNode,
  SupramarkDefinitionItemNode,
  SupramarkDefinitionListNode,
  SupramarkDefinitionTermNode,
  SupramarkDeleteNode,
  SupramarkDiagramNode,
  SupramarkEmphasisNode,
  SupramarkFootnoteDefinitionNode,
  SupramarkFootnoteReferenceNode,
  SupramarkHeadingNode,
  SupramarkImageNode,
  SupramarkInlineCodeNode,
  SupramarkInputNode,
  SupramarkLinkNode,
  SupramarkListItemNode,
  SupramarkListNode,
  SupramarkMathBlockNode,
  SupramarkMathInlineNode,
  SupramarkNode,
  SupramarkParentNode,
  SupramarkRawNode,
  SupramarkRootNode,
  SupramarkStrongNode,
  SupramarkTableCellNode,
  SupramarkTableNode,
  SupramarkTableRowNode,
  SupramarkTextNode,
  SupramarkThematicBreakNode,
} from '@supramark/core';
import type {
  SelectionAtomUnit,
  SelectionBoundaryUnit,
  SelectionBreakUnit,
  SelectionContext,
  SelectionNodeId,
  SelectionPathSegment,
  SelectionPayload,
  SelectionSourceRange,
  SelectionTextUnit,
  SelectionUnit,
} from './model';
import type { SelectionProvider } from './providers';

export interface LinearizeSelectionOptions extends SelectionContext {
  providers?: readonly SelectionProvider[];
  nodeId?: (node: SupramarkNode, path: readonly SelectionPathSegment[]) => string;
}

/**
 * List rendering context threaded explicitly through the recursion so it never
 * leaks into `SelectionContext`/`options` (which are exposed to providers).
 */
interface ListContext {
  depth: number;
  ordered: boolean;
  start: number;
  index: number;
}

export function linearizeForSelection(
  root: SupramarkRootNode | SupramarkNode[],
  options: LinearizeSelectionOptions = {}
): SelectionUnit[] {
  const nodes = Array.isArray(root) ? root : root.children;
  return nodes.flatMap((node, index) => linearizeNode(node, [index], options));
}

function linearizeNode(
  node: SupramarkNode,
  path: readonly SelectionPathSegment[],
  options: LinearizeSelectionOptions,
  listCtx?: ListContext
): SelectionUnit[] {
  const nodeId = resolveNodeId(node, path, options);
  const provider = options.providers?.find(candidate => candidate.match(node));
  const customUnits = provider?.getUnits?.(node, { ...options, nodeId });
  if (customUnits) return customUnits;

  switch (node.type) {
    case 'text': {
      const text = node as SupramarkTextNode;
      return [textUnit(makeUnitId(nodeId, 0), nodeId, text, text.value, getSourceRange(node))];
    }
    case 'paragraph':
      return [
        ...linearizeChildren(node as SupramarkParentNode, path, options, listCtx),
        breakUnit(makeUnitId(nodeId, 0), nodeId, 'block', node),
      ];
    case 'heading': {
      const heading = node as SupramarkHeadingNode;
      const prefix = '#'.repeat(heading.depth) + ' ';
      return [
        syntaxUnit(makeUnitId(nodeId, 0), nodeId, heading, prefix),
        ...linearizeChildren(heading, path, options),
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', heading),
      ];
    }
    case 'strong': {
      const strong = node as SupramarkStrongNode;
      return wrapInline(strong, nodeId, path, options, listCtx, '**', '**');
    }
    case 'emphasis': {
      const emphasis = node as SupramarkEmphasisNode;
      return wrapInline(emphasis, nodeId, path, options, listCtx, '_', '_');
    }
    case 'delete': {
      const del = node as SupramarkDeleteNode;
      return wrapInline(del, nodeId, path, options, listCtx, '~~', '~~');
    }
    case 'link': {
      const link = node as SupramarkLinkNode;
      const title = link.title ? ` "${link.title}"` : '';
      return wrapInline(link, nodeId, path, options, listCtx, '[', `](${link.url}${title})`);
    }
    case 'inline_code': {
      const code = node as SupramarkInlineCodeNode;
      const markdown = '`' + code.value + '`';
      return [
        {
          kind: 'text',
          unitId: makeUnitId(nodeId, 0),
          nodeId,
          text: code.value,
          node: code,
          payload: { markdown, source: markdown },
          sourceRange: getSourceRange(node),
        },
      ];
    }
    case 'break': {
      const lineBreak = node as SupramarkBreakNode;
      return [breakUnit(makeUnitId(nodeId, 0), nodeId, 'line', lineBreak)];
    }
    case 'blockquote': {
      const blockquote = node as SupramarkBlockquoteNode;
      // Per-line prefixing: a leading `> `, then another `> ` after every
      // interior break so each line is quoted without a dangling prefix on the
      // final line. The prefixes are text:'' syntax units (invisible to
      // plainText), so the quoted text itself stays clean.
      const inner = linearizeChildren(blockquote, path, options, listCtx);
      return [
        syntaxUnit(makeUnitId(nodeId, 0), nodeId, blockquote, '> '),
        ...prefixBlockquoteInterior(inner, nodeId, blockquote),
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', blockquote),
      ];
    }
    case 'list':
      return linearizeList(node as SupramarkListNode, path, options, listCtx);
    case 'list_item':
      return linearizeListItem(node as SupramarkListItemNode, path, options, listCtx);
    case 'code':
      return linearizeCodeBlock(node as SupramarkCodeNode, nodeId);
    case 'image': {
      const image = node as SupramarkImageNode;
      const alt = image.alt ?? '';
      const markdown = `![${alt}](${image.url})`;
      // Image is an inline atom with no trailing break so it can sit mid-paragraph.
      return [
        {
          kind: 'atom',
          unitId: makeUnitId(nodeId, 0),
          nodeId,
          label: 'image',
          node: image,
          payload: {
            plainText: alt,
            markdown,
            source: markdown,
            metadata: { url: image.url, alt, title: image.title },
          },
        },
      ];
    }
    case 'definition_list':
      return linearizeChildren(node as SupramarkDefinitionListNode, path, options, listCtx);
    case 'definition_item':
      return linearizeChildren(node as SupramarkDefinitionItemNode, path, options, listCtx);
    case 'definition_term': {
      const term = node as SupramarkDefinitionTermNode;
      return [
        ...linearizeChildren(term, path, options, listCtx),
        breakUnit(makeUnitId(nodeId, 0), nodeId, 'block', term),
      ];
    }
    case 'definition_description': {
      const description = node as SupramarkDefinitionDescriptionNode;
      return [
        syntaxUnit(makeUnitId(nodeId, 0), nodeId, description, ': '),
        ...linearizeChildren(description, path, options, listCtx),
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', description),
      ];
    }
    case 'footnote_reference': {
      const ref = node as SupramarkFootnoteReferenceNode;
      return [textUnit(makeUnitId(nodeId, 0), nodeId, ref, `[^${ref.label ?? ref.index}]`)];
    }
    case 'footnote_definition': {
      const def = node as SupramarkFootnoteDefinitionNode;
      const marker = `[^${def.label ?? def.index}]: `;
      return [
        syntaxUnit(makeUnitId(nodeId, 0), nodeId, def, marker),
        ...linearizeChildren(def, path, options, listCtx),
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', def),
      ];
    }
    case 'raw': {
      const raw = node as SupramarkRawNode;
      // `raw` reuses its literal value for every format.
      return [textUnit(makeUnitId(nodeId, 0), nodeId, raw, raw.value, getSourceRange(raw))];
    }
    case 'thematic_break': {
      const rule = node as SupramarkThematicBreakNode;
      return [
        syntaxUnit(makeUnitId(nodeId, 0), nodeId, rule, '---'),
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', rule),
      ];
    }
    case 'math_inline':
      return [mathAtom(node as SupramarkMathInlineNode, nodeId, false)];
    case 'math_block':
      return [
        mathAtom(node as SupramarkMathBlockNode, nodeId, true),
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', node),
      ];
    case 'diagram':
      return [
        diagramAtom(node as SupramarkDiagramNode, nodeId),
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', node),
      ];
    // Tables linearize into a fully compositional unit stream: per-cell inline
    // text units plus structural text units carrying the per-format separators
    // (markdown pipes / HTML tags). Every format reconstructs by concatenation.
    case 'table':
      return linearizeTable(node as SupramarkTableNode, nodeId, path, options);
    // Stray rows/cells (outside a table) recurse into their children so they
    // never fall through to the 'unsupported' boundary.
    case 'table_row':
    case 'table_cell':
      return linearizeChildren(node as SupramarkParentNode, path, options, listCtx);
    // Container payloads are owned by milestone 4 providers; keep a boundary
    // plus trailing break as the placeholder.
    case 'container':
      return [
        containerBoundary(node as SupramarkContainerNode, nodeId),
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', node),
      ];
    case 'input':
      return [
        { kind: 'boundary', unitId: makeUnitId(nodeId, 0), nodeId, node: node as SupramarkInputNode, reason: 'input' },
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', node),
      ];
    default:
      return [
        { kind: 'boundary', unitId: makeUnitId(nodeId, 0), nodeId, node, reason: 'unsupported' },
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', node),
      ];
  }
}

function linearizeChildren(
  node: SupramarkParentNode,
  path: readonly SelectionPathSegment[],
  options: LinearizeSelectionOptions,
  listCtx?: ListContext
): SelectionUnit[] {
  return node.children.flatMap((child, index) =>
    linearizeNode(child, [...path, 'children', index], options, listCtx)
  );
}

type InlineWrapNode =
  | SupramarkStrongNode
  | SupramarkEmphasisNode
  | SupramarkDeleteNode
  | SupramarkLinkNode;

function wrapInline(
  node: InlineWrapNode,
  nodeId: SelectionNodeId,
  path: readonly SelectionPathSegment[],
  options: LinearizeSelectionOptions,
  listCtx: ListContext | undefined,
  open: string,
  close: string
): SelectionUnit[] {
  return [
    syntaxUnit(makeUnitId(nodeId, 0), nodeId, node, open),
    ...linearizeChildren(node, path, options, listCtx),
    syntaxUnit(makeUnitId(nodeId, 1), nodeId, node, close),
  ];
}

function linearizeList(
  list: SupramarkListNode,
  path: readonly SelectionPathSegment[],
  options: LinearizeSelectionOptions,
  parentListCtx?: ListContext
): SelectionUnit[] {
  const depth = (parentListCtx?.depth ?? 0) + 1;
  const start = list.start ?? 1;
  // Ordered numbering counts list_item children, not the raw child index.
  let itemIndex = 0;
  return list.children.flatMap((child, index) => {
    const childListCtx: ListContext | undefined =
      child.type === 'list_item'
        ? { depth, ordered: list.ordered, start, index: itemIndex++ }
        : parentListCtx;
    return linearizeNode(child, [...path, 'children', index], options, childListCtx);
  });
}

function linearizeListItem(
  item: SupramarkListItemNode,
  path: readonly SelectionPathSegment[],
  options: LinearizeSelectionOptions,
  listCtx?: ListContext
): SelectionUnit[] {
  const nodeId = resolveNodeId(item, path, options);
  const depth = Math.max(0, (listCtx?.depth ?? 1) - 1);
  const indent = '  '.repeat(depth);
  const marker = listCtx?.ordered
    ? `${(listCtx.start ?? 1) + (listCtx.index ?? 0)}. `
    : item.checked === true
      ? '- [x] '
      : item.checked === false
        ? '- [ ] '
        : '- ';

  return [
    syntaxUnit(makeUnitId(nodeId, 0), nodeId, item, indent + marker),
    ...linearizeChildren(item, path, options, listCtx),
    breakUnit(makeUnitId(nodeId, 1), nodeId, 'list-item', item),
  ];
}

function linearizeCodeBlock(code: SupramarkCodeNode, nodeId: SelectionNodeId): SelectionUnit[] {
  const fence = '```';
  const info = code.lang ? code.lang + (code.meta ? ` ${code.meta}` : '') : '';
  const markdown = `${fence}${info}\n${code.value}\n${fence}`;
  // The canonical double-representation example: `text` is the raw code, while
  // the payload carries the fenced markdown/source.
  return [
    {
      kind: 'text',
      unitId: makeUnitId(nodeId, 0),
      nodeId,
      text: code.value,
      node: code,
      payload: {
        plainText: code.value,
        markdown,
        source: markdown,
        metadata: { lang: code.lang, meta: code.meta },
      },
      sourceRange: getSourceRange(code),
    },
    breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', code),
  ];
}

function mathAtom(
  node: SupramarkMathInlineNode | SupramarkMathBlockNode,
  nodeId: SelectionNodeId,
  displayMode: boolean
): SelectionAtomUnit {
  const value = node.value;
  return {
    kind: 'atom',
    unitId: makeUnitId(nodeId, 0),
    nodeId,
    label: displayMode ? 'math_block' : 'math_inline',
    node,
    payload: {
      plainText: value,
      markdown: displayMode ? `$$\n${value}\n$$` : `$${value}$`,
      source: value,
      metadata: { displayMode },
    },
  };
}

function diagramAtom(node: SupramarkDiagramNode, nodeId: SelectionNodeId): SelectionAtomUnit {
  const markdown = `\`\`\`${node.engine}\n${node.code}\n\`\`\``;
  return {
    kind: 'atom',
    unitId: makeUnitId(nodeId, 0),
    nodeId,
    label: `diagram:${node.engine}`,
    node,
    payload: {
      plainText: node.code,
      markdown,
      source: node.code,
      metadata: { engine: node.engine, meta: node.meta },
    },
  };
}

function linearizeTable(
  table: SupramarkTableNode,
  nodeId: SelectionNodeId,
  path: readonly SelectionPathSegment[],
  options: LinearizeSelectionOptions
): SelectionUnit[] {
  const units: SelectionUnit[] = [];
  const rows: Array<[SupramarkTableRowNode, number]> = [];
  table.children.forEach((child, i) => {
    if (child.type === 'table_row') rows.push([child as SupramarkTableRowNode, i]);
  });
  // Leading 0 arg keeps an empty table at columnCount 0 (avoids -Infinity).
  const columnCount = Math.max(table.align?.length ?? 0, ...rows.map(([r]) => r.children.length));
  let tseq = 0;
  const tuid = (): SelectionNodeId => makeUnitId(nodeId, tseq++);
  // Every structural unit of this table shares `nodeId` as its group id so a
  // partial selection degrades all of them together (see `richTextUnit`).
  const group = nodeId;
  units.push(richTextUnit(tuid(), nodeId, table, '', { html: '<table>\n' }, group));
  rows.forEach(([row, rowChildIdx], rowIndex) => {
    const rowPath = [...path, 'children', rowChildIdx];
    const rowNodeId = resolveNodeId(row, rowPath, options);
    const isHeader =
      rowIndex === 0 ||
      (row.children.length > 0 &&
        row.children.every(c => (c as SupramarkTableCellNode).header === true));
    const tag = isHeader ? 'th' : 'td';
    let rseq = 0;
    const ruid = (): SelectionNodeId => makeUnitId(rowNodeId, rseq++);
    units.push(
      richTextUnit(
        ruid(),
        rowNodeId,
        row,
        '',
        {
          markdown: '| ',
          source: '| ',
          html: `<tr><${tag}>`,
        },
        group
      )
    );
    let cellCount = 0;
    row.children.forEach((cell, cellIndex) => {
      if (cell.type !== 'table_cell') return;
      if (cellCount > 0) {
        units.push(
          richTextUnit(
            ruid(),
            rowNodeId,
            row,
            '\t',
            {
              markdown: ' | ',
              source: ' | ',
              html: `</${tag}><${tag}>`,
            },
            group
          )
        );
      }
      cellCount++;
      const cellPath = [...rowPath, 'children', cellIndex];
      units.push(...linearizeChildren(cell as SupramarkParentNode, cellPath, options));
    });
    units.push(
      richTextUnit(
        ruid(),
        rowNodeId,
        row,
        '',
        {
          markdown: ' |',
          source: ' |',
          html: `</${tag}></tr>`,
        },
        group
      )
    );
    units.push(breakUnit(ruid(), rowNodeId, 'table-row', row));
    // GFM has exactly one header row and one alignment row directly under it, so
    // emit the delimiter after the first row only. `isHeader` still drives the
    // `th`/`td` tag; using it here too would emit a second delimiter row for any
    // AST that marks more than one row all-header.
    if (rowIndex === 0) {
      const alignMd = buildAlignmentRow(table.align, columnCount) + '\n';
      units.push(
        richTextUnit(tuid(), nodeId, table, '', { markdown: alignMd, source: alignMd }, group)
      );
    }
  });
  units.push(richTextUnit(tuid(), nodeId, table, '', { html: '</table>' }, group));
  units.push(breakUnit(tuid(), nodeId, 'block', table));
  return units;
}

function buildAlignmentRow(align: SupramarkTableNode['align'], columns: number): string {
  const cells: string[] = [];
  for (let i = 0; i < columns; i++) {
    const a = align?.[i] ?? null;
    cells.push(a === 'left' ? ':---' : a === 'right' ? '---:' : a === 'center' ? ':---:' : '---');
  }
  return `| ${cells.join(' | ')} |`;
}

function containerBoundary(
  node: SupramarkContainerNode,
  nodeId: SelectionNodeId
): SelectionBoundaryUnit {
  return {
    kind: 'boundary',
    unitId: makeUnitId(nodeId, 0),
    nodeId,
    node,
    reason: 'container',
  };
}

/**
 * Empty-text syntax unit: invisible to `plainText`, only injects the
 * markdown/source syntax (heading marks, emphasis marks, list markers, ...).
 */
function syntaxUnit(
  unitId: SelectionNodeId,
  nodeId: SelectionNodeId,
  node: SupramarkNode,
  markdown: string
): SelectionTextUnit {
  return {
    kind: 'text',
    unitId,
    nodeId,
    text: '',
    node,
    payload: { markdown, source: markdown },
  };
}

/**
 * Rich text unit: carries both visible `text` and a per-format `payload`.
 * Used for table structural units where `text` is the plain-text separator
 * (e.g. `\t`/`''`) while the payload supplies the markdown pipes / HTML tags.
 *
 * `structuralGroup` ties every scaffolding unit of one table together so
 * `resolve.ts` can strip the syntax payload (leaving the plain `text`, already
 * valid TSV) when a selection covers only part of the table — otherwise a
 * partial slice would leak unbalanced pipes / tags into markdown / HTML.
 */
function richTextUnit(
  unitId: SelectionNodeId,
  nodeId: SelectionNodeId,
  node: SupramarkNode,
  text: string,
  payload: SelectionPayload,
  structuralGroup: SelectionNodeId
): SelectionTextUnit {
  return { kind: 'text', unitId, nodeId, text, node, payload, structuralGroup };
}

/**
 * Blockquote per-line prefixing: emit each inner unit verbatim, and after every
 * interior break that still has quoted content ahead of it insert a `> ` syntax
 * unit so the following line is quoted too. A `> ` only makes sense as the
 * prefix of a following line, so trailing breaks (a nested quote's own block
 * break, or any run of breaks after the last content unit) get none — otherwise
 * a pure-nested quote emits a dangling empty `> ` line. unitIds 0/1 are reserved
 * for the leading prefix and trailing block break, so inserted prefixes start at 2.
 */
function prefixBlockquoteInterior(
  inner: SelectionUnit[],
  nodeId: SelectionNodeId,
  node: SupramarkBlockquoteNode
): SelectionUnit[] {
  let lastContentIndex = -1;
  for (let j = inner.length - 1; j >= 0; j--) {
    if (inner[j].kind !== 'break') {
      lastContentIndex = j;
      break;
    }
  }
  const out: SelectionUnit[] = [];
  let seq = 2;
  inner.forEach((unit, i) => {
    out.push(unit);
    if (unit.kind === 'break' && i < lastContentIndex) {
      out.push(syntaxUnit(makeUnitId(nodeId, seq++), nodeId, node, '> '));
    }
  });
  return out;
}

/**
 * Plain-text content unit: `text` is the visible text and there is no payload,
 * so the serializer falls back to `text` for markdown/html/source.
 */
function textUnit(
  unitId: SelectionNodeId,
  nodeId: SelectionNodeId,
  node: SupramarkNode,
  text: string,
  sourceRange?: SelectionSourceRange
): SelectionTextUnit {
  return {
    kind: 'text',
    unitId,
    nodeId,
    text,
    node,
    sourceRange,
  };
}

function breakUnit(
  unitId: SelectionNodeId,
  nodeId: SelectionNodeId,
  reason: SelectionBreakUnit['reason'],
  node?: SupramarkNode
): SelectionBreakUnit {
  return { kind: 'break', unitId, nodeId, text: '\n', reason, node };
}

/**
 * Build a globally unique unit id. `localIdx` is the 0-based position of the
 * unit among the units that share `nodeId`, in emission order (content unit
 * first, then any prefix/marker/break units).
 */
function makeUnitId(nodeId: SelectionNodeId, localIdx: number): SelectionNodeId {
  return `${nodeId}#${localIdx}`;
}

function resolveNodeId(
  node: SupramarkNode,
  path: readonly SelectionPathSegment[],
  options: LinearizeSelectionOptions
): string {
  if (options.nodeId) return options.nodeId(node, path);
  const range = getSourceRange(node);
  if (range?.startUtf16 !== undefined && range.endUtf16 !== undefined) {
    return `pos:${range.startUtf16}-${range.endUtf16}`;
  }
  return `path:${path.join('/')}`;
}

function getSourceRange(node: SupramarkNode): SelectionSourceRange | undefined {
  const position = node.position;
  if (!position) return undefined;
  return {
    startUtf16: position.start.utf16_offset,
    endUtf16: position.end.utf16_offset,
    startByte: position.start.byte_offset,
    endByte: position.end.byte_offset,
  };
}
