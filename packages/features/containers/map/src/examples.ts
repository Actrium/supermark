import type { ExampleDefinition } from '@supramark/core';

/**
 * Map Feature examples
 *
 * Uses the :::map container to define a map card:
 * - center: the map's center point;
 * - zoom: the zoom level;
 * - marker: a single input marker point; the AST v2 output is data.markers[].
 */
export const mapExamples: ExampleDefinition[] = [
  {
    name: 'Basic map card',
    description: 'Use :::map to define a map card with a center point and a marker.',
    markdown: `
# Map example

The container below is recognized as a map node and rendered as a "map card" in the main document:

:::map
center: [34.05, -118.24]
zoom: 12
marker:
  lat: 34.05
  lng: -118.24
:::
    `.trim(),
  },
  {
    name: 'Map with only a center point',
    description: 'Provide only center, without a marker, to show an overview of an area.',
    markdown: `
:::map
center: [31.2304, 121.4737]
zoom: 10
:::
    `.trim(),
  },
];
