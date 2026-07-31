/**
 * Weather Feature examples
 *
 * @packageDocumentation
 */

import type { ExampleDefinition } from '@supramark/core';

export const weatherExamples: ExampleDefinition[] = [
  {
    name: 'Weather card - YAML format',
    description: 'Configure a weather card using YAML format (the default)',
    markdown: `
:::weather yaml
location: Beijing
units: metric
:::
`.trim(),
  },
  {
    name: 'Weather card - JSON format',
    description: 'Configure a weather card using JSON format',
    markdown: `
:::weather json
{
  "location": "Tokyo",
  "units": "metric"
}
:::
`.trim(),
  },
  {
    name: 'Weather card - TOON format',
    description: 'Configure a weather card using the compact TOON tabular format',
    markdown: `
:::weather toon
location: London
units: imperial
:::
`.trim(),
  },
  {
    name: 'Multiple weather cards',
    description: 'Show weather for several cities',
    markdown: `
:::weather yaml
location: New York
units: imperial
:::

:::weather yaml
location: Paris
units: metric
:::

:::weather yaml
location: Sydney
units: metric
:::
`.trim(),
  },
];
