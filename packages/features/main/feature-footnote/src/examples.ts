import type { ExampleDefinition } from '@supramark/core';

/**
 * Footnote Feature 使用示例
 */
export const footnoteExamples: ExampleDefinition[] = [
  {
    name: '脚注（Footnote）',
    description: '展示脚注的引用和定义语法。',
    markdown: `
# 脚注示例

这是一段包含脚注的文本[^1]。你可以在同一段落中添加多个脚注[^2]。

脚注可以让你添加补充说明而不打断正文流程[^note]。

[^1]: 这是第一个脚注的内容。

[^2]: 这是第二个脚注，可以包含更详细的解释。

[^note]: 脚注标识符可以是数字或文本。
    `.trim(),
  },
];
