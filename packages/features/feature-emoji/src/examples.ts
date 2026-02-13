import type { ExampleDefinition } from '@supramark/core';

/**
 * Emoji Feature 使用示例
 */
export const emojiExamples: ExampleDefinition[] = [
  {
    name: 'Emoji / 短代码',
    description: '展示 :smile: / :rocket: 等 Emoji 短代码的解析效果。',
    markdown: `
# Emoji 示例

支持 GitHub 风格短代码：

- :smile: :joy: :wink:
- :rocket: :tada: :warning:

也可以直接输入原生 Emoji 😄🚀🎉。
    `.trim(),
  },
];
