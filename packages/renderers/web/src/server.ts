/**
 * @supramark/web/server
 *
 * 服务端渲染（SSR）专用导出。
 *
 * 此模块提供将 Markdown 转换为 HTML 字符串的功能，
 * 适用于 Node.js 服务端环境和 SSR 场景。
 *
 * @example
 * ```typescript
 * import { parseMarkdown, astToHtml, buildDiagramSupportScripts } from '@supramark/web/server';
 *
 * // 解析 Markdown 为 AST
 * const ast = await parseMarkdown(markdown);
 *
 * // 将 AST 转换为 HTML 字符串
 * const htmlContent = astToHtml(ast);
 *
 * // 生成图表支持脚本（如果使用了 diagram 功能）
 * const scripts = buildDiagramSupportScripts();
 *
 * // 在服务端返回完整 HTML
 * const html = `
 *   <!DOCTYPE html>
 *   <html>
 *     <head>${scripts.headScript}</head>
 *     <body>
 *       ${htmlContent}
 *       ${scripts.bodyScript}
 *     </body>
 *   </html>
 * `;
 * ```
 */

// 核心解析功能（从 @supramark/core 导出）
export { parseMarkdown } from '@supramark/core';
export type { SupramarkRootNode, SupramarkNode } from '@supramark/core';

// HTML 渲染功能
export { astToHtml, escapeHtml } from './html.js';

// Diagram / Math 支持脚本生成
export { buildDiagramSupportScripts } from '@supramark/web-diagram';
export { buildMathSupportScripts } from './mathSupport.js';
