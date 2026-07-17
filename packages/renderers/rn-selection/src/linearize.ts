import type {
  SupramarkBreakNode,
  SupramarkCodeNode,
  SupramarkContainerNode,
  SupramarkDiagramNode,
  SupramarkHeadingNode,
  SupramarkInlineCodeNode,
  SupramarkListItemNode,
  SupramarkListNode,
  SupramarkMathBlockNode,
  SupramarkMathInlineNode,
  SupramarkNode,
  SupramarkParentNode,
  SupramarkRootNode,
  SupramarkTableCellNode,
  SupramarkTableNode,
  SupramarkTextNode,
} from '@supramark/core';
import type {
  SelectionContext,
  SelectionPathSegment,
  SelectionSourceRange,
  SelectionUnit,
} from './model';
import type { SelectionProvider } from './providers';

export interface LinearizeSelectionOptions extends SelectionContext {
  providers?: readonly SelectionProvider[];
  nodeId?: (node: SupramarkNode, path: readonly SelectionPathSegment[]) => string;
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
  options: LinearizeSelectionOptions
): SelectionUnit[] {
  const nodeId = resolveNodeId(node, path, options);
  const provider = options.providers?.find(candidate => candidate.match(node));
  const customUnits = provider?.getUnits?.(node, { ...options, nodeId });
  if (customUnits) return customUnits;

  switch (node.type) {
    case 'text': {
      const text = node as SupramarkTextNode;
      return [
        {
          kind: 'text',
          nodeId,
          text: text.value,
          node,
          sourceRange: getSourceRange(node),
        },
      ];
    }
    case 'paragraph':
      return withTrailingBlockBreak(linearizeChildren(node, path, options), nodeId, node);
    case 'heading': {
      const heading = node as SupramarkHeadingNode;
      const prefix = '#'.repeat(heading.depth) + ' ';
      return withTrailingBlockBreak(
        [
          { kind: 'text', nodeId, text: prefix, node },
          ...linearizeChildren(heading, path, options),
        ],
        nodeId,
        node
      );
    }
    case 'strong':
    case 'emphasis':
    case 'link':
    case 'delete':
      return linearizeChildren(node as SupramarkParentNode, path, options);
    case 'inline_code': {
      const code = node as SupramarkInlineCodeNode;
      return [{ kind: 'text', nodeId, text: code.value, node, sourceRange: getSourceRange(node) }];
    }
    case 'break': {
      const lineBreak = node as SupramarkBreakNode;
      return [{ kind: 'break', nodeId, text: '\n', reason: 'line', node: lineBreak }];
    }
    case 'list':
      return linearizeList(node as SupramarkListNode, path, options);
    case 'list_item':
      return linearizeListItem(node as SupramarkListItemNode, path, options);
    case 'code':
      return linearizeCodeBlock(node as SupramarkCodeNode, nodeId);
    case 'math_inline':
      return [mathAtom(node as SupramarkMathInlineNode, nodeId, false)];
    case 'math_block':
      return [
        mathAtom(node as SupramarkMathBlockNode, nodeId, true),
        { kind: 'break', nodeId, text: '\n', reason: 'block', node },
      ];
    case 'diagram':
      return [
        diagramAtom(node as SupramarkDiagramNode, nodeId),
        { kind: 'break', nodeId, text: '\n', reason: 'block', node },
      ];
    case 'table':
      return [tableBoundary(node as SupramarkTableNode, nodeId)];
    case 'table_cell':
      return linearizeChildren(node as SupramarkTableCellNode, path, options);
    case 'container':
      return [containerBoundary(node as SupramarkContainerNode, nodeId)];
    case 'input':
      return [{ kind: 'boundary', nodeId, node, reason: 'input' }];
    default:
      return [{ kind: 'boundary', nodeId, node, reason: 'unsupported' }];
  }
}

function linearizeChildren(
  node: SupramarkParentNode,
  path: readonly SelectionPathSegment[],
  options: LinearizeSelectionOptions
): SelectionUnit[] {
  return node.children.flatMap((child, index) =>
    linearizeNode(child, [...path, 'children', index], options)
  );
}

function linearizeList(
  list: SupramarkListNode,
  path: readonly SelectionPathSegment[],
  options: LinearizeSelectionOptions
): SelectionUnit[] {
  return list.children.flatMap((child, index) =>
    linearizeNode(child, [...path, 'children', index], {
      ...options,
      listDepth: ((options as { listDepth?: number }).listDepth ?? 0) + 1,
      orderedListStart: list.start ?? 1,
      orderedListIndex: index,
      orderedList: list.ordered,
    } as LinearizeSelectionOptions)
  );
}

function linearizeListItem(
  item: SupramarkListItemNode,
  path: readonly SelectionPathSegment[],
  options: LinearizeSelectionOptions
): SelectionUnit[] {
  const listContext = options as {
    listDepth?: number;
    orderedList?: boolean;
    orderedListStart?: number;
    orderedListIndex?: number;
  };
  const nodeId = resolveNodeId(item, path, options);
  const depth = Math.max(0, (listContext.listDepth ?? 1) - 1);
  const indent = '  '.repeat(depth);
  const marker = listContext.orderedList
    ? `${(listContext.orderedListStart ?? 1) + (listContext.orderedListIndex ?? 0)}. `
    : item.checked === true
      ? '- [x] '
      : item.checked === false
        ? '- [ ] '
        : '- ';

  return [
    { kind: 'text', nodeId, text: indent + marker, node: item },
    ...linearizeChildren(item, path, options),
    { kind: 'break', nodeId, text: '\n', reason: 'list-item', node: item },
  ];
}

function linearizeCodeBlock(code: SupramarkCodeNode, nodeId: string): SelectionUnit[] {
  const fence = '```';
  const info = code.lang ? code.lang + (code.meta ? ` ${code.meta}` : '') : '';
  const markdown = `${fence}${info}\n${code.value}\n${fence}`;
  return [
    {
      kind: 'text',
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
    { kind: 'break', nodeId, text: '\n', reason: 'block', node: code },
  ];
}

function mathAtom(
  node: SupramarkMathInlineNode | SupramarkMathBlockNode,
  nodeId: string,
  displayMode: boolean
): SelectionUnit {
  const value = node.value;
  return {
    kind: 'atom',
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

function diagramAtom(node: SupramarkDiagramNode, nodeId: string): SelectionUnit {
  const markdown = `\`\`\`${node.engine}\n${node.code}\n\`\`\``;
  return {
    kind: 'atom',
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

function tableBoundary(node: SupramarkTableNode, nodeId: string): SelectionUnit {
  return {
    kind: 'boundary',
    nodeId,
    node,
    reason: 'table',
  };
}

function containerBoundary(node: SupramarkContainerNode, nodeId: string): SelectionUnit {
  return {
    kind: 'boundary',
    nodeId,
    node,
    reason: 'container',
  };
}

function withTrailingBlockBreak(
  units: SelectionUnit[],
  nodeId: string,
  node: SupramarkNode
): SelectionUnit[] {
  return [...units, { kind: 'break', nodeId, text: '\n', reason: 'block', node }];
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
