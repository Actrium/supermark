// The root entry point only exports the "package-level public API"; specific
// engines live under their own subpath (./mermaid, ./echarts, etc.).
// This avoids `export *` conflicts when multiple engines have a same-named `Options`.

// ── types ────────────────────────────────────────────────
export type {
  // Engine v2 types
  RenderOptions,
  RenderFn,
  EngineFactory,
  ErrorCode,
  // Diagram service facade
  DiagramEngineType,
  DiagramRenderFormat,
  DiagramErrorInfo,
  DiagramRenderResult,
  DiagramRenderService,
  GraphvizAttributeValue,
  GraphvizImageSize,
  GraphvizDiagramOptions,
  GraphvizCapabilities,
  GraphvizRenderAdapter,
  DiagramEngineOptions,
} from './types.js';

export { DiagramRenderError } from './types.js';

// ── Diagram runtime facade ───────────────────────────────
export { createDiagramEngine } from './engine.js';
export {
  GRAPHVIZ_LAYOUT_ENGINES,
  renderGraphvizSvg,
  isGraphvizDiagramEngine,
  pickGraphvizDiagramOptions,
  resolveGraphvizLayoutEngine,
} from './graphviz/index.js';
export { renderMermaidSvg } from './mermaid/index.js';
export { renderMathJaxSvg, getSvgViewBoxSize } from './mathjax/index.js';
export {
  createCodeHighlighter,
  withCodeHighlightCache,
  buildCodeHighlightCacheKey,
  type CodeHighlightService,
  type CodeHighlightCacheOptions,
} from './code-highlight.js';
