import type { ExampleDefinition } from '@supramark/core';

/**
 * HTML Page Feature usage examples
 */
export const htmlPageExamples: ExampleDefinition[] = [
  {
    name: 'HTML Page card',
    description: 'Defines a standalone HTML page using the :::html container, rendered as a card in Markdown.',
    markdown: `
# HTML Page example

The container below is recognized as an html_page node, and rendered in the main document as an "HTML Page card":

:::html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>HTML Page example</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; }
      h1 { color: #2f54eb; }
      p { line-height: 1.6; }
    </style>
  </head>
  <body>
    <h1>This is a standalone HTML page</h1>
    <p>It can include its own CSS and JS, running independently inside an isolated page or ShadowDOM container provided by the host.</p>
  </body>
</html>
:::
    `.trim(),
  },
];
