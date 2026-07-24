import { htmlToSemanticTree } from './html-semantics.mjs';

export function astToSemanticTree(root) {
  return htmlToSemanticTree(astToHtml(root));
}

export function astToHtml(root) {
  return renderChildren(root.children ?? []);
}

function renderChildren(children) {
  return children.map(renderNode).join('');
}

function renderNode(node) {
  switch (node.type) {
    case 'root':
      return renderChildren(node.children ?? []);
    case 'paragraph':
      return `<p>${renderChildren(node.children ?? [])}</p>\n`;
    case 'heading':
      return `<h${node.depth}>${renderChildren(node.children ?? [])}</h${node.depth}>\n`;
    case 'thematic_break':
      return '<hr />\n';
    case 'blockquote':
      return `<blockquote>\n${renderChildren(node.children ?? [])}</blockquote>\n`;
    case 'code': {
      const className = node.lang ? ` class="language-${escapeAttribute(node.lang)}"` : '';
      return `<pre><code${className}>${escapeText(ensureTrailingNewline(node.value ?? ''))}</code></pre>\n`;
    }
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      const start = node.ordered && node.start !== undefined && node.start !== 1
        ? ` start="${node.start}"`
        : '';
      return `<${tag}${start}>\n${renderChildren(node.children ?? [])}</${tag}>\n`;
    }
    case 'list_item':
      return `<li>${renderChildren(node.children ?? [])}</li>\n`;
    case 'text':
      return escapeText(node.value ?? '');
    case 'strong':
      return `<strong>${renderChildren(node.children ?? [])}</strong>`;
    case 'emphasis':
      return `<em>${renderChildren(node.children ?? [])}</em>`;
    case 'inline_code':
      return `<code>${escapeText(node.value ?? '')}</code>`;
    case 'link': {
      const title = node.title !== undefined
        ? ` title="${escapeAttribute(node.title)}"`
        : '';
      return `<a href="${escapeAttribute(node.url)}"${title}>${renderChildren(node.children ?? [])}</a>`;
    }
    case 'image': {
      const title = node.title !== undefined
        ? ` title="${escapeAttribute(node.title)}"`
        : '';
      return `<img src="${escapeAttribute(node.url)}" alt="${escapeAttribute(node.alt ?? '')}"${title} />`;
    }
    case 'break':
      return '<br />\n';
    case 'raw':
      return node.value ?? '';
    default:
      return `<supramark-unsupported data-node-type="${escapeAttribute(node.type)}"></supramark-unsupported>`;
  }
}

function escapeText(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function ensureTrailingNewline(value) {
  return value.endsWith('\n') ? value : `${value}\n`;
}
