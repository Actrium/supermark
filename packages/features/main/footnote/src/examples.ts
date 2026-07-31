import type { ExampleDefinition } from '@supramark/core';

/**
 * Footnote Feature usage examples
 */
export const footnoteExamples: ExampleDefinition[] = [
  {
    name: 'Footnote',
    description: 'Shows the reference and definition syntax for footnotes.',
    markdown: `
# Footnote Example

This is a paragraph of text with a footnote[^1]. You can add multiple footnotes in the same paragraph[^2].

Footnotes let you add supplementary notes without interrupting the flow of the main text[^note].

[^1]: This is the content of the first footnote.

[^2]: This is the second footnote, which can contain a more detailed explanation.

[^note]: A footnote identifier can be a number or text.
    `.trim(),
  },
];
