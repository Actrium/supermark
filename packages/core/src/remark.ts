import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root as MdastRoot, Content as MdastContent } from 'mdast';
import type {
  SupramarkRootNode,
  SupramarkNode,
  SupramarkParagraphNode,
  SupramarkHeadingNode,
  SupramarkCodeNode,
  SupramarkListNode,
  SupramarkListItemNode,
  SupramarkTextNode,
  SupramarkDiagramNode,
} from './ast.js';
import { isDiagramFenceLanguage } from './syntax/fence.js';
import type { SupramarkParseContext, SupramarkParseOptions, SupramarkPlugin } from './plugin.js';

const processor = unified().use(remarkParse).use(remarkGfm);

function createRoot(): SupramarkRootNode {
  return {
    type: 'root',
    children: [],
  };
}

function mapMdastNode(node: MdastContent): SupramarkNode | null {
  switch (node.type) {
    case 'paragraph': {
      const paragraph: SupramarkParagraphNode = {
        type: 'paragraph',
        children: [],
      };
      paragraph.children = (node.children ?? [])
        .map(mapMdastInline)
        .flat()
        .filter(Boolean) as SupramarkNode[];
      return paragraph;
    }
    case 'heading': {
      const depth = node.depth ?? 1;
      const heading: SupramarkHeadingNode = {
        type: 'heading',
        depth: (depth >= 1 && depth <= 6 ? depth : 1) as SupramarkHeadingNode['depth'],
        children: [],
      };
      heading.children = (node.children ?? [])
        .map(mapMdastInline)
        .flat()
        .filter(Boolean) as SupramarkNode[];
      return heading;
    }
    case 'text': {
      const text: SupramarkTextNode = {
        type: 'text',
        value: node.value ?? '',
      };
      return text;
    }
    case 'inlineCode': {
      const code: SupramarkCodeNode = {
        type: 'code',
        value: node.value ?? '',
      };
      return code;
    }
    case 'code': {
      const lang = node.lang ?? undefined;
      const meta = node.meta ?? undefined;

      if (isDiagramFenceLanguage(lang)) {
        const diagram: SupramarkDiagramNode = {
          type: 'diagram',
          engine: (lang as string).toLowerCase(),
          code: node.value ?? '',
          meta: meta ? { raw: meta } : undefined,
        };
        return diagram;
      }

      const codeBlock: SupramarkCodeNode = {
        type: 'code',
        value: node.value ?? '',
        lang,
        meta,
      };
      return codeBlock;
    }
    case 'list': {
      const list: SupramarkListNode = {
        type: 'list',
        ordered: !!node.ordered,
        start: typeof node.start === 'number' ? node.start : null,
        tight: node.spread === undefined ? undefined : !node.spread,
        children: [],
      };
      list.children = node.children
        ?.map(item => mapMdastNode(item as MdastContent))
        .filter(Boolean) as SupramarkNode[];
      return list;
    }
    case 'listItem': {
      const listItem: SupramarkListItemNode = {
        type: 'list_item',
        checked: node.checked === undefined ? undefined : !!node.checked,
        children: [],
      };
      listItem.children = node.children
        ?.map(child => mapMdastNode(child as MdastContent))
        .filter(Boolean) as SupramarkNode[];
      return listItem;
    }
    default: {
      const anyNode = node as MdastContent & { children?: MdastContent[] };
      if (anyNode.children && anyNode.children.length > 0) {
        const flattened = anyNode.children
          .map(child => mapMdastNode(child))
          .filter(Boolean) as SupramarkNode[];
        if (flattened.length === 1) {
          return flattened[0];
        }
        const paragraph: SupramarkParagraphNode = {
          type: 'paragraph',
          children: flattened,
        };
        return paragraph;
      }
      return null;
    }
  }
}

function mapMdastInline(node: MdastContent): SupramarkNode[] {
  if (node.type === 'text' || node.type === 'inlineCode') {
    const mapped = mapMdastNode(node);
    return mapped ? [mapped] : [];
  }

  const anyNode = node as MdastContent & { children?: MdastContent[] };
  if (anyNode.children && anyNode.children.length > 0) {
    return anyNode.children.map(mapMdastInline).flat();
  }

  const mapped = mapMdastNode(node);
  return mapped ? [mapped] : [];
}

export async function parseMarkdownWithRemark(
  markdown: string,
  options: SupramarkParseOptions = {}
): Promise<SupramarkRootNode> {
  const mdast = processor.parse(markdown) as MdastRoot;
  const root: SupramarkRootNode = createRoot();

  root.children = mdast.children
    ?.map(child => mapMdastNode(child as MdastContent))
    .filter(Boolean) as SupramarkNode[];

  // 初始化插件上下文
  const context: SupramarkParseContext = {
    source: markdown,
    data: {}, // 插件共享数据存储
  };

  // 执行插件（注意：remark 暂不支持依赖排序，按顺序执行）
  // TODO: 将 sortPluginsByDependencies 移到独立文件并在这里使用
  const plugins: SupramarkPlugin[] = options.plugins ?? [];
  for (const plugin of plugins) {
    if (plugin.transform) {
      await plugin.transform(root, context);
    }
  }

  return root;
}
