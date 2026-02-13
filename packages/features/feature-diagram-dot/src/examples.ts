import type { ExampleDefinition } from '@supramark/core';

/**
 * Diagram (DOT / Graphviz) Feature 使用示例
 */
export const diagramDotExamples: ExampleDefinition[] = [
  {
    name: '有向图示例',
    description: '使用 ```dot 围栏代码块定义一个简单有向图。',
    markdown: `
# DOT / Graphviz diagram 示例

\`\`\`dot
digraph G {
  A -> B;
  B -> C;
}
\`\`\`
    `.trim(),
  },
];
