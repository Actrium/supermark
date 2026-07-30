import type { ExampleDefinition } from '@supramark/core';

/**
 * D2 Feature usage examples
 *
 * Each example is kept as short as possible for fast rendering in the preview app. Examples cover:
 *  - The simplest edge (a -> b)
 *  - A labeled edge
 *  - Containers / grouping (customers: { ... })
 *
 * Syntax reference: https://d2lang.com/
 */
export const d2Examples: ExampleDefinition[] = [
  {
    name: 'Minimal flow',
    description: 'Uses a ```d2 fence to define the simplest possible node edge.',
    markdown: `
# D2 minimal flow

\`\`\`d2
a -> b
\`\`\`
    `.trim(),
  },
  {
    name: 'Labeled edge',
    description: 'Shows D2 edge label syntax.',
    markdown: `
# D2 labeled edges

\`\`\`d2
user -> database: reads
database -> user: rows
\`\`\`
    `.trim(),
  },
  {
    name: 'Container / grouping',
    description: 'Shows D2 container syntax, grouping multiple nodes into a subgraph.',
    markdown: `
# D2 container

\`\`\`d2
customers: {
  alice
  bob
}
\`\`\`
    `.trim(),
  },
];
