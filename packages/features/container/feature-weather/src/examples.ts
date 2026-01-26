import type { ExampleDefinition } from '@supramark/core';

/**
 * Weather Feature examples
 */
export const weatherExamples: ExampleDefinition[] = [
  {
    name: 'Weather card (basic)',
    description: 'A simple weather container example.',
    markdown: [
      '# Weather Demo',
      '',
      ':::weather',
      'city: Shanghai',
      'condition: Cloudy',
      'tempC: 22',
      ':::',
    ].join('\n'),
  },
];
