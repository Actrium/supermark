import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  SupramarkRootNode,
  SupramarkNode,
  SupramarkCodeNode,
  SupramarkDiagramNode,
  SupramarkContainerNode,
  SupramarkDefinitionItemNode,
  SupramarkDefinitionTermNode,
  SupramarkDefinitionDescriptionNode,
  SupramarkRawNode,
  SupramarkDiagramConfig,
  SupramarkConfig,
  SupramarkCodeHighlightResult,
  SupramarkCodeHighlighter,
  SupramarkSourceState,
} from '@supramark/core';
import { type DiagramRenderResult, type DiagramRenderService } from '@supramark/engines';
import { createWebDiagramEngine } from '@supramark/engines/web';
import {
  parse,
  expandOpaqueContainers,
  isFeatureEnabled,
  isDiagramFeatureEnabled,
  getFeatureOptionsAs,
  SUPRAMARK_ADMONITION_KINDS,
  shouldDeferDiagramRender,
} from '@supramark/core';
import {
  type SupramarkClassNames,
  mergeClassNames,
  tailwindClassNames,
  minimalClassNames,
} from './classNames.js';
import { DiagramBlock } from './DiagramBlock.js';
import { DiagramEngineContext } from './DiagramEngineProvider.js';
import { ErrorBoundary, type ErrorInfo, ErrorDisplay } from './ErrorBoundary.js';
import { MathBlockWeb, MathInlineWeb } from './MathBlockWeb.js';
import { SourceStateContext } from './SourceStateContext.js';

export interface ContainerRendererWeb {
  (args: {
    node: SupramarkContainerNode;
    key: number;
    classNames: SupramarkClassNames;
    config?: SupramarkConfig;
    renderNode: (node: SupramarkNode, key: number) => React.ReactNode;
    renderChildren: (children: SupramarkNode[]) => React.ReactNode;
  }): React.ReactNode;
}

export interface SupramarkWebProps {
  markdown: string;
  ast?: SupramarkRootNode;
  classNames?: SupramarkClassNames;
  theme?: 'tailwind' | 'minimal' | SupramarkClassNames;
  config?: SupramarkConfig;
  /** Whether the Markdown source may still receive appended streaming content. */
  sourceState?: SupramarkSourceState;
  onError?: (error: Error, errorInfo?: React.ErrorInfo) => void;
  errorFallback?: (error: ErrorInfo) => ReactNode;
  errorClassNamePrefix?: string;
  containerRenderers?: Record<string, ContainerRendererWeb>;
  codeHighlighter?: SupramarkCodeHighlighter;
  codeHighlightTheme?: string;
  onRenderStateChange?: (state: SupramarkRenderState) => void;
}

export interface SupramarkRenderState {
  pending: boolean;
  renderTasks: number;
  highlightTasks: number;
  engines: string[];
}

type RenderTask = {
  key: string;
  engine: string;
  code: string;
  options?: Record<string, unknown>;
};

type CodeHighlightTask = {
  key: string;
  code: string;
  lang?: string;
  meta?: string;
  theme?: string;
};

interface ParsedDocument {
  root: SupramarkRootNode;
  rendered: Map<string, DiagramRenderResult>;
  highlighted: Map<string, SupramarkCodeHighlightResult>;
  sourceState: SupramarkSourceState;
}

function getDefinitionTerms(item: SupramarkDefinitionItemNode): SupramarkDefinitionTermNode[] {
  return item.children.filter(
    (child): child is SupramarkDefinitionTermNode => child.type === 'definition_term'
  );
}

function getDefinitionDescriptions(
  item: SupramarkDefinitionItemNode
): SupramarkDefinitionDescriptionNode[] {
  return item.children.filter(
    (child): child is SupramarkDefinitionDescriptionNode => child.type === 'definition_description'
  );
}

const defaultDiagramEngine = createWebDiagramEngine();

interface WebDiagramNodeProps {
  node: SupramarkDiagramNode;
  classNames: SupramarkClassNames;
  rendered: Map<string, DiagramRenderResult>;
}

// Keeps receiving and engine-rendering states distinct for streamed diagram fences.
const WebDiagramNode: React.FC<WebDiagramNodeProps> = ({ node, classNames, rendered }) => {
  const sourceState = useContext(SourceStateContext);

  if (shouldDeferDiagramRender(node, sourceState)) {
    return (
      <div
        data-supramark-diagram={node.engine}
        data-supramark-diagram-state="receiving"
        className={classNames.diagram}
      >
        <pre className={classNames.diagramPre}>
          <code className={classNames.diagramCode}>正在接收图表（{node.engine}）…</code>
        </pre>
      </div>
    );
  }

  if (isPreRenderedDiagramEngine(node.engine)) {
    return (
      <DiagramBlock
        classNames={classNames}
        code={node.code}
        engine={node.engine}
        result={rendered.get(buildRenderKey(node.engine, node.code, node.meta))}
      />
    );
  }

  return (
    <div data-supramark-diagram={node.engine} className={classNames.diagram}>
      <pre className={classNames.diagramPre}>
        <code className={classNames.diagramCode}>{node.code}</code>
      </pre>
    </div>
  );
};

// Admonition 默认主题（仅在未给出自定义 className 时生效）。
// key 对应 SUPRAMARK_ADMONITION_KINDS：note / tip / info / warning / danger。
const ADMONITION_STYLES: Record<string, { border: string; background: string; icon: string }> = {
  note: { border: '#3b82f6', background: '#eff6ff', icon: 'ℹ️' },
  tip: { border: '#10b981', background: '#ecfdf5', icon: '💡' },
  info: { border: '#0ea5e9', background: '#f0f9ff', icon: 'ℹ️' },
  warning: { border: '#f59e0b', background: '#fffbeb', icon: '⚠️' },
  danger: { border: '#ef4444', background: '#fef2f2', icon: '⛔' },
};

