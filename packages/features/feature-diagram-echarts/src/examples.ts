import type { ExampleDefinition } from '@supramark/core';

/**
 * Diagram (ECharts) Feature 使用示例
 */
export const diagramEchartsExamples: ExampleDefinition[] = [
  {
    name: 'ECharts 折线图',
    description: '使用 ```echarts 围栏代码块定义一个简单折线图 option。',
    markdown: `
# ECharts diagram 示例

\`\`\`echarts
{
  "xAxis": { "type": "category", "data": ["Mon", "Tue", "Wed"] },
  "yAxis": { "type": "value" },
  "series": [
    { "type": "line", "data": [150, 230, 224] }
  ]
}
\`\`\`
    `.trim(),
  },
];
