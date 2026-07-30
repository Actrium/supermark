import type { ExampleDefinition } from '@supramark/core';

/**
 * Emoji Feature usage examples
 */
export const emojiExamples: ExampleDefinition[] = [
  {
    name: 'Emoji / shortcode',
    description: 'Shows how Emoji shortcodes such as :smile: / :rocket: are parsed.',
    markdown: `
# Emoji Example

GitHub-style shortcodes are supported:

- :smile: :joy: :wink:
- :rocket: :tada: :warning:

Native Emoji characters 😄🚀🎉 can also be typed directly.
    `.trim(),
  },
];
