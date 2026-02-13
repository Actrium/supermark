import React, { useEffect, useState, useMemo, useContext, ReactNode } from 'react';
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
  SupramarkContainerNode,
  SupramarkTextNode,
  SupramarkStrongNode,
  SupramarkEmphasisNode,
  SupramarkLinkNode,
  SupramarkImageNode,
  SupramarkBreakNode,
  SupramarkDeleteNode,
  SupramarkTableNode,
  SupramarkTableRowNode,
  SupramarkTableCellNode,
  SupramarkMathInlineNode,
  SupramarkFootnoteReferenceNode,
  SupramarkFootnoteDefinitionNode,
  SupramarkDefinitionListNode,
  SupramarkDefinitionItemNode,
  SupramarkBlockquoteNode,
  SupramarkThematicBreakNode,
  SupramarkConfig,
  SUPRAMARK_ADMONITION_KINDS,
} from '@supramark/core';
import {
  parseMarkdown,
  isFeatureEnabled,
  warnIfUnknownDiagramEngine,
  getFeatureOptionsAs,
} from '@supramark/core';
import type { DiagramRenderResult, DiagramRenderService } from '@supramark/diagram-engine';
import {
  type SupramarkClassNames,
  mergeClassNames,
  tailwindClassNames,
  minimalClassNames,
} from './classNames.js';
import { ErrorBoundary, ErrorInfo, ErrorDisplay } from './ErrorBoundary.js';
import { DiagramEngineContext } from './DiagramEngineProvider.js';

export interface ContainerRendererWeb {
  (args: {
    node: any;
    key: number;
    classNames: SupramarkClassNames;
    config?: SupramarkConfig;
    renderNode: (node: SupramarkNode, key: number) => React.ReactNode;
    renderChildren: (children: SupramarkNode[]) => React.ReactNode;
  }): React.ReactNode;
}

export interface SupramarkWebProps {
  /** Markdown 源文本 */
  markdown: string;
  /** 预解析的 AST（优先级高于 markdown） */
  ast?: SupramarkRootNode;
  /** 自定义 className（覆盖默认 className） */
  classNames?: SupramarkClassNames;
  /** 主题：'tailwind' | 'minimal' | 自定义 classNames 对象 */
  theme?: 'tailwind' | 'minimal' | SupramarkClassNames;
  /** Feature 配置（用于按需启用/禁用扩展能力） */
  config?: SupramarkConfig;
  /** 错误回调（可选） */
  onError?: (error: Error, errorInfo?: React.ErrorInfo) => void;
  /** 自定义错误展示组件（可选） */
  errorFallback?: (error: ErrorInfo) => ReactNode;
  /** CSS 类名前缀，默认 'sm-error' */
  errorClassNamePrefix?: string;

  /**
   * Container 扩展渲染器注册表：node.type === 'container' 时按 node.name 委派。
   *
   * 优先从 config.features 自动解析，也可由此处手动注入。
   */
  containerRenderers?: Record<string, ContainerRendererWeb>;
}

// ── Pre-render helpers ────────────────────────────────────────────────

type RenderTask = {
  key: string;
  engine: string;
  code: string;
  options?: Record<string, unknown>;
};

/** Collect all diagram/math nodes that need async rendering. */
function collectRenderTasks(nodes: SupramarkNode[]): RenderTask[] {
  const tasks: RenderTask[] = [];

  function walk(list: SupramarkNode[]) {
    for (const node of list) {
      if (node.type === 'diagram') {
        const d = node as SupramarkDiagramNode;
        tasks.push({ key: `d:${d.engine}:${d.code}`, engine: d.engine, code: d.code });
      } else if (node.type === 'math_block') {
        const m = node as SupramarkMathBlockNode;
        tasks.push({
          key: `m:1:${m.value}`,
          engine: 'math',
          code: m.value,
          options: { displayMode: true },
        });
      } else if (node.type === 'math_inline') {
        const m = node as SupramarkMathInlineNode;
        tasks.push({
          key: `m:0:${m.value}`,
          engine: 'math',
          code: m.value,
          options: { displayMode: false },
        });
      }

      // Recurse into children
      if ('children' in node && Array.isArray((node as any).children)) {
        walk((node as any).children);
      }
      // definition_item has term[] and descriptions[][]
      if (node.type === 'definition_item') {
        const di = node as SupramarkDefinitionItemNode;
        if (di.term) walk(di.term);
        if (di.descriptions) {
          for (const desc of di.descriptions) {
            if (Array.isArray(desc)) walk(desc);
          }
        }
      }
    }
  }

  walk(nodes);
  return tasks;
}