export const Supramark: React.FC<SupramarkWebProps> = ({
  markdown,
  ast,
  classNames: customClassNames,
  theme,
  config,
  sourceState = 'complete',
  onError,
  errorFallback,
  errorClassNamePrefix = 'sm-error',
  containerRenderers,
  codeHighlighter,
  codeHighlightTheme,
  onRenderStateChange,
}) => {
  const diagramEngine = useContext(DiagramEngineContext) ?? defaultDiagramEngine;
  // Parsing, engine output, highlighting, and source state form one renderable source version.
  const [parsedDocument, setParsedDocument] = useState<ParsedDocument | null>(
    ast
      ? {
          root: ast,
          rendered: new Map(),
          highlighted: new Map(),
          sourceState,
        }
      : null
  );
  const [parseError, setParseError] = useState<ErrorInfo | null>(null);

  const mergedClassNames = useMemo(() => {
    let themeClassNames: SupramarkClassNames | undefined;

    if (typeof theme === 'string') {
      themeClassNames = theme === 'tailwind' ? tailwindClassNames : minimalClassNames;
    } else if (theme) {
      themeClassNames = theme;
    }

    return mergeClassNames({
      ...themeClassNames,
      ...customClassNames,
    });
  }, [customClassNames, theme]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        onRenderStateChange?.({
          pending: true,
          renderTasks: 0,
          highlightTasks: 0,
          engines: [],
        });

        const parsed = ast ?? (await parse(markdown, { config }));
        // Post-process：递归解析 opaque container 的 value。
        // 新 AST v2 的 opaque container children 为空，正文在 value（原始 markdown）。
        // Rust parser 不认 feature 插件 JS 侧注册的 registerContainerHook，
        // 把所有 :::xxx 当 opaque 处理。这里在主组件异步上下文里把 value 解析成
        // AST 子树填回 children，renderNode 就能正常渲染。
        await expandOpaqueContainers(parsed);
        const renderTasks = collectRenderTasks(parsed.children, config, sourceState);
        const highlightTasks = collectCodeHighlightTasks(
          parsed.children,
          config,
          codeHighlightTheme
        );
        const engines = [...new Set(renderTasks.map(task => task.engine))];

        if (!cancelled) {
          onRenderStateChange?.({
            pending: true,
            renderTasks: renderTasks.length,
            highlightTasks: highlightTasks.length,
            engines,
          });
        }

        const renderedMap = await preRenderAll(renderTasks, diagramEngine);
        const highlightedMap = await preHighlightAll(highlightTasks, codeHighlighter);

        if (!cancelled) {
          setParsedDocument({
            root: parsed,
            rendered: renderedMap,
            highlighted: highlightedMap,
            sourceState,
          });
          setParseError(null);
          onRenderStateChange?.({
            pending: false,
            renderTasks: renderTasks.length,
            highlightTasks: highlightTasks.length,
            engines,
          });
        }
      } catch (error) {
        if (!cancelled) {
          const err = error as Error;
          setParseError({
            type: 'parse',
            message: err.message || '解析 Markdown 失败',
            details: err.toString(),
            stack: err.stack,
          });
          setParsedDocument(null);
          onRenderStateChange?.({
            pending: false,
            renderTasks: 0,
            highlightTasks: 0,
            engines: [],
          });
          if (onError) {
            onError(err);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    markdown,
    ast,
    config,
    diagramEngine,
    onError,
    codeHighlighter,
    codeHighlightTheme,
    onRenderStateChange,
    sourceState,
  ]);

  const mergedContainerRenderers = useMemo(() => {
    return containerRenderers ?? {};
  }, [containerRenderers]);

  if (parseError) {
    if (errorFallback) {
      return <>{errorFallback(parseError)}</>;
    }
    return (
      <div>
        <ErrorDisplay error={parseError} classNamePrefix={errorClassNamePrefix} />
        <pre className={mergedClassNames.codeBlock}>
          <code>{markdown}</code>
        </pre>
      </div>
    );
  }

  if (!parsedDocument) {
    return null;
  }

  return (
    <ErrorBoundary
      onError={onError}
      fallback={errorFallback}
      classNamePrefix={errorClassNamePrefix}
    >
      <SourceStateContext.Provider value={parsedDocument.sourceState}>
        <div className={mergedClassNames.root}>
          {mergeRawNodes(
            parsedDocument.root.children,
            (node, index) =>
              renderNode(
                node,
                index,
                mergedClassNames,
                parsedDocument.rendered,
                parsedDocument.highlighted,
                config,
                mergedContainerRenderers
              ),
            mergedClassNames,
            config
          )}
        </div>
      </SourceStateContext.Provider>
    </ErrorBoundary>
  );
};

const RAW_ATTR_MAP: Record<string, string> = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  cellpadding: 'cellPadding',
  cellspacing: 'cellSpacing',
  contenteditable: 'contentEditable',
  crossorigin: 'crossOrigin',
  datetime: 'dateTime',
  usemap: 'useMap',
};

function parseRawAttrs(attrPart: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrPart)) !== null) {
    const name = m[1];
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    const mapped = RAW_ATTR_MAP[name.toLowerCase()] ?? name;
    attrs[mapped] = val;
  }
  return attrs;
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/"/g, '&quot;');
}

// React's component model emits one DOM element per node, so it cannot express
// raw HTML fragments the browser's tree-construction stage would normally own:
// HTML comments, CDATA, processing instructions, bare open/close tags, or
// multi-tag blocks. `RawHtml` injects such a value by parsing it through a
// `<template>` element and splicing the resulting nodes in place of a hidden
// placeholder span. The placeholder is removed in a layout effect (before the
// host reads innerHTML) and re-attached on cleanup so React's unmount can
// remove it without touching a detached node. Real-browser only: the template
// API is unavailable in SSR/non-DOM environments, where the value is dropped.
function RawHtml({ value }: { value: string }): React.ReactNode {
  const ref = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentNode;
    if (!parent) return;
    const doc = el.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.createElement !== 'function') return;
    const template = doc.createElement('template');
    template.innerHTML = value;
    parent.insertBefore(template.content, el);
    el.remove();
    return () => {
      // Re-attach the placeholder so React's unmount removeChild finds it
      // where it expects; this node is transient (never read back).
      if (!el.parentNode) {
        try {
          parent.appendChild(el);
        } catch {
          // ignore — parent already torn down
        }
      }
    };
  }, [value]);
  return <span ref={ref} style={{ display: 'none' }} aria-hidden={true} />;
}

