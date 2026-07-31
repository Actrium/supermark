import type { ExampleDefinition } from '@supramark/core';

/**
 * Diagram (DOT / Graphviz) Feature usage examples
 */
export const diagramDotExamples: ExampleDefinition[] = [
  {
    name: 'Directed graph example',
    description: 'Uses a ```dot fenced code block to define a simple directed graph.',
    markdown: `
# DOT / Graphviz diagram example

\`\`\`dot
digraph G {
  A -> B;
  B -> C;
}
\`\`\`
    `.trim(),
  },
];
