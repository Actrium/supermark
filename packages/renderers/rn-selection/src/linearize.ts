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
  SupramarkTableNode,
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
      // Simplification: a single leading `> ` is emitted for the whole quote.
      // Per-line `> ` prefixing is deferred to a later milestone.
      return [
        syntaxUnit(makeUnitId(nodeId, 0), nodeId, blockquote, '> '),
        ...linearizeChildren(blockquote, path, options, listCtx),
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
    // Table unit-level recursion (cells/rows) is deferred to milestone 3/4; for
    // now the table is a single boundary followed by a break so it never sticks
    // to neighbouring blocks.
    case 'table':
      return [
        tableBoundary(node as SupramarkTableNode, nodeId),
        breakUnit(makeUnitId(nodeId, 1), nodeId, 'block', node),
      ];
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

function tableBoundary(node: SupramarkTableNode, nodeId: SelectionNodeId): SelectionBoundaryUnit {
  return {
    kind: 'boundary',
    unitId: makeUnitId(nodeId, 0),
    nodeId,
    node,
    reason: 'table',
  };
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