/** Render all tasks in parallel, returning a key→result map. */
async function preRenderAll(
  tasks: RenderTask[],
  engine: DiagramRenderService
): Promise<Map<string, DiagramRenderResult>> {
  if (tasks.length === 0) return new Map();

  // Deduplicate by key (same code → same result)
  const unique = new Map<string, RenderTask>();
  for (const t of tasks) {
    if (!unique.has(t.key)) unique.set(t.key, t);
  }

  const entries = [...unique.values()];
  const results = await Promise.all(
    entries.map(t => engine.render({ engine: t.engine, code: t.code, options: t.options }))
  );

  const map = new Map<string, DiagramRenderResult>();
  entries.forEach((t, i) => map.set(t.key, results[i]));
  return map;
}

// ── Component ─────────────────────────────────────────────────────────

export const Supramark: React.FC<SupramarkWebProps> = ({
  markdown,
  ast,
  classNames: customClassNames,
  theme,
  config,
  onError,
  errorFallback,
  errorClassNamePrefix = 'sm-error',
  containerRenderers,
}) => {
  const diagramEngine = useContext(DiagramEngineContext);
  const [root, setRoot] = useState<SupramarkRootNode | null>(ast ?? null);
  const [rendered, setRendered] = useState<Map<string, DiagramRenderResult>>(new Map());
  const [parseError, setParseError] = useState<ErrorInfo | null>(null);

  // 合并 className：theme -> customClassNames -> defaultClassNames
  const mergedClassNames = useMemo(() => {
    let themeClassNames: SupramarkClassNames | undefined;

    if (typeof theme === 'string') {
      themeClassNames = theme === 'tailwind' ? tailwindClassNames : minimalClassNames;
    } else if (theme) {
      themeClassNames = theme;
    }

    // 如果同时提供了 theme 和 customClassNames，customClassNames 优先级更高
    const finalCustomClassNames = {
      ...themeClassNames,
      ...customClassNames,
    };

    return mergeClassNames(finalCustomClassNames);
  }, [customClassNames, theme]);

  // Single async step: parse markdown → pre-render all diagrams/math → setState once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1. Parse
        const parsed = ast ?? (await parseMarkdown(markdown, { config }));
        if (cancelled) return;

        // 2. Pre-render all diagram/math nodes in parallel
        let renderedMap = new Map<string, DiagramRenderResult>();
        if (diagramEngine) {
          const tasks = collectRenderTasks(parsed.children);
          renderedMap = await preRenderAll(tasks, diagramEngine);
        }
        if (cancelled) return;

        // 3. Set state once (single synchronous commit)
        setRoot(parsed);
        setRendered(renderedMap);
        setParseError(null);
      } catch (error) {
        if (cancelled) return;
        const err = error as Error;
        setParseError({
          type: 'parse',
          message: err.message || '解析 Markdown 失败',
          details: err.toString(),
          stack: err.stack,
        });
        setRoot(null);
        if (onError) onError(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [markdown, ast, diagramEngine, config]);

  const mergedContainerRenderers = useMemo(() => {
    // 1. 从传入的 config.features 中提取
    const fromFeatures: Record<string, ContainerRendererWeb> = {};
    if (config?.features) {
      config.features.forEach(f => {
        if (f.renderers?.web) {
          // 如果 feature.ts 中定义了 nodeName，则使用它作为 key
          const nodeName = (f.syntax?.ast as any)?.type;
          if (nodeName) {
            fromFeatures[nodeName] = f.renderers.web as any;
          }
        }
      });
    }

    // 2. 合并：手动传入的 containerRenderers 优先级最高
    return { ...fromFeatures, ...(containerRenderers ?? {}) };
  }, [containerRenderers, config]);

  // 解析错误降级：显示错误信息或原始 markdown
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

  if (!root) {
    return null;
  }

  return (
    <ErrorBoundary
      onError={onError}
      fallback={errorFallback}
      classNamePrefix={errorClassNamePrefix}
    >
      <div className={mergedClassNames.root}>
        {root.children.map((node, index) =>
          renderNode(node, index, mergedClassNames, config, mergedContainerRenderers, rendered)
        )}
      </div>
    </ErrorBoundary>
  );
};

