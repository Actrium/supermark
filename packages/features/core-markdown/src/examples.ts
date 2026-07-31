import type { ExampleDefinition } from '@supramark/core';

/**
 * Core Markdown Feature usage examples
 */
export const coreMarkdownExamples: ExampleDefinition[] = [
  {
    name: 'Basic text / paragraphs',
    description: 'Shows the most basic paragraph and line-break rendering.',
    markdown: `
# supramark example

This is a basic example demonstrating multi-line text, spacing between paragraphs, etc.

You can switch between different example types to see more features.
    `.trim(),
  },
  {
    name: 'Heading levels',
    description: 'Shows the rendering style of H1-H4.',
    markdown: `
# Level-1 heading H1

Some explanatory text.

## Level-2 heading H2

More explanation.

### Level-3 heading H3

Even more explanation.

#### Level-4 heading H4

The last bit of explanation.
    `.trim(),
  },
  {
    name: 'Lists',
    description: 'Shows unordered and ordered lists.',
    markdown: `
# List example

- Unordered list item 1
- Unordered list item 2

1. Ordered list item 1
2. Ordered list item 2
    `.trim(),
  },
  {
    name: 'Code block',
    description: 'Shows the rendering of a plain code block.',
    markdown: `
# Code block example

Here is a snippet of JavaScript code:

\`\`\`js
function hello(name) {
  console.log('Hello, ' + name)
}

hello('supramark')
\`\`\`
    `.trim(),
  },
];
