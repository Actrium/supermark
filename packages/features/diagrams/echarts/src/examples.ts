import type { ExampleDefinition } from '@supramark/core';

/**
 * Diagram (ECharts) Feature usage examples
 */
export const diagramEchartsExamples: ExampleDefinition[] = [
  {
    name: 'ECharts line chart',
    description: 'Uses a ```echarts fenced code block to define a simple line-chart option.',
    markdown: `
# ECharts diagram example

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
