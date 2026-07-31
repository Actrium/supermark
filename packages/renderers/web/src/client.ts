/**
 * @supramark/web/client
 *
 * Client-side (browser) rendering exports.
 *
 * This module provides React components for dynamically rendering Markdown in the browser.
 * Suitable for CSR (client-side rendering) scenarios and SPAs (single-page applications).
 *
 * @example
 * ```typescript
 * import { Supramark, parse } from '@supramark/web/client';
 *
 * function App() {
 *   const [markdown, setMarkdown] = useState('# Hello World');
 *
 *   return (
 *     <div>
 *       <Supramark markdown={markdown} />
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Pre-parse the AST and pass it in (performance optimization)
 * import { Supramark, parse } from '@supramark/web/client';
 *
 * const ast = await parse('# Hello World');
 *
 * function App() {
 *   return <Supramark ast={ast} markdown="" />;
 * }
 * ```
 */

// React components
export { Supramark } from './Supramark.js';
export type { SupramarkRenderState, SupramarkWebProps } from './Supramark.js';
export { DiagramEngineProvider } from './DiagramEngineProvider.js';
export type { DiagramEngineProviderProps } from './DiagramEngineProvider.js';

// className system
export type { SupramarkClassNames } from './classNames.js';
export {
  defaultClassNames,
  mergeClassNames,
  tailwindClassNames,
  minimalClassNames,
} from './classNames.js';

// Core parsing functionality (optional; Markdown can also be parsed in the browser)
export { parse } from '@supramark/core';
export type { SupramarkRootNode, SupramarkNode } from '@supramark/core';
