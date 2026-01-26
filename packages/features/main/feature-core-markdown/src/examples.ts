import type { ExampleDefinition } from '@supramark/core';

/**
 * Core Markdown Feature 使用示例
 */
export const coreMarkdownExamples: ExampleDefinition[] = [
  {
    name: '基础文本 / 段落',
    description: '展示最基础的段落与换行渲染效果。',
    markdown: `
# supramark 示例

这是一个基础示例，用来演示多行文本、段落之间的间距等。

你可以切换不同类型的示例来查看更多功能。
    `.trim(),
  },
  {
    name: '标题层级',
    description: '展示 H1-H4 的渲染样式。',
    markdown: `
# 一级标题 H1

一些说明文字。

## 二级标题 H2

更多说明。

### 三级标题 H3

再多一点说明。

#### 四级标题 H4

最后一段说明。
    `.trim(),
  },
  {
    name: '列表',
    description: '展示无序和有序列表。',
    markdown: `
# 列表示例

- 无序列表项 1
- 无序列表项 2

1. 有序列表项 1
2. 有序列表项 2
    `.trim(),
  },
  {
    name: '代码块',
    description: '展示普通代码块的渲染效果。',
    markdown: `
# 代码块示例

下面是一段 JavaScript 代码：

\`\`\`js
function hello(name) {
  console.log('Hello, ' + name)
}

hello('supramark')
\`\`\`
    `.trim(),
  },
];
