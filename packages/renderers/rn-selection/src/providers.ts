import type { SupramarkNode } from '@supramark/core';
import type {
  SelectionBehavior,
  SelectionContext,
  SelectionNodeDescriptor,
  SelectionNodeId,
  SelectionPayload,
  SelectionUnit,
} from './model';

export interface SelectionProvider<TNode extends SupramarkNode = SupramarkNode> {
  id: string;
  match(node: SupramarkNode): node is TNode;
  getBehavior?(node: TNode, context: SelectionContext): SelectionBehavior;
  getUnits?(
    node: TNode,
    context: SelectionContext & { nodeId: SelectionNodeId }
  ): SelectionUnit[];
  getPayload?(
    node: TNode,
    context: SelectionContext & { nodeId: SelectionNodeId }
  ): SelectionPayload | Promise<SelectionPayload>;
}

export function describeSelectionNode<TNode extends SupramarkNode>(
  node: TNode,
  nodeId: SelectionNodeId,
  context: SelectionContext,
  providers: readonly SelectionProvider[] = []
): SelectionNodeDescriptor<TNode> {
  const provider = providers.find(candidate => candidate.match(node)) as
    | SelectionProvider<TNode>
    | undefined;
  const behavior = provider?.getBehavior?.(node, context) ?? inferDefaultBehavior(node);
  return {
    node,
    nodeId,
    behavior,
    units: provider?.getUnits?.(node, { ...context, nodeId }),
  };
}

// NOTE: this classification must stay aligned with `linearize.ts`. The two are
// intentionally kept as one behaviour table today; a single source of truth is
// slated for milestone 4 when feature providers take over payload mapping.
export function inferDefaultBehavior(node: SupramarkNode): SelectionBehavior {
  switch (node.type) {
    case 'text':
    case 'paragraph':
    case 'heading':
    case 'list':
    case 'list_item':
    case 'strong':
    case 'emphasis':
    case 'inline_code':
    case 'link':
    case 'delete':
    case 'break':
    case 'code':
    case 'blockquote':
    case 'definition_list':
    case 'definition_item':
    case 'definition_term':
    case 'definition_description':
    case 'footnote_reference':
    case 'footnote_definition':
    case 'raw':
    case 'thematic_break':
      return 'text';
    case 'image':
    case 'math_inline':
    case 'math_block':
    case 'diagram':
      return 'atom';
    // Tables linearize to a boundary today (cell-level recursion is deferred to
    // milestone 3/4), so classify the whole table family as boundary to match.
    case 'table':
    case 'table_row':
    case 'table_cell':
    case 'container':
    case 'input':
      return 'boundary';
    default:
      return 'none';
  }
}
