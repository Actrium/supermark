import type { ExampleDefinition } from '@supramark/core';

/**
 * Mermaid Feature usage examples
 */
export const mermaidExamples: ExampleDefinition[] = [
  {
    name: 'Flowchart example',
    description: 'Uses a ```mermaid fenced code block to define a simple flowchart.',
    markdown: `
# Mermaid diagram example

\`\`\`mermaid
graph TD
  Start([Start]) --> Check{Ready?}
  Check -->|Yes| Ship[Ship]
  Check -->|No| Fix[Fix]
\`\`\`
    `.trim(),
  },
];