// CommonMark raw HTML may be an arbitrary fragment (open tag, close tag,
// comment, declaration). React's component model maps each node to one
// complete DOM element, so only a raw value that forms a single balanced
// element or self-closing tag can be rendered faithfully via a same-named
// host with dangerouslySetInnerHTML. Fragments fall through to null — the
// documented React limitation (cases involving comments, declarations, or
// split open/close tags stay unmatched in conformance runs).
function renderRawNode(node: SupramarkRawNode, key: number): React.ReactNode {
  const value = node.value ?? '';
  const tagMatch = value.match(/^<([a-zA-Z][\w-]*)/);
  if (!tagMatch) return React.createElement(RawHtml, { key, value });
  const tag = tagMatch[1].toLowerCase();
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp('^<' + escaped + '\\b([^>]*)>', 'i');
  const openM = value.match(openRe);
  if (!openM) return React.createElement(RawHtml, { key, value });
  const attrPart = openM[1];
  if (/\/\s*$/.test(attrPart)) {
    return React.createElement(tag, {
      key,
      ...parseRawAttrs(attrPart.replace(/\/\s*$/, '')),
    });
  }
  const closeRe = new RegExp('</' + escaped + '\\s*>\\s*$', 'i');
  const closeM = value.match(closeRe);
  if (!closeM) {
    // Unbalanced. If the value carries content after the open tag (e.g.
    // `<div>\nfoo`), render a same-named host with that content as innerHTML
    // (the HTML parser auto-closes it). A bare open tag with no content is
    // handled by mergeRawNodes (it absorbs following siblings); inline bare
    // open tags outside a merge context still render as an empty host.
    const tail = value.slice(openM[0].length);
    const attrs = parseRawAttrs(attrPart);
    if (tail.trim()) {
      // A tail that itself carries markup (a stray close tag, or trailing
      // content after a balanced pair) is a fragment a single host's
      // innerHTML context would mis-parse — `<div></div>\n…` would swallow
      // the stray `</div>`. Emit it verbatim so the browser's root
      // tree-construction owns the structure.
      if (tail.includes('<')) {
        return React.createElement(RawHtml, { key, value });
      }
      if (tag.toLowerCase() === 'textarea') {
        return React.createElement(tag, { key, ...attrs, defaultValue: tail });
      }
      return React.createElement(tag, {
        key,
        ...attrs,
        dangerouslySetInnerHTML: { __html: tail },
      });
    }
    if (!node.block) {
      return React.createElement(tag, { key, ...attrs });
    }
    return React.createElement(RawHtml, { key, value });
  }
  const inner = value.slice(openM[0].length, value.length - closeM[0].length);
  const attrs = parseRawAttrs(attrPart);
  // React rejects dangerouslySetInnerHTML on <textarea> (it models content as
  // a controlled value), so inject the raw inner text as children instead.
  if (tag.toLowerCase() === 'textarea') {
    return React.createElement(tag, { key, ...attrs, defaultValue: inner });
  }
  return React.createElement(tag, {
    key,
    ...attrs,
    dangerouslySetInnerHTML: { __html: inner },
  });
}

// Classify a raw value as a lone open-tag fragment — a value that is exactly
// a `<tag ...>` (optionally trailing whitespace), with no content and no
// matching close tag. Returns {tag, attrPart} or null. Null covers comments,
// declarations, self-closing tags, balanced elements, and open-tag-with-
// content values (e.g. `<div>\nfoo`); those are handled by renderRawNode.
function rawOpenTagFragment(value: string): { tag: string; attrPart: string } | null {
  const m = value.match(/^<([a-zA-Z][\w-]*)\b([^>]*)>\s*$/);
  if (!m) return null;
  if (/\/\s*$/.test(m[2])) return null;
  return { tag: m[1].toLowerCase(), attrPart: m[2] };
}

function rawCloseTagName(value: string): string | null {
  const m = value.match(/^<\/([a-zA-Z][\w-]*)\s*>/);
  return m ? m[1].toLowerCase() : null;
}

// CommonMark can split one logical HTML element across multiple raw sibling
// nodes — an open-tag raw, the markdown-rendered children, then a close-tag
// raw. React's component model can't emit a bare fragment, so we merge such
// runs into a single same-named host element whose children are the rendered
// siblings between the open and close tags. An open-tag fragment with no
// matching close tag in its siblings absorbs everything to the end of the
// run (the HTML parser would auto-close it there). Balanced/self-closing
// raw nodes and comments are left to renderRawNode / the comment path.
function mergeRawNodes(
  children: SupramarkNode[],
  renderSingle: (node: SupramarkNode, key: number) => React.ReactNode,
  classNames?: SupramarkClassNames,
  config?: SupramarkConfig
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < children.length) {
    const node = children[i];
    if (node?.type === 'raw') {
      const rawNode = node;
      const value = rawNode.value ?? '';
      const open = rawOpenTagFragment(value);
      if (open) {
        const tagLower = open.tag.toLowerCase();
        let closeIdx = -1;
        for (let j = i + 1; j < children.length; j++) {
          const sib = children[j];
          if (
            sib.type === 'raw' &&
            rawCloseTagName(sib.value ?? '') === tagLower
          ) {
            closeIdx = j;
            break;
          }
        }
        const attrs = parseRawAttrs(open.attrPart);
        if (closeIdx >= 0) {
          const inner = children.slice(i + 1, closeIdx);
          // When the wrapped children are block-level, emit the whole
          // element verbatim: cmark emits block-boundary newlines inside the
          // container (e.g. `<del>\n<p>…</p>\n</del>`) that the reference
          // HTML relies on, and a React host element drops them.
          if (inner.some(hasBlockChild) && classNames) {
            const serialized = serializeBlocksToHtml(inner, classNames, config);
            const closeValue =
              (children[closeIdx] as SupramarkRawNode).value ?? '';
            if (serialized !== null) {
              result.push(
                React.createElement(RawHtml, {
                  key: i,
                  value: value + serialized + closeValue,
                })
              );
              i = closeIdx + 1;
              continue;
            }
          }
          result.push(
            React.createElement(
              open.tag,
              { key: i, ...attrs },
              mergeRawNodes(inner, renderSingle, classNames, config)
            )
          );
          i = closeIdx + 1;
          continue;
        }
        // Bare open tag with no matching close sibling: fall through to the
        // per-node renderer (RawHtml emits the literal fragment so the
        // browser's HTML parser owns tree construction / auto-closing).
      } else {
        // Unclosed block-container open tag (e.g. `<div>\n*foo*\n` or
        // `  <div>\n`): cmark leaves it unclosed and the reference HTML
        // relies on the final parser folding following blocks into the open
        // container. Absorb following siblings into one verbatim RawHtml so
        // the browser's root tree-construction owns the folding. Only when
        // every following sibling serializes to static HTML.
        if (unclosedBlockContainerOpen(value, rawNode.block) && classNames) {
          const following = children.slice(i + 1);
          const serialized = serializeBlocksToHtml(
            following,
            classNames,
            config
          );
          if (serialized !== null) {
            result.push(
              React.createElement(RawHtml, { key: i, value: value + serialized })
            );
            i = children.length;
            continue;
          }
        }
      }
    }
    result.push(renderSingle(node, i));
    i++;
  }
  return result;
}

const INLINE_NODE_TYPES = new Set<SupramarkNode['type']>([
  'text',
  'strong',
  'emphasis',
  'delete',
  'inline_code',
  'math_inline',
  'link',
  'image',
  'break',
  'footnote_reference',
]);

// CommonMark separates a list item's children with a newline at every block
// boundary (inline→block, block→inline, block→block). Between two inline
// nodes (one inline run) there is no separator. Only the inline↔block
// newlines survive semantic normalization (they attach to adjacent text),
// so emitting them here matches the expected DOM without affecting the
// already-passing compact block→block cases.
function renderListItemChildren(
  children: SupramarkNode[],
  classNames: SupramarkClassNames,
  rendered: Map<string, DiagramRenderResult>,
  highlighted: Map<string, SupramarkCodeHighlightResult>,
  config: SupramarkConfig | undefined,
  containerRenderers: Record<string, ContainerRendererWeb> | undefined
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  children.forEach((child, index) => {
    if (index > 0) {
      const prev = children[index - 1];
      const bothInline =
        INLINE_NODE_TYPES.has(prev.type) && INLINE_NODE_TYPES.has(child.type);
      if (!bothInline) result.push('\n');
    }
    result.push(
      renderNode(child, index, classNames, rendered, highlighted, config, containerRenderers)
    );
  });
  return result;
}

