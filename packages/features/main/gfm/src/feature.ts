import type {
  SupramarkFeature,
  SupramarkNode,
  SupramarkRootNode,
  SupramarkListItemNode,
  FeatureConfigWithOptions,
} from '@supramark/core';
import { gfmExamples } from './examples.js';
import { makeFeatureConfigHelpers } from '@supramark/core';

/**
 * GFM Feature
 *
 * GitHub Flavored Markdown extension (strikethrough / task lists / tables)
 *
 * @example
 * ```markdown
 * - [ ] Incomplete task
 * - [x] Completed task
 *
 * ~~Struck-through text~~
 *
 * | Col 1 | Col 2 |
 * | ---- | ---- |
 * |  1   |  2   |
 * ```
 *
 * Node type notes:
 * - If this Feature only handles a single node type (e.g. 'diagram'), just use the current config as-is
 * - If this Feature needs to handle multiple node types (e.g. 'math_inline' and 'math_block'),
 *   see the "multi node type handling" comment below to define concrete node interfaces and a selector
 */
export const gfmFeature: SupramarkFeature<SupramarkNode> = {
  metadata: {
    id: '@supramark/feature-gfm',
    name: 'GFM',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'GitHub Flavored Markdown extension (strikethrough / task lists / tables)',
    license: 'Apache-2.0',
    tags: ['gfm', 'table', 'task-list', 'strikethrough'],
    syntaxFamily: 'main',
  },
  // GFM extension - depends on base Markdown (strikethrough, task list, and table children all need core)
  dependencies: ['@supramark/feature-core-markdown'],

  syntax: {
    ast: {
      /**
       * Because GFM covers multiple node types (delete / task list / table),
       * this Feature uses a "virtual" entry node type and matches at runtime via a selector:
       *
       * - Strikethrough: `node.type === 'delete'`
       * - Task list item: `node.type === 'list_item' && node.checked !== undefined`
       * - Table related: `node.type === 'table' | 'table_row' | 'table_cell'`
       *
       * The `type` here only identifies Feature ownership, it does not map to a single AST type.
       */
      type: 'gfm',
      selector: (node: SupramarkNode) => {
        if (node.type === 'delete') return true;
        if (node.type === 'list_item' && 'checked' in node && node.checked !== undefined)
          return true;
        if (node.type === 'table' || node.type === 'table_row' || node.type === 'table_cell') {
          return true;
        }
        return false;
      },

      /**
       * Note: GFM is a virtual node that does not correspond to a single AST node type.
       * It matches multiple actual node types (delete, table, task-list) via the selector,
       * so it does not define a concrete interface.
       */
      // interface: undefined (a virtual node has no interface)

      constraints: {
        allowedParents: ['root'],
        allowedChildren: [],
      },

      examples: [
        // Strikethrough node example
        {
          type: 'delete',
          children: [
            {
              type: 'text',
              value: 'Deleted text',
            },
          ],
        } as SupramarkNode,
        // Table node example
        {
          type: 'table',
          children: [
            {
              type: 'table_row',
              children: [
                {
                  type: 'table_cell',
                  children: [],
                },
              ],
            },
          ],
        } as SupramarkNode,
        // Task list item example
        {
          type: 'list_item',
          checked: true,
          children: [],
        } as SupramarkNode,
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
        // The web side renders with basic HTML (table / del / checkbox)
        needsClientScript: false,
        // No worker needed
        needsWorker: false,
        // No cache needed
        needsCache: false,
      },

      // No external dependencies (uses standard HTML elements)
      dependencies: [],
    },

    // React Native platform renderer
    rn: {
      platform: 'rn',

      // Infrastructure requirements
      infrastructure: {
        // The RN side renders with basic components
        needsWorker: false,
        // No cache needed
        needsCache: false,
      },

      // No external dependencies (uses View / Text components)
      dependencies: [],
    },
  },

  // Usage examples
  examples: gfmExamples,

  // Test definitions
  testing: {
    // Markdown -> AST syntax tests
    syntaxTests: {
      cases: [
        {
          name: 'parses strikethrough',
          input: 'This is ~~deleted text~~ content',
          expected: {
            type: 'delete',
            children: [{ type: 'text', value: 'deleted text' }],
          } as SupramarkNode,
          options: {
            typeOnly: false,
            ignoreFields: ['position', 'data'],
          },
        },
        {
          name: 'parses a task list',
          input: '- [x] Completed task\n- [ ] Incomplete task',
          expected: [
            {
              type: 'list_item',
              checked: true,
            } as SupramarkNode,
            {
              type: 'list_item',
              checked: false,
            } as SupramarkNode,
          ],
          options: {
            typeOnly: false,
            ignoreFields: ['children', 'position', 'data'],
          },
        },
        {
          name: 'parses a table',
          input: '| Col1 | Col2 |\n| --- | --- |\n| A | B |',
          expected: {
            type: 'table',
            children: [],
          } as SupramarkNode,
          options: {
            typeOnly: true,
          },
        },
      ],
    },

    // AST -> render output tests
    renderTests: {
      web: [
        {
          name: 'Web renders strikethrough',
          input: {
            type: 'delete',
            children: [{ type: 'text', value: 'deleted content' }],
          } as SupramarkNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
        {
          name: 'Web renders a task list',
          input: {
            type: 'list_item',
            checked: true,
            children: [{ type: 'text', value: 'task' }],
          } as SupramarkNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
      rn: [
        {
          name: 'RN renders a table',
          input: {
            type: 'table',
            children: [
              {
                type: 'table_row',
                children: [
                  { type: 'table_cell', header: true, children: [{ type: 'text', value: 'heading' }] },
                ],
              },
            ],
          } as SupramarkNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
    },

    // End-to-end integration tests
    integrationTests: {
      cases: [
        {
          name: 'GFM end-to-end: strikethrough + task list',
          input: '~~deleted~~ text\n\n- [x] task1\n- [ ] task2',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            const hasDelete = nodes.some(
              (n: SupramarkNode) =>
                n.type === 'paragraph' &&
                n.children?.some((c: SupramarkNode) => c.type === 'delete')
            );
            const hasTaskList = nodes.some(
              (n: SupramarkNode) =>
                n.type === 'list' &&
                n.children?.some(
                  (item: SupramarkNode) =>
                    (item as SupramarkListItemNode).checked !== undefined
                )
            );
            return hasDelete && hasTaskList;
          },
          platforms: ['web', 'rn'],
        },
        {
          name: 'GFM end-to-end: full table',
          input: '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            const hasTable = nodes.some((n: SupramarkNode) => n.type === 'table');
            return hasTable;
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
# GFM Feature

Provides GitHub Flavored Markdown extension support for Supramark.

## Features

- Strikethrough
- Task lists
- Tables

## Usage

See the examples directory for more samples.
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'GFMFeatureOptions',
          description:
            'Configuration options interface for the GFM Feature (currently empty, reserved for future extension)',
          fields: [],
        },
        {
          name: 'SupramarkDeleteNode',
          description: 'Strikethrough AST node interface, representing struck-through text (~~...~~)',
          fields: [
            {
              name: 'type',
              type: "'delete'",
              description: 'Node type identifier, always "delete"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Child nodes inside the strikethrough (usually text nodes)',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkTableNode',
          description: 'Table AST node interface, representing a Markdown table',
          fields: [
            {
              name: 'type',
              type: "'table'",
              description: 'Node type identifier, always "table"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkTableRowNode[]',
              description: 'Array of table row nodes',
              required: true,
            },
            {
              name: 'align',
              type: "Array<'left' | 'right' | 'center' | null>",
              description: 'Alignment configuration for each column',
              required: false,
            },
          ],
        },
        {
          name: 'SupramarkTableRowNode',
          description: 'Table row AST node interface',
          fields: [
            {
              name: 'type',
              type: "'table_row'",
              description: 'Node type identifier, always "table_row"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkTableCellNode[]',
              description: 'Array of table cell nodes',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkTableCellNode',
          description: 'Table cell AST node interface',
          fields: [
            {
              name: 'type',
              type: "'table_cell'",
              description: 'Node type identifier, always "table_cell"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Child nodes inside the cell',
              required: true,
            },
            {
              name: 'header',
              type: 'boolean',
              description: 'Whether this is a header cell',
              required: false,
            },
          ],
        },
        {
          name: 'SupramarkListItemNode (with task list)',
          description: 'Task list item AST node interface, extends the standard list item with a checked property',
          fields: [
            {
              name: 'type',
              type: "'list_item'",
              description: 'Node type identifier, always "list_item"',
              required: true,
            },
            {
              name: 'checked',
              type: 'boolean | null',
              description:
                'Task completion state: true (done), false (not done), null/undefined (a plain list item)',
              required: false,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Child nodes inside the list item',
              required: true,
            },
          ],
        },
      ],

      functions: [
        {
          name: 'createGFMFeatureConfig',
          description:
            'Creates the GFM Feature config object, used to enable GitHub Flavored Markdown extensions in SupramarkConfig',
          parameters: [
            {
              name: 'enabled',
              type: 'boolean',
              description: 'Whether to enable the GFM Feature',
              optional: false,
            },
            {
              name: 'options',
              type: 'GFMFeatureOptions',
              description: 'GFM Feature configuration options (currently an empty object)',
              optional: true,
            },
          ],
          returns: 'FeatureConfigWithOptions<GFMFeatureOptions>',
          examples: [
            `import { createGFMFeatureConfig } from '@supramark/feature-gfm';

const config = {
  features: [
    createGFMFeatureConfig(true),
  ],
};`,
          ],
        },
        {
          name: 'getGFMFeatureOptions',
          description: 'Extracts the GFM Feature configuration options from a SupramarkConfig',
          parameters: [
            {
              name: 'config',
              type: 'SupramarkConfig',
              description: 'The Supramark configuration object',
              optional: true,
            },
          ],
          returns: 'GFMFeatureOptions | undefined',
          examples: [
            `import { getGFMFeatureOptions } from '@supramark/feature-gfm';

const options = getGFMFeatureOptions(config);`,
          ],
        },
      ],

      types: [
        {
          name: 'GFMFeatureConfig',
          description:
            'GFM Feature config type, a type alias for FeatureConfigWithOptions<GFMFeatureOptions>',
          definition: 'type GFMFeatureConfig = FeatureConfigWithOptions<GFMFeatureOptions>',
        },
      ],
    },

    bestPractices: [
      'Wrap text to be struck through with ~~',
      'For task lists use - [ ] for incomplete and - [x] for completed',
      'Tables use | to separate columns, and --- to define the header separator row',
      'Table alignment uses :--- (left), :---: (center), ---: (right)',
    ],

    faq: [
      {
        question: 'What does the GFM Feature include?',
        answer:
          'The GFM Feature includes three core capabilities: strikethrough (~~text~~), task lists (- [ ] / - [x]), and tables.',
      },
      {
        question: 'How do I create a task list?',
        answer:
          'Use - [ ] to create an incomplete task, and - [x] to create a completed task. Note the space inside the brackets.',
      },
      {
        question: 'How do I set table alignment?',
        answer:
          'Use colons in the header separator row to set alignment: :--- left-aligns, :---: centers, ---: right-aligns.',
      },
    ],
  },
};

/**
 * Configuration options for the GFM Feature.
 */
export interface GFMFeatureOptions {
  // Currently empty, reserved for future extension
}

export type GFMFeatureConfig = FeatureConfigWithOptions<GFMFeatureOptions>;

const gfmHelpers = makeFeatureConfigHelpers<GFMFeatureOptions>('@supramark/feature-gfm');
export const createGFMFeatureConfig = gfmHelpers.create;
export const getGFMFeatureOptions = gfmHelpers.getOptions;

// Backward/usage compatibility: alias with lower-case 'fm' to match examples
export function createGfmFeatureConfig(
  enabled = true,
  options?: GFMFeatureOptions
): GFMFeatureConfig {
  return createGFMFeatureConfig(enabled, options);
}
