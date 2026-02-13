/**
 * Admonition Feature
 *
 * 提示框容器块语法支持（note/tip/warning 等）
 *
 * @packageDocumentation
 */

// Feature 定义（主导出）
export {
  admonitionFeature,
  ADMONITION_CONTAINER_NAMES,
  type AdmonitionKind,
  // 兼容性导出
  registerAdmonitionContainer,
} from './feature.js';

// 示例
export { admonitionExamples } from './examples.js';

// 渲染器（供 registry 使用）
export { renderAdmonitionContainerWeb } from './runtime.web.js';
export { renderAdmonitionContainerRN } from './runtime.rn.js';
