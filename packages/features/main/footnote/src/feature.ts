import type {
  SupramarkFeature,
  SupramarkNode,
  SupramarkRootNode,
  SupramarkFootnoteReferenceNode,
  SupramarkFootnoteDefinitionNode,
  FeatureConfigWithOptions,
} from '@supramark/core';
import { footnoteExamples } from './examples.js';
import { makeFeatureConfigHelpers } from '@supramark/core';

/**
 * Footnote Feature
 *
 * Canonical description of footnote syntax support (reference + definition):
 *
 * - Reuses the `footnote_reference` / `footnote_definition` AST already implemented in core;
 * - Does not own the actual parsing/rendering logic;
 * - Mainly used for: documentation, capability discovery, and the Feature configuration bridge.
 *
 * @example
 * ```markdown
 * This is body text[^1], plus an inline footnote ^[inline footnote content].
 *
 * [^1]: Here is the footnote definition content.
 * ```
 *
 * Node type notes:
 * - If this Feature handles only a single node type (e.g. 'diagram'), just use the current config as-is
 * - If this Feature needs to handle multiple node types (e.g. 'math_inline' and 'math_block'),
 *   see the "multi node type handling" comment below for defining the concrete node interface and selector
 */
export const footnoteFeature: SupramarkFeature<
  SupramarkFootnoteReferenceNode | SupramarkFootnoteDefinitionNode
