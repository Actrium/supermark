import type { ExampleDefinition } from '@supramark/core';

/**
 * Definition List Feature usage examples
 */
export const definitionListExamples: ExampleDefinition[] = [
  {
    name: 'Definition List',
    description: 'Shows the term + multi-paragraph description syntax for definition lists.',
    markdown: `
# Definition List Example

HTTP
:   An application-layer protocol used for hypertext transfer.
:   Currently the most common Web protocol.

HTTPS
:   A secure protocol that adds TLS encryption on top of HTTP.
    `.trim(),
  },
];
