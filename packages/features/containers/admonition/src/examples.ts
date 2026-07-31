import type { ExampleDefinition } from '@supramark/core';

/**
 * Admonition Feature usage examples
 */
export const admonitionExamples: ExampleDefinition[] = [
  {
    name: 'Tip box (Admonition)',
    description: 'Shows parsing and rendering of ::: note / ::: warning etc. container blocks.',
    markdown: `
# Tip box example

::: note Tip
This is a plain tip box, used for general-purpose notes.
:::

::: warning Warning
Do not use test keys directly in production.
:::
    `.trim(),
  },
];