> = {
  metadata: {
    id: '@supramark/feature-footnote',
    name: 'Footnote',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'Footnote syntax support (reference + definition)',
    license: 'Apache-2.0',
    tags: ['footnote', 'reference', 'definition'],
    syntaxFamily: 'main',
  },
  // Footnote - depends on base Markdown (footnote definitions can contain paragraphs, etc.)
  dependencies: ['@supramark/feature-core-markdown'],

  syntax: {
    ast: {
      type: 'footnote_reference',

      selector: (node: SupramarkNode) =>
        node.type === 'footnote_reference' || node.type === 'footnote_definition',

      interface: {
        required: ['type', 'index'],
        optional: ['label'],
        fields: {
          type: {
            type: 'string',
            description:
              'Node type: "footnote_reference" (inline reference) or "footnote_definition" (definition at the end of the document).',
          },
          index: {
            type: 'number',
            description: 'Footnote number (starting from 1), assigned uniformly by the parsing pipeline.',
          },
          label: {
            type: 'string',
            description: 'Raw label, e.g. "note" in [^note].',
          },
        },
      },

      constraints: {
        allowedParents: ['root', 'paragraph', 'list_item'],
        allowedChildren: ['paragraph', 'list', 'code', 'blockquote'],
      },

      examples: [
        {
          type: 'footnote_reference',
          index: 1,
          label: '1',
          identifier: '1',
        } as SupramarkFootnoteReferenceNode,
        {
          type: 'footnote_definition',
          index: 1,
          label: '1',
          identifier: '1',
          children: [],
        } as SupramarkFootnoteDefinitionNode,
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
        // On Web, uses anchor links (<a href="#fn1">)
        needsClientScript: false,
        // No worker needed
        needsWorker: false,
        // No cache needed
        needsCache: false,
      },

      // No external dependencies (uses standard HTML anchors)
      dependencies: [],
    },

    // React Native platform renderer
    rn: {
      platform: 'rn',

      // Infrastructure requirements
      infrastructure: {
        // On RN, uses a ScrollView ref to implement jumping
        needsWorker: false,
        // No cache needed
        needsCache: false,
      },

      // No external dependencies (uses a ScrollView ref)
      dependencies: [],
    },
  },

  // Usage examples
  examples: footnoteExamples,

  // Test definitions
  testing: {
    // Markdown → AST syntax tests
    syntaxTests: {
      cases: [
        {
          name: 'parses a footnote reference',
          input: 'Text[^1]',
          expected: {
            type: 'footnote_reference',
            index: 1,
            label: '1',
          } as SupramarkFootnoteReferenceNode,
          options: {
            typeOnly: false,
            ignoreFields: ['position', 'data', 'subId'],
          },
        },
        {
          name: 'parses a footnote definition',
          input: '[^1]: Footnote content',
          expected: {
            type: 'footnote_definition',
            index: 1,
            label: '1',
          } as SupramarkFootnoteDefinitionNode,
          options: {
            typeOnly: false,
            ignoreFields: ['children', 'position', 'data'],
          },
        },
        {
          name: 'parses multiple footnote references',
          input: 'Text[^1] and [^2]',
          expected: [
            {
              type: 'footnote_reference',
              index: 1,
            } as SupramarkFootnoteReferenceNode,
            {
              type: 'footnote_reference',
              index: 2,
            } as SupramarkFootnoteReferenceNode,
          ],
          options: {
            typeOnly: false,
            ignoreFields: ['label', 'position', 'data', 'subId'],
          },
        },
      ],
    },

    // AST → render output tests
    renderTests: {
      web: [
        {
          name: 'Web renders a footnote reference',
          input: {
            type: 'footnote_reference',
            index: 1,
            label: '1',
          } as SupramarkFootnoteReferenceNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
        {
          name: 'Web renders a footnote definition',
          input: {
            type: 'footnote_definition',
            index: 1,
            label: '1',
            children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Footnote content' }] }],
          } as SupramarkFootnoteDefinitionNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
      rn: [
        {
          name: 'RN renders a footnote reference',
          input: {
            type: 'footnote_reference',
            index: 2,
            label: 'note',
          } as SupramarkFootnoteReferenceNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
    },

    // End-to-end integration tests
    integrationTests: {
      cases: [
        {
          name: 'Footnote end-to-end: reference + definition',
          input: 'Body text[^1]\n\n[^1]: Footnote content',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            const hasReference = nodes.some(
              (n: SupramarkNode) =>
                n.type === 'paragraph' &&
                n.children?.some((c: SupramarkNode) => c.type === 'footnote_reference')
            );
            const hasDefinition = nodes.some(
              (n: SupramarkNode) => n.type === 'footnote_definition'
            );
            return hasReference && hasDefinition;
          },
          platforms: ['web', 'rn'],
        },
        {
          name: 'Footnote end-to-end: multiple footnotes',
          input: 'Text[^1] and [^2]\n\n[^1]: First\n[^2]: Second',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            const references = nodes.reduce((count: number, n: SupramarkNode) => {
              if (n.type === 'paragraph' && Array.isArray(n.children)) {
                return (
                  count +
                  n.children.filter((c: SupramarkNode) => c.type === 'footnote_reference').length
                );
              }
              return count;
            }, 0);
            const definitions = nodes.filter(
              (n: SupramarkNode) => n.type === 'footnote_definition'
            ).length;
            return references >= 2 && definitions >= 2;
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
# Footnote Feature

Provides footnote support for Supramark.

## Features

- Footnote reference
- Footnote definition

## Usage

See the examples directory for more examples.
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'FootnoteFeatureOptions',
          description: 'Configuration options interface for the Footnote Feature (currently empty, reserved for future extension)',
          fields: [],
        },
        {
          name: 'SupramarkFootnoteReferenceNode',
          description: 'AST node interface for a footnote reference, representing an inline footnote reference ([^1])',
          fields: [
            {
              name: 'type',
              type: "'footnote_reference'",
              description: 'Node type identifier, always "footnote_reference"',
              required: true,
            },
            {
              name: 'index',
              type: 'number',
              description: 'Footnote number (starting from 1), assigned uniformly by the parsing pipeline',
              required: true,
            },
            {
              name: 'label',
              type: 'string',
              description: 'Raw label, e.g. "note" in [^note]',
              required: false,
            },
            {
              name: 'subId',
              type: 'string',
              description: 'Sub-ID, used for multiple references to the same footnote',
              required: false,
            },
          ],
        },
        {
          name: 'SupramarkFootnoteDefinitionNode',
          description: 'AST node interface for a footnote definition, representing the footnote definition content at the end of the document ([^1]: ...)',
          fields: [
            {
              name: 'type',
              type: "'footnote_definition'",
              description: 'Node type identifier, always "footnote_definition"',
              required: true,
            },
            {
              name: 'index',
              type: 'number',
              description: 'Footnote number (starting from 1), corresponding to the reference\'s index',
              required: true,
            },
            {
              name: 'label',
              type: 'string',
              description: 'Raw label, e.g. "note" in [^note]',
              required: false,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'List of footnote content nodes, can contain paragraphs, lists, code blocks, etc.',
              required: true,
            },
          ],
        },
      ],

      functions: [
        {
          name: 'createFootnoteFeatureConfig',
          description: 'Creates a Footnote Feature config object, used to enable footnote support in SupramarkConfig',
          parameters: [
            {
              name: 'enabled',
              type: 'boolean',
              description: 'Whether to enable the Footnote Feature',
              optional: false,
            },
            {
              name: 'options',
              type: 'FootnoteFeatureOptions',
              description: 'Footnote Feature configuration options (currently an empty object)',
              optional: true,
            },
          ],
          returns: 'FeatureConfigWithOptions<FootnoteFeatureOptions>',
          examples: [
            `import { createFootnoteFeatureConfig } from '@supramark/feature-footnote';

const config = {
  features: [
    createFootnoteFeatureConfig(true),
  ],
};`,
          ],
        },
        {
          name: 'getFootnoteFeatureOptions',
          description: 'Extracts the Footnote Feature configuration options from a SupramarkConfig',
          parameters: [
            {
              name: 'config',
              type: 'SupramarkConfig',
              description: 'The Supramark configuration object',
              optional: true,
            },
          ],
          returns: 'FootnoteFeatureOptions | undefined',
          examples: [
            `import { getFootnoteFeatureOptions } from '@supramark/feature-footnote';

const options = getFootnoteFeatureOptions(config);`,
          ],
        },
      ],

      types: [
        {
          name: 'FootnoteFeatureConfig',
          description:
            'Footnote Feature configuration type, a type alias for FeatureConfigWithOptions<FootnoteFeatureOptions>',
          definition:
            'type FootnoteFeatureConfig = FeatureConfigWithOptions<FootnoteFeatureOptions>',
        },
      ],
    },

    bestPractices: [
      'Use the [^label] format for footnote references; label can be a number or text',
      'Use the [^label]: content format for footnote definitions, usually placed at the end of the document',
      'The same footnote can be referenced multiple times; the system handles it automatically',
      'Footnote numbers are assigned automatically by the system, starting from 1 in reference order',
    ],

    faq: [
      {
        question: 'What is the footnote syntax format?',
        answer: 'Reference format: [^label]; definition format: [^label]: footnote content. label can be a number or a text identifier.',
      },
      {
        question: 'How are footnote numbers determined?',
        answer: 'Footnote numbers are assigned automatically by the parser, incrementing from 1 in the order footnote references appear in the document.',
      },
      {
        question: 'Can the same footnote be referenced multiple times?',
        answer: 'Yes. Referencing the same label multiple times generates multiple reference nodes, which share the same definition and number.',
      },
      {
        question: 'What content can a footnote definition contain?',
        answer:
          'A footnote definition can contain paragraphs, lists, code blocks, blockquotes, and other Markdown elements, supporting complex content structures.',
      },
    ],
  },
};

/**
 * Configuration options for the Footnote Feature.
 */
export interface FootnoteFeatureOptions {
  // Currently empty, reserved for future extension
}

export type FootnoteFeatureConfig = FeatureConfigWithOptions<FootnoteFeatureOptions>;

const footnoteHelpers = makeFeatureConfigHelpers<FootnoteFeatureOptions>(
  '@supramark/feature-footnote'
);
export const createFootnoteFeatureConfig = footnoteHelpers.create;
export const getFootnoteFeatureOptions = footnoteHelpers.getOptions;
