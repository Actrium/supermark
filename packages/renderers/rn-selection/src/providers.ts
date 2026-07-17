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
      return 'text';
    case 'math_inline':
    case 'math_block':
    case 'diagram':
      return 'atom';
    case 'table':
    case 'table_row':
    case 'table_cell':
      return 'custom';
    case 'container':
    case 'input':
      return 'boundary';
    default:
      return 'none';
  }
}
