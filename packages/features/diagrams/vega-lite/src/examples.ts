import type { ExampleDefinition } from '@supramark/core';

/**
 * Diagram (Vega-Lite) Feature usage examples
 */
export const diagramVegaLiteExamples: ExampleDefinition[] = [
  {
    name: 'Vega-Lite bar chart',
    description: 'Uses a ```vega-lite fenced code block to define a minimal working Vega-Lite bar chart.',
    markdown: `
# Vega-Lite diagram example

The fenced code block below is recognized by supramark as a \`diagram\` node (engine = "vega-lite"):

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
