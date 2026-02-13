import type { ExampleDefinition } from '@supramark/core';

/**
 * Diagram (Vega-Lite) Feature 使用示例
 */
export const diagramVegaLiteExamples: ExampleDefinition[] = [
  {
    name: 'Vega-Lite 柱状图',
    description: '使用 ```vega-lite 围栏代码块定义一个最小可用的 Vega-Lite 柱状图。',
    markdown: `
# Vega-Lite diagram 示例

下面的围栏代码块会被 supramark 识别为 \`diagram\` 节点（engine = "vega-lite"）：

\`\`\`vega-lite
{
  "mark": "bar",
  "encoding": {
    "x": { "field": "category", "type": "ordinal" },
    "y": { "field": "value", "type": "quantitative" }
  },
  "data": {
    "values": [
      { "category": "A", "value": 1 },
      { "category": "B", "value": 2 }
    ]
  }
}
\`\`\`
    `.trim(),
  },
];
