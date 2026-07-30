import type {
  SupramarkContainerNode,
  SupramarkNode,
  SupramarkRootNode,
  FeatureConfigWithOptions,
  SupramarkFeature,
} from '@supramark/core';
import { makeFeatureConfigHelpers, FeatureRegistry } from '@supramark/core';
import { mapExamples } from './examples.js';

interface MapContainerData {
  center: [number, number];
  zoom?: number;
  markers?: Array<{
    lat: number;
    lng: number;
    label?: string;
    id?: string;
    data?: Record<string, unknown>;
  }>;
  meta?: Record<string, unknown>;
}

export type SupramarkMapContainerNode = SupramarkContainerNode & {
  name: 'map';
  data: MapContainerData;
};

const isMapContainer = (node: SupramarkNode): node is SupramarkMapContainerNode => {
  return node.type === 'container' && node.name === 'map';
};

/**
 * Map Feature
 *
 * Provides map-card placeholder support for Supramark.
 *
 * - Parses `:::map` containers into `map` nodes;
 * - Carries center point, zoom level, and marker data;
 * - The actual map implementation (Apple Maps, Google Maps, Mapbox, etc.) is left to the host.
 */
export const mapFeature: SupramarkFeature<SupramarkMapContainerNode> = {
  metadata: {
    id: '@supramark/feature-map',
    name: 'Map',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'Defines a map placeholder node using the :::map container, supporting a lat/lng center point and markers.',
    license: 'Apache-2.0',
    tags: ['map', 'location', 'geo', 'container'],
    syntaxFamily: 'container',
  },

  syntax: {
    ast: {
      type: 'container',
      selector: isMapContainer,
      interface: {
        required: ['type', 'name', 'data', 'children'],
        optional: ['params'],
        fields: {
          type: {
            type: 'string',
            description: 'Node type, always "container".',
          },
          name: {
            type: 'string',
            description: 'Container name, always "map".',
          },
          data: {
            type: 'object',
            description: 'Map data, including the center point, zoom level, and markers array.',
          },
          children: {
            type: 'array',
            description: 'Child node list; usually empty for a map container.',
          },
        },
      },
      constraints: {
        allowedParents: ['root', 'paragraph', 'list_item'],
        allowedChildren: [],
      },
      examples: [
        {
          type: 'container',
          name: 'map',
          data: {
            center: [39.9042, 116.4074],
            zoom: 12,
            markers: [{ lat: 39.9042, lng: 116.4074 }],
          },
          children: [],
        } as SupramarkMapContainerNode,
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
    rn: {
      platform: 'rn',
      infrastructure: {
        needsWorker: false,
        needsCache: false,
      },
      dependencies: [],
    },
  },

  examples: mapExamples,

  testing: {
    syntaxTests: {
      cases: [
        {
          name: 'Parse a :::map container',
          input: ':::map\ncenter: [0, 0]\n:::',
          expected: {
            type: 'container',
            name: 'map',
          } as SupramarkMapContainerNode,
          options: { typeOnly: true },
        },
      ],
    },
    renderTests: {
      web: [
        {
          name: 'Web renders the placeholder layer',
          input: {
            type: 'container',
            name: 'map',
            mode: 'opaque',
            data: { center: [0, 0] },
            children: [],
          } as SupramarkMapContainerNode,
          expected: (output: unknown) => output !== null,
        },
      ],
    },
    integrationTests: {
      cases: [
        {
          name: 'Map integration test',
          input: ':::map\ncenter: [0, 0]\n:::',
          validate: (result: unknown) =>
            ((result as SupramarkRootNode).children?.[0] as SupramarkContainerNode | undefined)
              ?.name === 'map',
          platforms: ['web', 'rn'],
        },
      ],
    },
    coverageRequirements: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },

  documentation: {
    readme: `
# Map Feature

Defines a map placeholder node using the \`:::map\` container.

Supports configuring the lat/lng center point, zoom level, and markers via YAML or JSON. The host application renders the interactive map from this data.
    `.trim(),
    api: {
      interfaces: [
        {
          name: 'MapFeatureOptions',
          description: 'Map config options',
          fields: [
            {
              name: 'provider',
              type: "'apple' | 'google' | 'mapbox' | 'custom'",
              description: 'Map service provider identifier',
              required: false,
            },
            {
              name: 'defaultZoom',
              type: 'number',
              description: 'Default zoom level',
              required: false,
              default: '12',
            },
          ],
        },
      ],
      functions: [
        {
          name: 'createMapFeatureConfig',
          description: 'Create the Map feature config',
          parameters: [
            { name: 'enabled', type: 'boolean', description: 'Whether the feature is enabled' },
            { name: 'options', type: 'MapFeatureOptions', description: 'Options', optional: true },
          ],
          returns: 'MapFeatureConfig',
        },
      ],
      types: [
        {
          name: 'MapFeatureConfig',
          description: 'Config type definition',
          definition: 'type MapFeatureConfig = FeatureConfigWithOptions<MapFeatureOptions>',
        },
      ],
    },
    bestPractices: [
      'Clearly document the lat/lng ordering.',
      'Use the provider field to switch the underlying map engine across platforms.',
    ],
  },
};

export interface MapFeatureOptions {
  provider?: 'apple' | 'google' | 'mapbox' | 'custom';
  defaultZoom?: number;
}

export type MapFeatureConfig = FeatureConfigWithOptions<MapFeatureOptions>;

const mapHelpers = makeFeatureConfigHelpers<MapFeatureOptions>('@supramark/feature-map');
export const createMapFeatureConfig = mapHelpers.create;
export const getMapFeatureOptions = mapHelpers.getOptions;

FeatureRegistry.register(mapFeature);