// ── Render tree (purely synchronous) ──────────────────────────────────

function renderNode(
  node: SupramarkNode,
  key: number,
  classNames: SupramarkClassNames,
  config?: SupramarkConfig,
  containerRenderers?: Record<string, ContainerRendererWeb>,
  rendered?: Map<string, DiagramRenderResult>
): React.ReactNode {
  // container 扩展优先：让新增 :::xxx 不需要修改本文件
  if (node.type === 'container') {
    const name = (node as any).name as string;
    const renderer = containerRenderers?.[name];
    if (renderer) {
      return renderer({
        node,
        key,
        classNames,
        config,
        renderNode: (n, k) => renderNode(n, k, classNames, config, containerRenderers, rendered),
        renderChildren: children =>
          (children ?? []).map((child, idx) =>
            renderNode(child, idx, classNames, config, containerRenderers, rendered)
          ),
      });
    }
    return null;
  }

  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} className={classNames.paragraph}>
          {renderInlineNodes(
            (node as SupramarkParagraphNode).children,
            classNames,
            config,
            rendered
          )}
        </p>
      );
    case 'heading': {
      const heading = node as SupramarkHeadingNode;
      const content = renderInlineNodes(heading.children, classNames, config, rendered);
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
      const bq = node as SupramarkBlockquoteNode;
      return (
        <blockquote key={key} className={classNames.blockquote}>
          {bq.children.map((child, index) =>
            renderNode(child, index, classNames, config, containerRenderers, rendered)
          )}
        </blockquote>
      );
    }
    case 'thematic_break': {
      return <hr key={key} className={classNames.thematicBreak} />;
    }
    case 'code': {
      const codeBlock = node as SupramarkCodeNode;
      return (
        <pre key={key} className={classNames.codeBlock}>
          <code className={classNames.code}>{codeBlock.value}</code>
        </pre>
      );
    }
    case 'math_block': {
      const mathBlock = node as SupramarkMathBlockNode;
      if (!isFeatureGroupEnabled(config, ['@supramark/feature-math'])) {
        return (
          <pre key={key} className={classNames.codeBlock}>
            <code className={classNames.code}>{mathBlock.value}</code>
          </pre>
        );
      }
      const result = rendered?.get(`m:1:${mathBlock.value}`);
      if (result?.success) {
        return (
          <div
            key={key}
            className={classNames.codeBlock}
            dangerouslySetInnerHTML={{ __html: result.payload }}
          />
        );
      }
      // Fallback: raw TeX
      return (
        <div key={key} className={classNames.codeBlock} data-suprimark-math="block">
          <code className={classNames.code}>{mathBlock.value}</code>
        </div>
      );
    }
    case 'list': {
      const list = node as SupramarkListNode;
      const items = list.children.map((item, index) =>
        renderNode(item, index, classNames, config, containerRenderers, rendered)
      );
      return list.ordered ? (
        <ol key={key} className={classNames.listOrdered}>
          {items}
        </ol>
      ) : (
        <ul key={key} className={classNames.listUnordered}>
          {items}
        </ul>
      );
    }
    case 'list_item': {
      const item = node as SupramarkListItemNode;
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
              renderNode(child, index, classNames, config, containerRenderers, rendered)
            )}
          </li>
        );
      }

      return (
        <li key={key} className={classNames.listItem}>
          {item.children.map((child, index) =>
            renderNode(child, index, classNames, config, containerRenderers, rendered)
          )}
        </li>
      );
    }
    case 'diagram': {
      const diagram = node as SupramarkDiagramNode;
      warnIfUnknownDiagramEngine(diagram.engine, 'web:diagram-render');
      const result = rendered?.get(`d:${diagram.engine}:${diagram.code}`);
      if (result?.success) {
        return (
          <div
            key={key}
            className={classNames.diagram}
            dangerouslySetInnerHTML={{ __html: result.payload }}
          />
        );
      }
      if (result && !result.success) {
        return (
          <div key={key} className={classNames.diagram}>
            <div
              style={{
                border: '1px solid #ffccc7',
                background: '#fff2f0',
                padding: '12px',
                borderRadius: '4px',
                margin: '8px 0',
              }}
            >
              <div style={{ color: '#cf1322', fontWeight: 600, marginBottom: 8 }}>
                Diagram render error
              </div>
              <div style={{ color: '#595959', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                {result.error?.details || result.payload}
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', color: '#1890ff', fontSize: 13 }}>
                  Show source
                </summary>
                <pre
                  style={{
                    background: '#fafafa',
                    padding: 8,
                    borderRadius: 4,
                    marginTop: 8,
                    overflow: 'auto',
                  }}
                >
                  <code>{diagram.code}</code>
                </pre>
              </details>
            </div>
          </div>
        );
      }
      // Fallback: no engine / SSR
      return (
        <div key={key} data-suprimark-diagram={diagram.engine} className={classNames.diagram}>
          <pre className={classNames.diagramPre}>
            <code className={classNames.diagramCode}>{diagram.code}</code>
          </pre>
        </div>
      );
    }
    case 'container': {
      const container = node as SupramarkContainerNode;
      const containerName = container.name;

      // 检查是否有注册的自定义渲染器
      if (containerRenderers && containerRenderers[containerName]) {
        return containerRenderers[containerName]({
          node: container,
          key,
          classNames,
          config,
          renderNode: (n, k) => renderNode(n, k, classNames, config, containerRenderers, rendered),
          renderChildren: children =>
            children.map((child, index) =>
              renderNode(child, index, classNames, config, containerRenderers, rendered)
            ),
        });
      }

      // 内置处理：admonition 类型 (note, tip, warning, etc.)
      if (SUPRAMARK_ADMONITION_KINDS.includes(containerName as any)) {
        const title = container.params || (container.data?.title as string | undefined);
        const kind = containerName;

        if (!isFeatureGroupEnabled(config, ['@supramark/feature-admonition'])) {
          // 禁用时退化为普通段落
          return (
            <p key={key} className={classNames.paragraph}>
              {title ? <strong>{title}</strong> : null}
              {title ? ' ' : null}
              {container.children.map((child, index) =>
                renderNode(child, index, classNames, config, containerRenderers, rendered)
              )}
            </p>
          );
        }

        const adOptions =
          getFeatureOptionsAs<{ kinds?: string[] }>(config, '@supramark/feature-admonition') ?? {};
        if (Array.isArray(adOptions.kinds) && adOptions.kinds.length > 0) {
          if (!adOptions.kinds.includes(kind)) {
            return (
              <p key={key} className={classNames.paragraph}>
                {title ? <strong>{title}</strong> : null}
                {title ? ' ' : null}
                {container.children.map((child, index) =>
                  renderNode(child, index, classNames, config, containerRenderers, rendered)
                )}
              </p>
            );
          }
        }

        const kindTheme: Record<
          string,
          { border: string; bg: string; color: string; icon: string }
        > = {
          note: { border: '#448aff', bg: '#e3f2fd', color: '#1565c0', icon: 'ℹ️' },
          tip: { border: '#00c853', bg: '#e8f5e9', color: '#2e7d32', icon: '💡' },
          info: { border: '#448aff', bg: '#e3f2fd', color: '#1565c0', icon: 'ℹ️' },
          warning: { border: '#ff9100', bg: '#fff3e0', color: '#e65100', icon: '⚠️' },
          danger: { border: '#ff1744', bg: '#fce4ec', color: '#b71c1c', icon: '🚨' },
        };
        const theme = kindTheme[kind] ?? kindTheme.note;

        return (
          <div
            key={key}
            className={`admonition admonition-${kind}`}
            style={{
              borderLeft: `4px solid ${theme.border}`,
              background: theme.bg,
              borderRadius: '4px',
              padding: '12px 16px',
              margin: '12px 0',
            }}
          >
            {title ? (
              <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: theme.color }}>
                {theme.icon} {title}
              </p>
            ) : null}
            <div>
              {container.children.map((child, index) =>
                renderNode(child, index, classNames, config, containerRenderers, rendered)
              )}
            </div>
          </div>
        );
      }

      // 内置处理：map 类型
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

      // 默认：渲染为通用容器块
      return (
        <div
          key={key}
          className={`container container-${containerName} ${classNames.paragraph ?? ''}`.trim()}
        >
          {container.params && <div className="container-params">{container.params}</div>}
          <div className="container-content">
            {container.children.map((child, index) =>
              renderNode(child, index, classNames, config, containerRenderers, rendered)
            )}
          </div>
        </div>
      );
    }
    case 'definition_list': {
      const list = node as SupramarkDefinitionListNode;
      const defOptions =
        getFeatureOptionsAs<{ compact?: boolean }>(config, '@supramark/feature-definition-list') ??
        {};
      const isCompact = defOptions.compact !== false;
      if (!isFeatureGroupEnabled(config, ['@supramark/feature-definition-list'])) {
        // 禁用时，将定义列表退化为普通段落 + 加粗术语
        return (
          <div key={key} className={classNames.paragraph}>
            {list.children.map((item, index) => {
              const defItem = item as SupramarkDefinitionItemNode;
              const termContent = renderInlineNodes(defItem.term, classNames, config, rendered);
              return (
                <p key={index} className={classNames.paragraph}>
                  <strong>{termContent}</strong>{' '}
                  {defItem.descriptions.map((descNodes, idx) => (
                    <span key={idx}>
                      {renderInlineNodes(descNodes, classNames, config, rendered)}
                      {idx < defItem.descriptions.length - 1 ? ' ' : null}
                    </span>
                  ))}
                </p>
              );
            })}
          </div>
        );
      }
      return (
        <dl key={key} className={classNames.paragraph}>
          {list.children.map((item, index) => {
            const defItem = item as SupramarkDefinitionItemNode;
            const termContent = renderInlineNodes(defItem.term, classNames, config, rendered);
            return (
              <React.Fragment key={index}>
                <dt>
                  <strong>{termContent}</strong>
                </dt>
                {defItem.descriptions.map((descNodes, idx) => (
                  <dd key={idx}>
                    {renderInlineNodes(descNodes, classNames, config, rendered)}
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
      const table = node as SupramarkTableNode;
      return (
        <table key={key} className={classNames.table}>
          <tbody className={classNames.tableBody}>
            {table.children.map((row, index) =>
              renderNode(row, index, classNames, config, containerRenderers, rendered)
            )}
          </tbody>
        </table>
      );
    }
    case 'table_row': {
      const row = node as SupramarkTableRowNode;
      return (
        <tr key={key} className={classNames.tableRow}>
          {row.children.map((cell, index) =>
            renderNode(cell, index, classNames, config, containerRenderers, rendered)
          )}
        </tr>
      );
    }
    case 'table_cell': {
      const cell = node as SupramarkTableCellNode;
      const alignStyle = cell.align ? { textAlign: cell.align } : undefined;
      const content = renderInlineNodes(cell.children, classNames, config, rendered);

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
      const def = node as SupramarkFootnoteDefinitionNode;
      if (!isFeatureGroupEnabled(config, ['@supramark/feature-footnote'])) {
        return (
          <React.Fragment key={key}>
            {def.children.map((child, index) =>
              renderNode(child, index, classNames, config, containerRenderers, rendered)
            )}
          </React.Fragment>
        );
      }
      // Inline [index] with the first paragraph's content, render rest as blocks
      const first = def.children[0];
      if (first?.type === 'paragraph') {
        const para = first as SupramarkParagraphNode;
        return (
          <React.Fragment key={key}>
            <p className={classNames.paragraph}>
              <sup>[{def.index}]</sup>{' '}
              {renderInlineNodes(para.children, classNames, config, rendered)}
            </p>
            {def.children
              .slice(1)
              .map((child, idx) =>
                renderNode(child, idx + 1, classNames, config, containerRenderers, rendered)
              )}
          </React.Fragment>
        );
      }
      return (
        <div key={key} className={classNames.paragraph}>
          <sup>[{def.index}]</sup>
          {def.children.map((child, index) =>
            renderNode(child, index, classNames, config, containerRenderers, rendered)
          )}
        </div>
      );
    }
    case 'text':
      return <React.Fragment key={key}>{(node as SupramarkTextNode).value}</React.Fragment>;
    default:
      return null;
  }
}

function renderInlineNodes(
  nodes: SupramarkNode[],
  classNames: SupramarkClassNames,
  config?: SupramarkConfig,
  rendered?: Map<string, DiagramRenderResult>
): React.ReactNode {
  return nodes.map((node, index) => renderInlineNode(node, index, classNames, config, rendered));
}

function renderInlineNode(
  node: SupramarkNode,
  key: number,
  classNames: SupramarkClassNames,
  config?: SupramarkConfig,
  rendered?: Map<string, DiagramRenderResult>
): React.ReactNode {
  switch (node.type) {
    case 'text': {
      const textNode = node as SupramarkTextNode;
      return textNode.value;
    }
    case 'strong': {
      const strongNode = node as SupramarkStrongNode;
      return (
        <strong key={key} className={classNames.strong}>
          {renderInlineNodes(strongNode.children, classNames, config, rendered)}
        </strong>
      );
    }
    case 'emphasis': {
      const emphasisNode = node as SupramarkEmphasisNode;
      return (
        <em key={key} className={classNames.emphasis}>
          {renderInlineNodes(emphasisNode.children, classNames, config, rendered)}
        </em>
      );
    }
    case 'inline_code': {
      const codeNode = node as SupramarkInlineCodeNode;
      return (
        <code key={key} className={classNames.inlineCode}>
          {codeNode.value}
        </code>
      );
    }
    case 'math_inline': {
      const mathNode = node as SupramarkMathInlineNode;
      if (!isFeatureGroupEnabled(config, ['@supramark/feature-math'])) {
        return mathNode.value;
      }
      const result = rendered?.get(`m:0:${mathNode.value}`);
      if (result?.success) {
        return (
          <span
            key={key}
            className={classNames.inlineCode}
            dangerouslySetInnerHTML={{ __html: result.payload }}
          />
        );
      }
      // Fallback: raw TeX
      return (
        <span key={key} data-suprimark-math="inline" className={classNames.inlineCode}>
          {mathNode.value}
        </span>
      );
    }
    case 'link': {
      const linkNode = node as SupramarkLinkNode;
      return (
        <a key={key} href={linkNode.url} title={linkNode.title} className={classNames.link}>
          {renderInlineNodes(linkNode.children, classNames, config, rendered)}
        </a>
      );
    }
    case 'image': {
      const imageNode = node as SupramarkImageNode;
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
    case 'break': {
      return <br key={key} />;
    }
    case 'delete': {
      const deleteNode = node as SupramarkDeleteNode;
      if (!isFeatureGroupEnabled(config, ['@supramark/feature-gfm'])) {
        return renderInlineNodes(deleteNode.children, classNames, config, rendered);
      }
      return (
        <del key={key} className={classNames.delete}>
          {renderInlineNodes(deleteNode.children, classNames, config, rendered)}
        </del>
      );
    }
    case 'footnote_reference': {
      const ref = node as SupramarkFootnoteReferenceNode;
      const label = ref.index;
      return (
        <sup key={key} className={classNames.inlineCode}>
          [{label}]
        </sup>
      );
    }
    default:
      return null;
  }
}

/**
 * 判断一组 Feature ID 是否被启用。
 *
 * 约定与 RN 端保持一致：
 * - 未提供 config 或 config.features 为空 → 视为全部启用；
 * - 如果 config 中根本没有提到这些 ID → 视为使用默认行为（启用）；
 * - 一旦显式配置了其中任意一个 ID，则以配置为准，只要有一个 enabled:true 就认为启用。
 */
function isFeatureGroupEnabled(config: SupramarkConfig | undefined, ids: string[]): boolean {
  if (!config || !config.features || config.features.length === 0) {
    return true;
  }

  const hasAny = ids.some(id => config.features!.some(f => f.id === id));
  if (!hasAny) {
    return true;
  }

  return ids.some(id => isFeatureEnabled(config, id));
}