function renderNode(
  node: SupramarkNode,
  key: number,
  classNames: SupramarkClassNames,
  rendered: Map<string, DiagramRenderResult>,
  highlighted: Map<string, SupramarkCodeHighlightResult>,
  config?: SupramarkConfig,
  containerRenderers?: Record<string, ContainerRendererWeb>
): React.ReactNode {
  switch (node.type) {
    case 'paragraph': {
      // When a paragraph contains raw HTML inline, emit the whole paragraph
      // as a literal `<p>…</p>\n` string at the root (via RawHtml) so the
      // browser's tree-construction owns active formatting element
      // reconstruction across the `</p>` boundary. cmark outputs such
      // paragraphs verbatim, and the reference HTML's unclosed-`<a>` leak
      // into trailing whitespace only reproduces when the parser sees the
      // `</p>` and the trailing `\n` in one root fragment — a React `<p>`
      // element closes its innerHTML at the element edge and cannot.
      const rawHtml = inlineNodesToHtml(node.children, classNames, config);
      if (rawHtml !== null) {
        const classAttr = classNames.paragraph
          ? ` class="${escapeHtmlAttr(classNames.paragraph)}"`
          : '';
        return <RawHtml key={key} value={`<p${classAttr}>${rawHtml}</p>\n`} />;
      }
      return (
        <p key={key} className={classNames.paragraph}>
          {renderInlineNodes(
            node.children,
            classNames,
            rendered,
            highlighted,
            config
          )}
        </p>
      );
    }
    case 'heading': {
      const heading = node;
      const content = renderInlineNodes(
        heading.children,
        classNames,
        rendered,
        highlighted,
        config
      );
      switch (heading.depth) {
        case 1:
          return (
            <h1 key={key} className={classNames.h1}>
              {content}
            </h1>
          );
        case 2:
          return (
            <h2 key={key} className={classNames.h2}>
              {content}
            </h2>
          );
        case 3:
          return (
            <h3 key={key} className={classNames.h3}>
              {content}
            </h3>
          );
        case 4:
          return (
            <h4 key={key} className={classNames.h4}>
              {content}
            </h4>
          );
        case 5:
          return (
            <h5 key={key} className={classNames.h5}>
              {content}
            </h5>
          );
        default:
          return (
            <h6 key={key} className={classNames.h6}>
              {content}
            </h6>
          );
      }
    }
    case 'blockquote': {
      const quote = node;
      return (
        <blockquote key={key} className={classNames.blockquote}>
          {mergeRawNodes(
            quote.children,
            (child, index) =>
              renderNode(child, index, classNames, rendered, highlighted, config, containerRenderers),
            classNames,
            config
          )}
        </blockquote>
      );
    }
    case 'thematic_break':
      return <hr key={key} className={classNames.thematicBreak} />;
    case 'code': {
      const codeBlock = node;
      return renderCodeBlock(codeBlock, key, classNames, highlighted);
    }
    case 'math_block': {
      const mathBlock = node;
      if (!isFeatureGroupEnabled(config, ['@supramark/feature-math'])) {
        return (
          <pre key={key} className={classNames.codeBlock}>
            <code className={classNames.code}>{mathBlock.value}</code>
          </pre>
        );
      }
      return (
        <MathBlockWeb
          key={key}
          classNames={classNames}
          value={mathBlock.value}
          result={rendered.get(buildRenderKey('math', mathBlock.value, { displayMode: true }))}
        />
      );
    }
    case 'list': {
      const list = node;
      const items = list.children.map((item, index) =>
        renderNode(item, index, classNames, rendered, highlighted, config, containerRenderers)
      );
      if (list.ordered) {
        const start =
          list.start !== undefined && list.start !== 1 ? list.start : undefined;
        return (
          <ol key={key} className={classNames.listOrdered} start={start}>
            {items}
          </ol>
        );
      }
      return (
        <ul key={key} className={classNames.listUnordered}>
          {items}
        </ul>
      );
    }
    case 'list_item': {
      const item = node;
      const isTaskListFeatureEnabled = isFeatureGroupEnabled(config, ['@supramark/feature-gfm']);
      const isTaskList = isTaskListFeatureEnabled && item.checked !== undefined;

      if (isTaskList) {
        return (
          <li key={key} className={classNames.taskListItem}>
            <input
              type="checkbox"
              checked={item.checked === true}
              disabled
              className={classNames.taskCheckbox}
            />
            {item.children.map((child, index) =>
              renderNode(
                child,
                index,
                classNames,
                rendered,
                highlighted,
                config,
                containerRenderers
              )
            )}
          </li>
        );
      }

      return (
        <li key={key} className={classNames.listItem}>
          {renderListItemChildren(
            item.children,
            classNames,
            rendered,
            highlighted,
            config,
            containerRenderers
          )}
        </li>
      );
    }
    case 'diagram': {
      const diagram = node;
      if (!isDiagramFeatureEnabled(config, diagram.engine, 'web:diagram-feature')) {
        return renderDisabledDiagram(diagram, key, classNames);
      }

      return (
        <WebDiagramNode
          key={key}
          node={diagram}
          classNames={classNames}
          rendered={rendered}
        />
      );
    }
    case 'container': {
      const container = node;
      const containerName = container.name;

      if (containerRenderers && containerRenderers[containerName]) {
        return containerRenderers[containerName]({
          node: container,
          key,
          classNames,
          config,
          renderNode: (nextNode, nextKey) =>
            renderNode(
              nextNode,
              nextKey,
              classNames,
              rendered,
              highlighted,
              config,
              containerRenderers
            ),
          renderChildren: children =>
            children.map((child, index) =>
              renderNode(
                child,
                index,
                classNames,
                rendered,
                highlighted,
                config,
                containerRenderers
              )
            ),
        });
      }

      // Admonition 可能以两种形态到达这里：
      //   1. 直接用 kind 作为 name（container.ts 内置解析）→ containerName ∈ SUPRAMARK_ADMONITION_KINDS
      //   2. 来自 @supramark/feature-admonition（feature 注册的 hook）→ name='admonition', data.kind=实际种类
      const kindFromData = container.data?.kind as string | undefined;
      const isAdmonition =
        SUPRAMARK_ADMONITION_KINDS.includes(
          containerName as (typeof SUPRAMARK_ADMONITION_KINDS)[number]
        ) ||
        (containerName === 'admonition' &&
          kindFromData !== undefined &&
          SUPRAMARK_ADMONITION_KINDS.includes(
            kindFromData as (typeof SUPRAMARK_ADMONITION_KINDS)[number]
          ));
      if (isAdmonition) {
        const kind = (kindFromData as string) || containerName;
        // title 优先使用 data.title（已剥离 kind 名），否则退回 params（可能含 kind 前缀）
        const title =
          (container.data?.title as string | undefined) ||
          (containerName === 'admonition' ? undefined : container.params);

        if (!isFeatureGroupEnabled(config, ['@supramark/feature-admonition'])) {
          return (
            <p key={key} className={classNames.paragraph}>
              {title ? <strong>{title}</strong> : null}
              {title ? ' ' : null}
              {container.children.map((child, index) =>
                renderNode(
                  child,
                  index,
                  classNames,
                  rendered,
                  highlighted,
                  config,
                  containerRenderers
                )
              )}
            </p>
          );
        }

        const adOptions =
          getFeatureOptionsAs<{ kinds?: string[] }>(config, '@supramark/feature-admonition') ?? {};
        if (
          Array.isArray(adOptions.kinds) &&
          adOptions.kinds.length > 0 &&
          !adOptions.kinds.includes(kind)
        ) {
          return (
            <p key={key} className={classNames.paragraph}>
              {title ? <strong>{title}</strong> : null}
              {title ? ' ' : null}
              {container.children.map((child, index) =>
                renderNode(
                  child,
                  index,
                  classNames,
                  rendered,
                  highlighted,
                  config,
                  containerRenderers
                )
              )}
            </p>
          );
        }

        const admonitionStyle = ADMONITION_STYLES[kind] ?? ADMONITION_STYLES.note;

        return (
          <div
            key={key}
            className={`admonition admonition-${kind} ${classNames.paragraph ?? ''}`.trim()}
            style={{
              margin: '1em 0',
              padding: '0.75em 1em',
              borderLeft: `4px solid ${admonitionStyle.border}`,
              background: admonitionStyle.background,
              borderRadius: 4,
            }}
          >
            {title ? (
              <p style={{ margin: '0 0 0.25em', color: admonitionStyle.border, fontWeight: 600 }}>
                <span aria-hidden="true" style={{ marginRight: 6 }}>
                  {admonitionStyle.icon}
                </span>
                {title}
              </p>
            ) : null}
            <div>
              {container.children.map((child, index) =>
                renderNode(
                  child,
                  index,
                  classNames,
                  rendered,
                  highlighted,
                  config,
                  containerRenderers
                )
              )}
            </div>
          </div>
        );
      }

      if (containerName === 'map') {
        const data = container.data || {};
        const center = data.center as [number, number] | undefined;
        const zoom = data.zoom as number | undefined;
        const marker = data.marker as { lat: number; lng: number } | undefined;

        const centerText = center ? `${center[0]}, ${center[1]}` : '未指定';
        const zoomText =
          typeof zoom === 'number' && !Number.isNaN(zoom) ? `缩放级别：${zoom}` : null;
        const markerText =
          marker && typeof marker.lat === 'number' && typeof marker.lng === 'number'
            ? `标记：${marker.lat}, ${marker.lng}`
            : null;

        return (
          <div key={key} className={classNames.paragraph}>
            <p>
              <strong>地图卡片</strong>
            </p>
            <p>
              中心：{centerText}
              {zoomText ? `；${zoomText}` : ''}
              {markerText ? `；${markerText}` : ''}
            </p>
          </div>
        );
      }

      return (
        <div
          key={key}
          className={`container container-${containerName} ${classNames.paragraph ?? ''}`.trim()}
        >
          {container.params && <div className="container-params">{container.params}</div>}
          <div className="container-content">
            {container.children.map((child, index) =>
              renderNode(
                child,
                index,
                classNames,
                rendered,
                highlighted,
                config,
                containerRenderers
              )
            )}
          </div>
        </div>
      );
    }
    case 'definition_list': {
      const list = node;
      const defOptions =
        getFeatureOptionsAs<{ compact?: boolean }>(config, '@supramark/feature-definition-list') ??
        {};
      const isCompact = defOptions.compact !== false;
      if (!isFeatureGroupEnabled(config, ['@supramark/feature-definition-list'])) {
        return (
          <div key={key} className={classNames.paragraph}>
            {list.children.map((item, index) => {
              const defItem = item;
              const terms = getDefinitionTerms(defItem);
              const descriptions = getDefinitionDescriptions(defItem);
              return (
                <div key={index} className={classNames.paragraph}>
                  {terms.map((term, termIndex) => (
                    <p key={`term-${termIndex}`} className={classNames.paragraph}>
                      <strong>
                        {renderInlineNodes(
                          term.children,
                          classNames,
                          rendered,
                          highlighted,
                          config
                        )}
                      </strong>
                    </p>
                  ))}
                  {descriptions.map((description, descriptionIndex) => (
                    <div key={`description-${descriptionIndex}`}>
                      {description.children.map((child, childIndex) =>
                        renderNode(
                          child,
                          childIndex,
                          classNames,
                          rendered,
                          highlighted,
                          config,
                          containerRenderers
                        )
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      }
      return (
        <dl key={key} className={classNames.paragraph}>
          {list.children.map((item, index) => {
            const defItem = item;
            const terms = getDefinitionTerms(defItem);
            const descriptions = getDefinitionDescriptions(defItem);
            return (
              <React.Fragment key={index}>
                {terms.map((term, termIndex) => (
                  <dt key={`term-${termIndex}`}>
                    <strong>
                      {renderInlineNodes(term.children, classNames, rendered, highlighted, config)}
                    </strong>
                  </dt>
                ))}
                {descriptions.map((description, idx) => (
                  <dd key={idx}>
                    {description.children.map((child, childIndex) =>
                      renderNode(
                        child,
                        childIndex,
                        classNames,
                        rendered,
                        highlighted,
                        config,
                        containerRenderers
                      )
                    )}
                    {isCompact ? null : <br />}
                  </dd>
                ))}
              </React.Fragment>
            );
          })}
        </dl>
      );
    }
    case 'table': {
      const table = node;
      return (
        <table key={key} className={classNames.table}>
          <tbody className={classNames.tableBody}>
            {table.children.map((row, index) =>
              renderNode(row, index, classNames, rendered, highlighted, config, containerRenderers)
            )}
          </tbody>
        </table>
      );
    }
    case 'table_row': {
      const row = node;
      return (
        <tr key={key} className={classNames.tableRow}>
          {row.children.map((cell, index) =>
            renderNode(cell, index, classNames, rendered, highlighted, config, containerRenderers)
          )}
        </tr>
      );
    }
    case 'table_cell': {
      const cell = node;
      const alignStyle = cell.align ? { textAlign: cell.align } : undefined;
      const content = renderInlineNodes(cell.children, classNames, rendered, highlighted, config);

      if (cell.header) {
        return (
          <th key={key} style={alignStyle} className={classNames.tableHeaderCell}>
            {content}
          </th>
        );
      }

      return (
        <td key={key} style={alignStyle} className={classNames.tableCell}>
          {content}
        </td>
      );
    }
    case 'footnote_definition': {
      const def = node;
      // def.children 是块级节点（通常是单个 paragraph），不能直接喂给 renderInlineNodes。
      // 常见形态 `[^1]: 内容。` → children = [{ type: 'paragraph', children: [text] }]
      // 做一次扁平化：若 children 就是单个 paragraph，把其 inline 内容直接铺出来；
      // 否则按块级节点渲染（允许多段脚注）。
      const soleParagraph =
        def.children.length === 1 && def.children[0]?.type === 'paragraph'
          ? def.children[0]
          : null;
      const body = soleParagraph
        ? renderInlineNodes(soleParagraph.children, classNames, rendered, highlighted, config)
        : def.children.map((child, index) =>
            renderNode(child, index, classNames, rendered, highlighted, config, containerRenderers)
          );
      if (!isFeatureGroupEnabled(config, ['@supramark/feature-footnote'])) {
        return soleParagraph ? (
          <p key={key} className={classNames.paragraph}>
            {body}
          </p>
        ) : (
          <div key={key} className={classNames.paragraph}>
            {body}
          </div>
        );
      }
      return soleParagraph ? (
        <p key={key} id={`fn-${def.index}`} className={classNames.paragraph}>
          <sup>[{def.index}]</sup> {body}
        </p>
      ) : (
        <div key={key} id={`fn-${def.index}`} className={classNames.paragraph}>
          <sup>[{def.index}]</sup> {body}
        </div>
      );
    }
    case 'text':
      return <React.Fragment key={key}>{node.value}</React.Fragment>;
    case 'strong':
    case 'emphasis':
    case 'delete':
    case 'inline_code':
    case 'math_inline':
    case 'link':
    case 'image':
    case 'break':
    case 'footnote_reference':
      // Rust parser 把 list_item.children 等场景的 inline 节点扁平铺开（非 paragraph 包裹），
      // renderNode 遍历到这些类型时委托给 renderInlineNode，避免走 default 返回 null 吞掉内容。
      return renderInlineNode(node, key, classNames, rendered, highlighted, config);
    case 'raw':
      return renderRawNode(node, key);
    default:
      return null;
  }
}

function renderCodeBlock(
  codeBlock: SupramarkCodeNode,
  key: number,
  classNames: SupramarkClassNames,
  highlighted: Map<string, SupramarkCodeHighlightResult>
): React.ReactNode {
  const highlight = highlighted.get(
    buildCodeHighlightKey(codeBlock.value, codeBlock.lang, codeBlock.meta)
  );
  const languageClass = codeBlock.lang ? `language-${codeBlock.lang}` : undefined;
  const codeClassName = [classNames.code, languageClass].filter(Boolean).join(' ') || undefined;

  if (!highlight) {
    return (
      <pre key={key} className={classNames.codeBlock}>
        <code className={codeClassName}>{codeBlock.value}</code>
      </pre>
    );
  }

  return (
    <pre key={key} className={classNames.codeBlock}>
      <code className={codeClassName} data-language={highlight.language ?? codeBlock.lang}>
        {highlight.lines.map((line, lineIndex) => (
          <React.Fragment key={lineIndex}>
            {line.tokens.map((token, tokenIndex) => (
              <span key={tokenIndex} style={codeTokenStyle(token)}>
                {token.text}
              </span>
            ))}
            {lineIndex < highlight.lines.length - 1 ? '\n' : null}
          </React.Fragment>
        ))}
      </code>
    </pre>
  );
}

function codeTokenStyle(token: {
  color?: string;
  backgroundColor?: string;
  fontStyle?: Array<'bold' | 'italic' | 'underline'>;
}): React.CSSProperties {
  const fontStyle = token.fontStyle ?? [];
  return {
    color: token.color,
    backgroundColor: token.backgroundColor,
    fontWeight: fontStyle.includes('bold') ? 'bold' : undefined,
    fontStyle: fontStyle.includes('italic') ? 'italic' : undefined,
    textDecoration: fontStyle.includes('underline') ? 'underline' : undefined,
  };
}

function renderInlineNodes(
  nodes: SupramarkNode[],
  classNames: SupramarkClassNames,
  rendered: Map<string, DiagramRenderResult>,
  highlighted: Map<string, SupramarkCodeHighlightResult>,
  config?: SupramarkConfig
): React.ReactNode {
  return mergeRawNodes(nodes, (node, index) =>
    renderInlineNode(node, index, classNames, rendered, highlighted, config)
  );
}

// Serialize a paragraph's inline children to a static HTML string when the run
// contains raw HTML. This is the only way to reproduce parse5's tree
// construction inside a `<p>` — an unclosed inline tag like `<a href="bar">`
// triggers active-formatting-element reconstruction at `</p>`, which React's
// element model (one closed DOM node per raw node) cannot express. Returns
// null when the run has no raw node or holds a child that cannot be statically
// serialized (math, footnote refs), so the caller falls back to the component
// model for that paragraph.
function inlineNodesToHtml(
  nodes: SupramarkNode[],
  classNames: SupramarkClassNames,
  config?: SupramarkConfig
): string | null {
  if (!nodes.some((n) => n.type === 'raw')) return null;
  return serializeInlineList(nodes, classNames, config);
}

function serializeInlineList(
  nodes: SupramarkNode[],
  classNames: SupramarkClassNames,
  config?: SupramarkConfig
): string | null {
  let out = '';
  for (const node of nodes) {
    const piece = serializeInlineNode(node, classNames, config);
    if (piece === null) return null;
    out += piece;
  }
  return out;
}

function serializeInlineNode(
  node: SupramarkNode,
  _classNames: SupramarkClassNames,
  config?: SupramarkConfig
): string | null {
  switch (node.type) {
    case 'text':
      return escapeHtmlText(node.value);
    case 'raw':
      return node.value ?? '';
    case 'strong': {
      const inner = serializeInlineList(node.children, _classNames, config);
      return inner === null ? null : `<strong>${inner}</strong>`;
    }
    case 'emphasis': {
      const inner = serializeInlineList(node.children, _classNames, config);
      return inner === null ? null : `<em>${inner}</em>`;
    }
    case 'inline_code':
      return `<code>${escapeHtmlText(node.value)}</code>`;
    case 'link': {
      const inner = serializeInlineList(node.children, _classNames, config);
      if (inner === null) return null;
      const title = node.title ? ` title="${escapeHtmlAttr(node.title)}"` : '';
      return `<a href="${escapeHtmlAttr(node.url)}"${title}>${inner}</a>`;
    }
    case 'image': {
      const title = node.title ? ` title="${escapeHtmlAttr(node.title)}"` : '';
      return `<img src="${escapeHtmlAttr(node.url)}" alt="${escapeHtmlAttr(node.alt ?? '')}"${title} />`;
    }
    case 'break':
      return '<br />\n';
    case 'delete': {
      const inner = serializeInlineList(node.children, _classNames, config);
      if (inner === null) return null;
      return isFeatureGroupEnabled(config, ['@supramark/feature-gfm'])
        ? `<del>${inner}</del>`
        : inner;
    }
    case 'math_inline':
    case 'footnote_reference':
    default:
      return null;
  }
}

const BLOCK_NODE_TYPES = new Set<SupramarkNode['type']>([
  'paragraph',
  'code',
  'heading',
  'blockquote',
  'list',
  'list_item',
  'thematic_break',
  'math_block',
]);

function hasBlockChild(node: SupramarkNode): boolean {
  return BLOCK_NODE_TYPES.has(node.type);
}

// Serialize block-level nodes to the static HTML string cmark emits. Used when
// raw HTML container nodes (unclosed `<div>`, or a `<del>…</del>` split across
// nodes) must fold following/inner blocks into one verbatim RawHtml value so
// the browser's root tree-construction owns the structure. Returns null for
// any block that cannot be statically serialized (math, tables, nested lists
// with task items), so the caller falls back to component rendering.
function serializeBlockToHtml(
  node: SupramarkNode,
  classNames: SupramarkClassNames,
  config?: SupramarkConfig
): string | null {
  switch (node.type) {
    case 'paragraph': {
      const inline = serializeInlineList(node.children, classNames, config);
      if (inline === null) return null;
      const cls = classNames.paragraph
        ? ` class="${escapeHtmlAttr(classNames.paragraph)}"`
        : '';
      return `<p${cls}>${inline}</p>\n`;
    }
    case 'code': {
      const lang = node.lang ?? '';
      const codeClass = lang ? ` class="language-${escapeHtmlAttr(lang)}"` : '';
      return `<pre><code${codeClass}>${escapeHtmlText(node.value)}</code></pre>\n`;
    }
    case 'raw':
      return node.value ?? '';
    case 'thematic_break':
      return '<hr />\n';
    case 'heading': {
      const inline = serializeInlineList(node.children, classNames, config);
      if (inline === null) return null;
      const tag = `h${node.depth}`;
      const clsKey = `h${node.depth}` as keyof SupramarkClassNames;
      const cls = classNames[clsKey];
      const clsAttr = cls ? ` class="${escapeHtmlAttr(cls)}"` : '';
      return `<${tag}${clsAttr}>${inline}</${tag}>\n`;
    }
    default:
      return null;
  }
}

function serializeBlocksToHtml(
  nodes: SupramarkNode[],
  classNames: SupramarkClassNames,
  config?: SupramarkConfig
): string | null {
  let out = '';
  for (const node of nodes) {
    const piece = serializeBlockToHtml(node, classNames, config);
    if (piece === null) return null;
    out += piece;
  }
  return out;
}

// Detect a block raw whose value is an open tag with no matching close tag in
// the value itself — e.g. `<div>\n*foo*\n` or `  <div>\n`. cmark leaves such a
// container unclosed and the reference HTML relies on the final parser folding
// following blocks into it. Used to absorb following siblings into one RawHtml.
function unclosedBlockContainerOpen(
  value: string,
  isBlock: boolean | undefined
): string | null {
  if (!isBlock) return null;
  const m = value.match(/^\s*<([a-zA-Z][\w-]*)\b/);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  if (/^\s*\//.test(value.trimStart())) return null;
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp('</' + escaped + '\\s*>', 'i').test(value)) return null;
  if (/\/\s*>\s*$/.test(value)) return null;
  return tag;
}

function renderInlineNode(
  node: SupramarkNode,
  key: number,
  classNames: SupramarkClassNames,
  rendered: Map<string, DiagramRenderResult>,
  highlighted: Map<string, SupramarkCodeHighlightResult>,
  config?: SupramarkConfig
): React.ReactNode {
  switch (node.type) {
    case 'text': {
      const textNode = node;
      return textNode.value;
    }
    case 'strong': {
      const strongNode = node;
      return (
        <strong key={key} className={classNames.strong}>
          {renderInlineNodes(strongNode.children, classNames, rendered, highlighted, config)}
        </strong>
      );
    }
    case 'emphasis': {
      const emphasisNode = node;
      return (
        <em key={key} className={classNames.emphasis}>
          {renderInlineNodes(emphasisNode.children, classNames, rendered, highlighted, config)}
        </em>
      );
    }
    case 'inline_code': {
      const codeNode = node;
      return (
        <code key={key} className={classNames.inlineCode}>
          {codeNode.value}
        </code>
      );
    }
    case 'math_inline': {
      const mathNode = node;
      if (!isFeatureGroupEnabled(config, ['@supramark/feature-math'])) {
        return mathNode.value;
      }
      return (
        <MathInlineWeb
          key={key}
          classNames={classNames}
          value={mathNode.value}
          result={rendered.get(buildRenderKey('math', mathNode.value, { displayMode: false }))}
        />
      );
    }
    case 'link': {
      const linkNode = node;
      return (
        <a key={key} href={linkNode.url} title={linkNode.title} className={classNames.link}>
          {renderInlineNodes(linkNode.children, classNames, rendered, highlighted, config)}
        </a>
      );
    }
    case 'image': {
      const imageNode = node;
      return (
        <img
          key={key}
          src={imageNode.url}
          alt={imageNode.alt}
          title={imageNode.title}
          className={classNames.image}
        />
      );
    }
    case 'break':
      // CommonMark serializes a hard line break as `<br />\n`; the trailing
      // newline becomes a significant text node when followed by inline text,
      // so emit it explicitly to match the expected DOM.
      return (
        <React.Fragment key={key}>
          <br />{'\n'}
        </React.Fragment>
      );
    case 'delete': {
      const deleteNode = node;
      if (!isFeatureGroupEnabled(config, ['@supramark/feature-gfm'])) {
        return renderInlineNodes(deleteNode.children, classNames, rendered, highlighted, config);
      }
      return (
        <del key={key} className={classNames.delete}>
          {renderInlineNodes(deleteNode.children, classNames, rendered, highlighted, config)}
        </del>
      );
    }
    case 'footnote_reference': {
      const ref = node;
      return (
        <sup key={key} className={classNames.inlineCode}>
          <a href={`#fn-${ref.index}`} className={classNames.link}>
            [{ref.index}]
          </a>
        </sup>
      );
    }
    case 'raw':
      return renderRawNode(node, key);
    default:
      return null;
  }
}

function collectRenderTasks(
  nodes: SupramarkNode[],
  config: SupramarkConfig | undefined,
  sourceState: SupramarkSourceState
): RenderTask[] {
  const tasks: RenderTask[] = [];

  function walk(list: SupramarkNode[]) {
    for (const node of list) {
      if (node.type === 'diagram') {
        const diagram = node;
        if (
          isPreRenderedDiagramEngine(diagram.engine) &&
          isDiagramFeatureEnabled(config, diagram.engine, 'web:diagram-feature') &&
          !shouldDeferDiagramRender(diagram, sourceState)
        ) {
          tasks.push({
            key: buildRenderKey(diagram.engine, diagram.code, diagram.meta),
            engine: normalizeRenderEngine(diagram.engine),
            code: diagram.code,
            options: buildDiagramRenderOptions(diagram.engine, diagram.meta, config?.diagram),
          });
        }
      } else if (node.type === 'math_block') {
        const mathBlock = node;
        if (isFeatureGroupEnabled(config, ['@supramark/feature-math'])) {
          tasks.push({
            key: buildRenderKey('math', mathBlock.value, { displayMode: true }),
            engine: 'math',
            code: mathBlock.value,
            options: { displayMode: true },
          });
        }
      } else if (node.type === 'math_inline') {
        const mathInline = node;
        if (isFeatureGroupEnabled(config, ['@supramark/feature-math'])) {
          tasks.push({
            key: buildRenderKey('math', mathInline.value, { displayMode: false }),
            engine: 'math',
            code: mathInline.value,
            options: { displayMode: false },
          });
        }
      }

      if ('children' in node && Array.isArray((node as { children?: SupramarkNode[] }).children)) {
        walk((node as { children: SupramarkNode[] }).children);
      }
    }
  }

  walk(nodes);
  return tasks;
}

function collectCodeHighlightTasks(
  nodes: SupramarkNode[],
  config?: SupramarkConfig,
  theme?: string
): CodeHighlightTask[] {
  if (!isFeatureGroupEnabled(config, ['@supramark/feature-code-highlight'])) {
    return [];
  }

  const tasks: CodeHighlightTask[] = [];

  function walk(list: SupramarkNode[]) {
    for (const node of list) {
      if (node.type === 'code') {
        const code = node;
        tasks.push({
          key: buildCodeHighlightKey(code.value, code.lang, code.meta),
          code: code.value,
          lang: code.lang,
          meta: code.meta,
          theme,
        });
      }

      if ('children' in node && Array.isArray((node as { children?: SupramarkNode[] }).children)) {
        walk((node as { children: SupramarkNode[] }).children);
      }
    }
  }

  walk(nodes);
  return tasks;
}

async function preRenderAll(
  tasks: RenderTask[],
  engine: DiagramRenderService
): Promise<Map<string, DiagramRenderResult>> {
  if (tasks.length === 0) {
    return new Map();
  }

  const unique = new Map<string, RenderTask>();
  for (const task of tasks) {
    if (!unique.has(task.key)) {
      unique.set(task.key, task);
    }
  }

  const taskList = [...unique.values()];
  const results = await Promise.all(
    taskList.map(task =>
      engine.render({
        engine: task.engine,
        code: task.code,
        options: task.options,
      })
    )
  );

  return new Map(taskList.map((task, index) => [task.key, results[index]]));
}

async function preHighlightAll(
  tasks: CodeHighlightTask[],
  highlighter?: SupramarkCodeHighlighter
): Promise<Map<string, SupramarkCodeHighlightResult>> {
  if (!highlighter || tasks.length === 0) {
    return new Map();
  }

  const unique = new Map<string, CodeHighlightTask>();
  for (const task of tasks) {
    if (!unique.has(task.key)) {
      unique.set(task.key, task);
    }
  }

  const entries = await Promise.all(
    [...unique.values()].map(async task => {
      try {
        const result = await highlighter({
          code: task.code,
          lang: task.lang,
          meta: task.meta,
          theme: task.theme,
        });
        return result ? ([task.key, result] as const) : null;
      } catch {
        return null;
      }
    })
  );

  return new Map(
    entries.filter(
      (entry): entry is readonly [string, SupramarkCodeHighlightResult] => entry !== null
    )
  );
}

function buildRenderKey(engine: string, code: string, options?: Record<string, unknown>): string {
  return `${normalizeRenderEngine(engine)}:${code}:${stableSerialize(options)}`;
}

function buildCodeHighlightKey(code: string, lang?: string, meta?: string): string {
  return `code:${lang ?? ''}:${meta ?? ''}:${code}`;
}

const PRE_RENDERED_DIAGRAM_ENGINES = new Set([
  'mermaid',
  'math',
  'dot',
  'graphviz',
  'echarts',
  'vega-lite',
  'vegalite',
  'vega',
  'chart',
  'chartjs',
  'plantuml',
  'd2',
]);

function normalizeRenderEngine(engine: string): string {
  const normalized = String(engine || '').toLowerCase();
  return PRE_RENDERED_DIAGRAM_ENGINES.has(normalized) ? normalized : 'mermaid';
}

function isPreRenderedDiagramEngine(engine: string): boolean {
  return PRE_RENDERED_DIAGRAM_ENGINES.has(String(engine || '').toLowerCase());
}

function buildDiagramRenderOptions(
  engine: string,
  meta: SupramarkDiagramNode['meta'],
  diagramConfig?: SupramarkDiagramConfig
): Record<string, unknown> | undefined {
  const base: Record<string, unknown> = {};
  const engineConfig = diagramConfig?.engines?.[engine];

  if (engineConfig) {
    if (typeof engineConfig.server === 'string') {
      base.server = engineConfig.server;
      base.plantumlServer = engineConfig.server;
    }
    if (typeof engineConfig.timeoutMs === 'number') {
      base.timeout = engineConfig.timeoutMs;
    }
    if (engineConfig.cache) {
      base.cache = engineConfig.cache;
    }

    for (const [key, value] of Object.entries(engineConfig as Record<string, unknown>)) {
      if (value === undefined) {
        continue;
      }
      if (key === 'enabled' || key === 'timeoutMs' || key === 'server' || key === 'cache') {
        continue;
      }
      base[key] = value;
    }
  }

  if (!meta) {
    return Object.keys(base).length > 0 ? base : undefined;
  }

  return { ...base, ...meta };
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${key}:${stableSerialize(entryValue)}`)
      .join(',')}}`;
  }
  return String(value);
}

function renderDisabledDiagram(
  diagram: SupramarkDiagramNode,
  key: number,
  classNames: SupramarkClassNames
): React.ReactNode {
  const header = `[diagram engine="${diagram.engine}" 已被禁用]\n\n`;
  return (
    <pre key={key} className={classNames.codeBlock}>
      <code className={classNames.code}>{header + diagram.code}</code>
    </pre>
  );
}

function isFeatureGroupEnabled(config: SupramarkConfig | undefined, ids: string[]): boolean {
  if (!config || !config.features || config.features.length === 0) {
    return true;
  }

  const hasAny = ids.some(id => config.features!.some(feature => feature.id === id));
  if (!hasAny) {
    return true;
  }

  return ids.some(id => isFeatureEnabled(config, id));
}
