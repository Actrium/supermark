/**
 * Emoji Feature
 *
 * @packageDocumentation
 */

export {
  emojiFeature,
  type EmojiFeatureOptions,
  type EmojiFeatureConfig,
  createEmojiFeatureConfig,
  getEmojiFeatureOptions,
} from './feature.js';
export { emojiExamples } from './examples.js';

// Note: the Emoji Feature uses the standard SupramarkTextNode.
// It does not introduce a separate emoji node — it's embedded directly in text.value.
// Re-exported here for user convenience.
export type { SupramarkTextNode } from '@supramark/core';
