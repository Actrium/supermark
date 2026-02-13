/**
 * Emoji Feature
 *
 * @packageDocumentation
 */

export { emojiFeature } from './feature.js';
export { emojiExamples } from './examples.js';

// 注意：Emoji Feature 使用标准的 SupramarkTextNode
// 不引入单独的 emoji 节点，直接体现在 text.value 中
// 这里重新导出方便用户使用
export type { SupramarkTextNode } from '@supramark/core';
