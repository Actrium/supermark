import type { ExampleDefinition } from '@supramark/core';

/**
 * Admonition Feature 使用示例
 */
export const admonitionExamples: ExampleDefinition[] = [
  {
    name: '提示框（Admonition）',
    description: '展示 ::: note / ::: warning 等容器块的解析与渲染效果。',
    markdown: `
# 提示框示例

::: note 提示
这是一个普通提示框，用于展示一般性说明。
:::

::: warning 警告
请勿在生产环境中直接使用测试密钥。
:::
    `.trim(),
  },
];
