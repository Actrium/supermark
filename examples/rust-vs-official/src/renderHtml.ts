import type { SupramarkNodeLike } from './types.ts';

/**
 * Render a Supramark AST v2 root to HTML.
 *
 * This mirrors `tests/markdown-conformance/lib/semantic/ast-semantics.mjs`
 * (the reference renderer the CommonMark conformance harness uses), so the
 * page compares the Rust parser's AST output against the official expected
 * HTML on the same terms the CI conformance run does.
 */
export function renderHtml(root: SupramarkNodeLike): string {
  return renderChildren(root.children ?? []);
}

function renderChildren(children: SupramarkNodeLike[]): string {
  return children.map(renderNode).join('');
}

function renderNode(node: SupramarkNodeLike): string {
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
      const start =
        node.ordered && node.start !== undefined && node.start !== 1
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
      const title =
        node.title !== undefined ? ` title="${escapeAttribute(node.title)}"` : '';
      return `<a href="${escapeAttribute(node.url)}"${title}>${renderChildren(node.children ?? [])}</a>`;
    }
    case 'image': {
      const title =
        node.title !== undefined ? ` title="${escapeAttribute(node.title)}"` : '';
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

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}
