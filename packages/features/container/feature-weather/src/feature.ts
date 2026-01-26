import type { SupramarkContainerNode, SupramarkFeature } from '@supramark/core';
import { FeatureRegistry } from '@supramark/core';
import { weatherExamples } from './examples.js';

/**
 * Weather Feature
 *
 * A small demo feature that parses a `:::weather` container into a generic
 * `type: 'container'` node (name = 'weather') so host apps can inject their own renderer.
 *
 * @example
 * ```markdown
 * :::weather
 * city: Shanghai
 * condition: Cloudy
 * tempC: 22
 * :::
 * ```
 */
export const weatherFeature: SupramarkFeature<SupramarkContainerNode> = {
  metadata: {
    id: '@supramark/feature-weather',
    name: 'Weather',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'Weather card container (host-rendered)',
    license: 'Apache-2.0',
    tags: ['container', 'weather', 'demo'],
    syntaxFamily: 'container',
  },

  syntax: {
    ast: {
      type: 'container',
      selector: (node) => node.type === 'container' && (node as any).name === 'weather',
      interface: {
        required: ['type', 'name', 'children'],
        optional: ['params', 'data'],
        fields: {
          type: { type: 'string', description: "Node type identifier (always 'container')." },
          name: { type: 'string', description: "Container name (always 'weather')." },
          params: { type: 'string', description: 'Raw params string after :::weather' },
          data: { type: 'object', description: 'Parsed weather data (city/condition/tempC/icon).' },
          children: { type: 'array', description: 'Container children (empty for opaque containers).' },
        },
      },
      constraints: {
        allowedParents: ['root', 'paragraph', 'list_item'],
        allowedChildren: ['paragraph', 'text', 'strong', 'emphasis', 'link'],
      },
      examples: [
        {
          type: 'container',
          name: 'weather',
          data: { city: 'Shanghai', condition: 'Cloudy', tempC: 22 },
          children: [],
        } as SupramarkContainerNode,
      ],
    },
  },

  renderers: {
    web: {
      platform: 'web',
      infrastructure: {
        needsClientScript: false,
        needsWorker: false,
        needsCache: false,
      },
      dependencies: [],
    },
  },

  examples: weatherExamples,

  testing: {
    syntaxTests: {
      cases: [
        {
          name: 'Parse :::weather as container node',
          input: [':::weather', 'city: Shanghai', 'tempC: 22', ':::'].join('\n'),
          expected: { type: 'container', name: 'weather' } as any,
          options: { typeOnly: true },
        },
      ],
    },
  },

  documentation: {
    readme: `# Weather Feature\n\nProvides a demo \`:::weather\` container. Hosts should render it via \`containerRenderers.weather\`.\n`.trim(),
  },
};

// Optional registration for feature discovery.
FeatureRegistry.register(weatherFeature);
