import type {
  SupramarkContainerNode,
  SupramarkNode,
  SupramarkRootNode,
  FeatureConfigWithOptions,
  SupramarkFeature,
} from '@supramark/core';
import { makeFeatureConfigHelpers, FeatureRegistry } from '@supramark/core';
import { htmlPageExamples } from './examples.js';

interface HtmlPageContainerData {
  html: string;
  title?: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export type SupramarkHtmlPageContainerNode = SupramarkContainerNode & {
  name: 'html';
  data: HtmlPageContainerData;
};

const isHtmlPageContainer = (node: SupramarkNode): node is SupramarkHtmlPageContainerNode => {
  return node.type === 'container' && node.name === 'html';
};

/**
 * Html Page Feature
 *
 * Provides standalone HTML page node support for Supramark.
 *
 * - Parses :::html containers into `html_page` AST nodes;
 * - Renders them as a "card" within the main Markdown flow;
 * - The actual interaction (e.g. opening a standalone page on card tap) is implemented by the host.
 */
export const htmlPageFeature: SupramarkFeature<SupramarkHtmlPageContainerNode> = {
  metadata: {
    id: '@supramark/feature-html-page',
    name: 'HTML Page',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'Defines standalone HTML page nodes using the :::html container, with card-style preview support.',
    license: 'Apache-2.0',
    tags: ['html', 'page', 'card', 'container'],
    syntaxFamily: 'container',
  },

  syntax: {
    ast: {
      type: 'container',
      selector: isHtmlPageContainer,
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
            description: 'Container name, always "html".',
          },
          data: {
            type: 'object',
            description: 'Container data, containing the full HTML text and optional metadata.',
          },
          children: {
            type: 'array',
            description: 'List of child nodes, usually empty for an html container.',
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
          name: 'html',
          data: {
            html: '<!doctype html><html><body>Hello</body></html>',
            title: 'Example Page',
          },
          children: [],
        } as SupramarkHtmlPageContainerNode,
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

  examples: htmlPageExamples,

  testing: {
    syntaxTests: {
      cases: [
        {
          name: 'parses a :::html container',
          input: ':::html\n<html><body>Test</body></html>\n:::',
          expected: {
            type: 'container',
            name: 'html',
          } as SupramarkHtmlPageContainerNode,
          options: { typeOnly: true },
        },
      ],
    },
    renderTests: {
      web: [
        {
          name: 'Web renders a placeholder card',
          input: {
            type: 'container',
            name: 'html',
            data: { html: '...' },
            children: [],
          } as SupramarkHtmlPageContainerNode,
          expected: (output: unknown) => output !== null,
        },
      ],
    },
    integrationTests: {
      cases: [
        {
          name: 'HTML Page integration test',
          input: ':::html\ncontent\n:::',
          validate: (result: unknown) =>
            ((result as SupramarkRootNode).children?.[0] as SupramarkContainerNode | undefined)
              ?.name === 'html',
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
# HTML Page Feature

Defines standalone HTML page nodes using the \`:::html\` container.

In the host application, this node is typically rendered as a card preview. On user interaction, the host-provided callback can be used to open a standalone page, a modal, or an external browser to load the HTML.
    `.trim(),
    api: {
      interfaces: [
        {
          name: 'HtmlPageFeatureOptions',
          description: 'HTML Page configuration options',
          fields: [
            {
              name: 'webOpenMode',
              type: "'window' | 'callback-only'",
              description: 'Open mode on the web side',
              required: false,
              default: "'window'",
            },
          ],
        },
      ],
      functions: [
        {
          name: 'createHtmlPageFeatureConfig',
          description: 'Creates the HTML Page feature config',
          parameters: [
            { name: 'enabled', type: 'boolean', description: 'Whether it is enabled' },
            { name: 'options', type: 'HtmlPageFeatureOptions', description: 'Options', optional: true },
          ],
          returns: 'HtmlPageFeatureConfig',
        },
      ],
      types: [
        {
          name: 'HtmlPageFeatureConfig',
          description: 'Configuration type definition',
          definition: 'type HtmlPageFeatureConfig = FeatureConfigWithOptions<HtmlPageFeatureOptions>',
        },
      ],
    },
    bestPractices: [
      'For complex third-party HTML interactions, use this feature to isolate them.',
      'Pair it with the host\'s onOpenHtmlPage callback for deeper integration.',
    ],
  },
};

export interface HtmlPageFeatureOptions {
  webOpenMode?: 'window' | 'callback-only';
  rnOpenMode?: 'callback-only';
}

export type HtmlPageFeatureConfig = FeatureConfigWithOptions<HtmlPageFeatureOptions>;

const htmlPageHelpers = makeFeatureConfigHelpers<HtmlPageFeatureOptions>(
  '@supramark/feature-html-page'
);
export const createHtmlPageFeatureConfig = htmlPageHelpers.create;
export const getHtmlPageFeatureOptions = htmlPageHelpers.getOptions;

FeatureRegistry.register(htmlPageFeature);
