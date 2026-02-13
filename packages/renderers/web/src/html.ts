import type {
  SupramarkRootNode,
  SupramarkNode,
  SupramarkParagraphNode,
  SupramarkHeadingNode,
  SupramarkCodeNode,
  SupramarkMathBlockNode,
  SupramarkInlineCodeNode,
  SupramarkListNode,
  SupramarkListItemNode,
  SupramarkDiagramNode,
  SupramarkTextNode,
  SupramarkStrongNode,
  SupramarkEmphasisNode,
  SupramarkLinkNode,
  SupramarkImageNode,
  SupramarkMathInlineNode,
} from '@supramark/core';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function astToHtml(root: SupramarkRootNode): string {
  return root.children.map(child => nodeToHtml(child)).join('');
}

function nodeToHtml(node: SupramarkNode): string {
  switch (node.type) {
    case 'paragraph':
      return `<p>${(node as SupramarkParagraphNode).children
        .map(child => nodeToHtml(child))
        .join('')}</p>`;
    case 'heading': {
      const heading = node as SupramarkHeadingNode;
      const depth = heading.depth || 1;
      const level = Math.min(Math.max(depth, 1), 6);
      return `<h${level}>${heading.children.map(child => nodeToHtml(child)).join('')}</h${level}>`;
    }
    case 'text':
      return escapeHtml((node as SupramarkTextNode).value || '');
    case 'strong': {
      const strong = node as SupramarkStrongNode;
      return `<strong>${strong.children.map(child => nodeToHtml(child)).join('')}</strong>`;
    }
    case 'emphasis': {
      const emphasis = node as SupramarkEmphasisNode;
      return `<em>${emphasis.children.map(child => nodeToHtml(child)).join('')}</em>`;
    }
    case 'inline_code': {
      const code = node as SupramarkInlineCodeNode;
      return `<code>${escapeHtml(code.value || '')}</code>`;
    }
    case 'math_inline': {
      const math = node as SupramarkMathInlineNode;
      // 与 React Web 一致：使用 data-suprimark-math 占位，供浏览器端 KaTeX 渲染
      return `<span data-suprimark-math="inline">${escapeHtml(math.value || '')}</span>`;
    }
    case 'link': {
      const link = node as SupramarkLinkNode;
      const href = escapeHtml(link.url || '');
      const title = link.title ? ` title="${escapeHtml(link.title)}"` : '';
      return `<a href="${href}"${title}>${link.children.map(child => nodeToHtml(child)).join('')}</a>`;
    }
    case 'image': {
      const image = node as SupramarkImageNode;
      const src = escapeHtml(image.url || '');
      const alt = image.alt ? ` alt="${escapeHtml(image.alt)}"` : '';
      const title = image.title ? ` title="${escapeHtml(image.title)}"` : '';
      return `<img src="${src}"${alt}${title} />`;
    }
    case 'break': {
      return '<br />';
    }
    case 'code': {
      const codeBlock = node as SupramarkCodeNode;
      const lang = codeBlock.lang ? ` class="language-${escapeHtml(codeBlock.lang)}"` : '';
      return `<pre><code${lang}>${escapeHtml(codeBlock.value || '')}</code></pre>`;
    }
    case 'math_block': {
      const mathBlock = node as SupramarkMathBlockNode;
      const value = escapeHtml(mathBlock.value || '');
      return `<div data-suprimark-math="block"><code>${value}</code></div>`;
    }
    case 'list': {
      const list = node as SupramarkListNode;
      const tag = list.ordered ? 'ol' : 'ul';
      const start = list.ordered && list.start != null ? ` start="${list.start.toString()}"` : '';
      return `<${tag}${start}>${list.children.map(child => nodeToHtml(child)).join('')}</${tag}>`;
    }
    case 'list_item': {
      const item = node as SupramarkListItemNode;
      return `<li>${item.children.map(child => nodeToHtml(child)).join('')}</li>`;
    }
    case 'diagram': {
      const diagram = node as SupramarkDiagramNode;
      const engine = escapeHtml(diagram.engine || '');
      return `<div data-suprimark-diagram="${engine}"><pre><code>${escapeHtml(
        diagram.code || ''
      )}</code></pre></div>`;
    }
    case 'root': {
      const root = node as SupramarkRootNode;
      return root.children.map(child => nodeToHtml(child)).join('');
    }
    default:
      return '';
  }
}
