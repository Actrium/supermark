import type {
  SupramarkFeature,
  SupramarkNode,
  SupramarkRootNode,
  SupramarkDefinitionListNode,
  SupramarkDefinitionItemNode,
  FeatureConfigWithOptions,
} from '@supramark/core';
import { definitionListExamples } from './examples.js';
import { makeFeatureConfigHelpers } from '@supramark/core';

/**
 * Definition List Feature
 *
 * Canonical definition of definition-list syntax support (Term + multi-paragraph description).
 *
 * - Reuses the `definition_list` / `definition_item` AST in core;
 * - In AST v2, definition_item carries definition_term / definition_description via children;
 * - Parsing logic is implemented by the supramark-markdown AST v2 parser;
 * - Rendering logic is handled by @supramark/rn / @supramark/web.
 *
 * @example
 * ```markdown
 * TODO: add a Markdown example
 * ```
 *
 * Node type notes:
 * - If this Feature handles only a single node type (e.g. 'diagram'), just use the current config as-is
 * - If this Feature needs to handle multiple node types (e.g. 'math_inline' and 'math_block'),
 *   see the "multi node type handling" comment below for defining the concrete node interface and selector
 */
export const definitionListFeature: SupramarkFeature<SupramarkDefinitionListNode> = {
  metadata: {
    id: '@supramark/feature-definition-list',
    name: 'Definition List',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'Definition-list syntax support (Term + multi-paragraph description)',
    license: 'Apache-2.0',
    tags: ['definition-list', 'dl', 'term'],
    syntaxFamily: 'main',
  },
  // Definition List - depends on base Markdown (term and descriptions can contain inline/block nodes)
  dependencies: ['@supramark/feature-core-markdown'],

  syntax: {
    ast: {
      type: 'definition_list',

      interface: {
        required: ['type', 'children'],
        optional: [],
        fields: {
          type: {
            type: 'string',
            description: 'Node type, always "definition_list".',
          },
          children: {
            type: 'nodes',
            description: 'Array of definition-list entries, each entry a definition_item node.',
          },
        },
      },

      constraints: {
        allowedParents: ['root'],
        allowedChildren: ['definition_item'],
      },

      examples: [
        {
          type: 'definition_list',
          children: [],
        } as SupramarkDefinitionListNode,
      ],
    },

    // Optional: validation rules
    // validator: {
    //   validate: (node) => {
    //     // TODO: add validation logic
    //     return { valid: true, errors: [] };
    //   }
    // },
  },

  // Renderer definitions
  renderers: {
    // Web platform renderer
    web: {
      platform: 'web',

      // Infrastructure requirements
      infrastructure: {
        // On Web, uses semantic HTML elements (dl / dt / dd)
        needsClientScript: false,
        // No worker needed
        needsWorker: false,
        // No cache needed
        needsCache: false,
      },

      // No external dependencies (uses standard HTML dl elements)
      dependencies: [],
    },

    // React Native platform renderer
    rn: {
      platform: 'rn',

      // Infrastructure requirements
      infrastructure: {
        // On RN, renders using View + Text components
        needsWorker: false,
        // No cache needed
        needsCache: false,
      },

      // No external dependencies (uses View / Text components)
      dependencies: [],
    },
  },

  // Usage examples
  examples: definitionListExamples,

  // Test definitions
  testing: {
    // Markdown → AST syntax tests
    syntaxTests: {
      cases: [
        {
          name: 'parses a simple definition list',
          input: 'Term\n:   Definition',
          expected: {
            type: 'definition_list',
            children: [],
          } as SupramarkDefinitionListNode,
          options: {
            typeOnly: true,
          },
        },
        {
          name: 'parses a term with multiple definitions',
          input: 'Apple\n:   Fruit\n:   Company name',
          expected: {
            type: 'definition_list',
          } as SupramarkDefinitionListNode,
          options: {
            typeOnly: true,
          },
        },
        {
          name: 'parses multiple terms',
          input: 'HTML\nCSS\n:   Web technology',
          expected: {
            type: 'definition_list',
          } as SupramarkDefinitionListNode,
          options: {
            typeOnly: true,
          },
        },
      ],
    },

    // AST → render output tests
    renderTests: {
      web: [
        {
          name: 'Web renders a definition list',
          input: {
            type: 'definition_list',
            children: [
              {
                type: 'definition_item',
                children: [
                  {
                    type: 'definition_term',
                    children: [{ type: 'text', value: 'Term' }],
                  },
                  {
                    type: 'definition_description',
                    children: [
                      {
                        type: 'paragraph',
                        children: [{ type: 'text', value: 'Definition' }],
                      },
                    ],
                  },
                ],
              },
            ],
          } as SupramarkDefinitionListNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
      rn: [
        {
          name: 'RN renders a definition list',
          input: {
            type: 'definition_list',
            children: [
              {
                type: 'definition_item',
                children: [
                  {
                    type: 'definition_term',
                    children: [{ type: 'text', value: 'API' }],
                  },
                  {
                    type: 'definition_description',
                    children: [
                      {
                        type: 'paragraph',
                        children: [{ type: 'text', value: 'Application Programming Interface' }],
                      },
                    ],
                  },
                ],
              },
            ],
          } as SupramarkDefinitionListNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
    },

    // End-to-end integration tests
    integrationTests: {
      cases: [
        {
          name: 'DefinitionList end-to-end: a single definition',
          input: 'Markdown\n:   Lightweight markup language',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            return nodes.some((n: SupramarkNode) => n.type === 'definition_list');
          },
          platforms: ['web', 'rn'],
        },
        {
          name: 'DefinitionList end-to-end: multiple definitions',
          input: 'TypeScript\n:   Strongly-typed JavaScript\n:   Developed by Microsoft',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            const defList = nodes.find((n: SupramarkNode) => n.type === 'definition_list');
            if (!defList) return false;
            const items = defList.children || [];
            return items.some(
              (item: SupramarkDefinitionItemNode) =>
                item.type === 'definition_item' &&
                Array.isArray(item.children) &&
                item.children.some((child: SupramarkNode) => child.type === 'definition_description')
            );
          },
          platforms: ['web', 'rn'],
        },
      ],
    },

    // Coverage requirements
    coverageRequirements: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
  },

  // Documentation definitions
  documentation: {
    readme: `
# Definition List Feature

Provides definition-list support for Supramark.

## Features

- Term definitions
- Multi-paragraph descriptions

## Usage

See the examples directory for more examples.
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'DefinitionListFeatureOptions',
          description: 'Configuration options interface for the Definition List Feature (currently empty, reserved for future extension)',
          fields: [],
        },
        {
          name: 'SupramarkDefinitionListNode',
          description: 'AST node interface for a definition list, representing a list of terms and their definitions',
          fields: [
            {
              name: 'type',
              type: "'definition_list'",
              description: 'Node type identifier, always "definition_list"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkDefinitionItemNode[]',
              description: 'Array of definition-list entries, each entry a term and its definition',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkDefinitionItemNode',
          description: 'AST node interface for a definition-list item, containing the term and definition description via children',
          fields: [
            {
              name: 'type',
              type: "'definition_item'",
              description: 'Node type identifier, always "definition_item"',
              required: true,
            },
            {
              name: 'children',
              type: 'Array<SupramarkDefinitionTermNode | SupramarkDefinitionDescriptionNode>',
              description: 'definition_term and definition_description child nodes, in source order',
              required: true,
            },
          ],
        },
      ],

      functions: [
        {
          name: 'createDefinitionListFeatureConfig',
          description:
            'Creates a Definition List Feature config object, used to enable definition-list support in SupramarkConfig',
          parameters: [
            {
              name: 'enabled',
              type: 'boolean',
              description: 'Whether to enable the Definition List Feature',
              optional: false,
            },
            {
              name: 'options',
              type: 'DefinitionListFeatureOptions',
              description: 'Definition List Feature configuration options (currently an empty object)',
              optional: true,
            },
          ],
          returns: 'FeatureConfigWithOptions<DefinitionListFeatureOptions>',
          examples: [
            `import { createDefinitionListFeatureConfig } from '@supramark/feature-definition-list';

const config = {
  features: [
    createDefinitionListFeatureConfig(true),
  ],
};`,
          ],
        },
        {
          name: 'getDefinitionListFeatureOptions',
          description: 'Extracts the Definition List Feature configuration options from a SupramarkConfig',
          parameters: [
            {
              name: 'config',
              type: 'SupramarkConfig',
              description: 'The Supramark configuration object',
              optional: true,
            },
          ],
          returns: 'DefinitionListFeatureOptions | undefined',
          examples: [
            `import { getDefinitionListFeatureOptions } from '@supramark/feature-definition-list';

const options = getDefinitionListFeatureOptions(config);`,
          ],
        },
      ],

      types: [
        {
          name: 'DefinitionListFeatureConfig',
          description:
            'Definition List Feature configuration type, a type alias for FeatureConfigWithOptions<DefinitionListFeatureOptions>',
          definition:
            'type DefinitionListFeatureConfig = FeatureConfigWithOptions<DefinitionListFeatureOptions>',
        },
      ],
    },

    bestPractices: [
      'Put the term on its own line; start the definition with :   (at least 3 spaces or 1 tab after the colon)',
      'A term can have multiple definitions; each definition goes on its own line starting with :  ',
      'Multiple terms can share the same definition',
      'Definition content supports multiple paragraphs; use indentation to preserve structure',
    ],

    faq: [
      {
        question: 'What is the definition-list syntax format?',
        answer:
          'The term is on its own line; the definition starts with :   (at least 3 spaces or 1 tab after the colon). For example: Term\\n:   Definition',
      },
      {
        question: 'Can a term have multiple definitions?',
        answer:
          'Yes. Each definition just needs its own line starting with :  , for example: Term\\n:   Definition 1\\n:   Definition 2',
      },
      {
        question: 'Can multiple terms share a definition?',
        answer: 'Yes. Write several consecutive terms followed by one definition, and those terms will share that definition.',
      },
    ],
  },
};

/**
 * Configuration options for the Definition List Feature.
 */
export interface DefinitionListFeatureOptions {
  // Currently empty, reserved for future extension
}

export type DefinitionListFeatureConfig = FeatureConfigWithOptions<DefinitionListFeatureOptions>;

const definitionListHelpers = makeFeatureConfigHelpers<DefinitionListFeatureOptions>(
  '@supramark/feature-definition-list'
);
export const createDefinitionListFeatureConfig = definitionListHelpers.create;
export const getDefinitionListFeatureOptions = definitionListHelpers.getOptions;
