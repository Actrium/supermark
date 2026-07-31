import type {
  SupramarkFeature,
  SupramarkNode,
  SupramarkRootNode,
  FeatureConfigWithOptions,
} from '@supramark/core';
import { coreMarkdownExamples } from './examples.js';
import { makeFeatureConfigHelpers } from '@supramark/core';

/**
 * Core Markdown Feature
 *
 * The canonical Feature describing the base Markdown syntax (paragraph / heading / list etc.).
 *
 * - Describes the "non-extension" set of Markdown nodes;
 * - Covers paragraph / heading / list / blockquote / text / strong / emphasis / link etc.;
 * - Explicitly excludes extension nodes such as diagram / math / footnote / definition-list / admonition / table / delete.
 *
 * @example
 * ```markdown
 * # Heading
 *
 * Paragraph text **bold** and *italic*, plus `inline code` and [a link](https://example.com).
 *
 * - List item 1
 * - List item 2
 *
 * > Quoted paragraph
 * ```
 */
export const coreMarkdownFeature: SupramarkFeature<SupramarkNode> = {
  metadata: {
    id: '@supramark/feature-core-markdown',
    name: 'Core Markdown',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'Base Markdown syntax (paragraph / heading / list etc.)',
    license: 'Apache-2.0',
    tags: ['core', 'markdown', 'block', 'inline'],
    syntaxFamily: 'main',
  },
  // Base Markdown - no dependencies
  // dependencies: [] - do not declare an empty dependency array explicitly

  syntax: {
    ast: {
      /**
       * Virtual entry type: "core-markdown"
       *
       * Uses a selector to precisely match "base syntax nodes":
       * - Block: root / paragraph / heading / list / list_item / blockquote / thematic_break / code
       * - Inline: text / strong / emphasis / inline_code / link / image / break
       *
       * Explicitly excluded:
       * - diagram / math_* / footnote_* / definition_* / admonition / table_* / delete
       */
      type: 'core-markdown',
      selector: (node: SupramarkNode) => {
        const coreTypes: string[] = [
          'root',
          'paragraph',
          'heading',
          'code',
          'list',
          'list_item',
          'blockquote',
          'thematic_break',
          'text',
          'strong',
          'emphasis',
          'inline_code',
          'link',
          'image',
          'break',
        ];
        return coreTypes.includes(node.type as string);
      },

      /**
       * Note: Core Markdown is a virtual node that does not correspond to a single AST node type.
       * It matches multiple actual base-Markdown node types via the selector,
       * so it does not define a concrete interface.
       */
      // interface: undefined (a virtual node has no interface)

      constraints: {
        allowedParents: ['root'],
        allowedChildren: [],
      },

      examples: [
        {
          type: 'root',
          ast_version: 2,
          diagnostics: [],
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
        // The web side uses standard HTML elements (p / h1-h6 / ul / ol / blockquote etc.)
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
        // The RN side uses basic View + Text components
        needsWorker: false,
        // No cache needed
        needsCache: false,
      },

      // No external dependencies (uses View / Text components)
      dependencies: [],
    },
  },

  // Usage examples
  examples: coreMarkdownExamples,

  // Test definitions
  testing: {
    // Markdown -> AST syntax tests
    syntaxTests: {
      cases: [
        {
          name: 'parses a paragraph',
          input: 'This is a paragraph',
          expected: {
            type: 'paragraph',
            children: [{ type: 'text', value: 'This is a paragraph' }],
          } as SupramarkNode,
          options: {
            typeOnly: false,
            ignoreFields: ['position', 'data'],
          },
        },
        {
          name: 'parses a heading',
          input: '# Level-1 heading',
          expected: {
            type: 'heading',
            depth: 1,
            children: [{ type: 'text', value: 'Level-1 heading' }],
          } as SupramarkNode,
          options: {
            typeOnly: false,
            ignoreFields: ['position', 'data'],
          },
        },
        {
          name: 'parses a list',
          input: '- List item 1\n- List item 2',
          expected: {
            type: 'list',
            ordered: false,
          } as SupramarkNode,
          options: {
            typeOnly: false,
            ignoreFields: ['children', 'start', 'tight', 'position', 'data'],
          },
        },
        {
          name: 'parses a code block',
          input: '```javascript\nconst x = 1;\n```',
          expected: {
            type: 'code',
            lang: 'javascript',
            value: 'const x = 1;',
          } as SupramarkNode,
          options: {
            typeOnly: false,
            ignoreFields: ['meta', 'position', 'data'],
          },
        },
      ],
    },

    // AST -> render output tests
    renderTests: {
      web: [
        {
          name: 'Web renders a paragraph',
          input: {
            type: 'paragraph',
            children: [{ type: 'text', value: 'Paragraph text' }],
          } as SupramarkNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
        {
          name: 'Web renders a heading',
          input: {
            type: 'heading',
            depth: 2,
            children: [{ type: 'text', value: 'Level-2 heading' }],
          } as SupramarkNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
        {
          name: 'Web renders emphasis',
          input: {
            type: 'strong',
            children: [{ type: 'text', value: 'Bold' }],
          } as SupramarkNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
      rn: [
        {
          name: 'RN renders a list',
          input: {
            type: 'list',
            ordered: false,
            children: [{ type: 'list_item', children: [{ type: 'text', value: 'Item 1' }] }],
          } as SupramarkNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
        {
          name: 'RN renders a link',
          input: {
            type: 'link',
            url: 'https://example.com',
            children: [{ type: 'text', value: 'Link' }],
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
          name: 'CoreMarkdown end-to-end: heading + paragraph',
          input: '# Heading\n\nThis is a paragraph',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            const hasHeading = nodes.some((n: SupramarkNode) => n.type === 'heading');
            const hasParagraph = nodes.some((n: SupramarkNode) => n.type === 'paragraph');
            return hasHeading && hasParagraph;
          },
          platforms: ['web', 'rn'],
        },
        {
          name: 'CoreMarkdown end-to-end: list + code block',
          input: '- list\n\n```js\ncode\n```',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            const hasList = nodes.some((n: SupramarkNode) => n.type === 'list');
            const hasCode = nodes.some((n: SupramarkNode) => n.type === 'code');
            return hasList && hasCode;
          },
          platforms: ['web', 'rn'],
        },
        {
          name: 'CoreMarkdown end-to-end: inline formatting',
          input: '**bold** and *italic* and `code`',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            return nodes.some(
              (n: SupramarkNode) =>
                n.type === 'paragraph' &&
                Array.isArray(n.children) &&
                n.children.some((c: SupramarkNode) => c.type === 'strong') &&
                n.children.some((c: SupramarkNode) => c.type === 'emphasis') &&
                n.children.some((c: SupramarkNode) => c.type === 'inline_code')
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
# Core Markdown Feature

Provides core Markdown syntax support for Supramark.

## Features

- Headings
- Paragraphs
- Lists
- Code blocks
- Emphasis

## Usage

See the examples directory for more samples.
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'CoreMarkdownFeatureOptions',
          description:
            'Configuration options interface for the Core Markdown Feature (currently empty, reserved for future extension)',
          fields: [],
        },
        {
          name: 'SupramarkRootNode',
          description: 'Root node interface, representing the root of the whole Markdown document',
          fields: [
            {
              name: 'type',
              type: "'root'",
              description: 'Node type identifier, always "root"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'List of top-level nodes in the document',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkParagraphNode',
          description: 'Paragraph node interface, representing a paragraph block',
          fields: [
            {
              name: 'type',
              type: "'paragraph'",
              description: 'Node type identifier, always "paragraph"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Inline nodes within the paragraph (text, emphasis, links etc.)',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkHeadingNode',
          description: 'Heading node interface, representing a Markdown heading (# ... ######)',
          fields: [
            {
              name: 'type',
              type: "'heading'",
              description: 'Node type identifier, always "heading"',
              required: true,
            },
            {
              name: 'depth',
              type: '1 | 2 | 3 | 4 | 5 | 6',
              description: 'Heading level, 1 is a level-1 heading (#), 6 is a level-6 heading (######)',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Inline nodes of the heading text',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkCodeNode',
          description: 'Code block node interface, representing a fenced code block (```...```)',
          fields: [
            {
              name: 'type',
              type: "'code'",
              description: 'Node type identifier, always "code"',
              required: true,
            },
            {
              name: 'lang',
              type: 'string',
              description: 'Code language identifier (e.g. javascript, python etc.)',
              required: false,
            },
            {
              name: 'meta',
              type: 'string',
              description: 'Code block metadata (extra info following the language identifier)',
              required: false,
            },
            {
              name: 'value',
              type: 'string',
              description: 'Code content',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkListNode',
          description: 'List node interface, representing an ordered or unordered list',
          fields: [
            {
              name: 'type',
              type: "'list'",
              description: 'Node type identifier, always "list"',
              required: true,
            },
            {
              name: 'ordered',
              type: 'boolean',
              description: 'Whether the list is ordered (true) or unordered (false)',
              required: true,
            },
            {
              name: 'start',
              type: 'number | null',
              description: 'Starting number of an ordered list (only meaningful for ordered lists)',
              required: false,
            },
            {
              name: 'tight',
              type: 'boolean',
              description: 'Whether the list is tight (no blank lines between items)',
              required: false,
            },
            {
              name: 'children',
              type: 'SupramarkListItemNode[]',
              description: 'Array of list item nodes',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkListItemNode',
          description: 'List item node interface',
          fields: [
            {
              name: 'type',
              type: "'list_item'",
              description: 'Node type identifier, always "list_item"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Content nodes of the list item',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkBlockquoteNode',
          description: 'Blockquote node interface, representing a Markdown quote (> ...)',
          fields: [
            {
              name: 'type',
              type: "'blockquote'",
              description: 'Node type identifier, always "blockquote"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Content nodes within the blockquote',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkTextNode',
          description: 'Text node interface, representing plain text content',
          fields: [
            {
              name: 'type',
              type: "'text'",
              description: 'Node type identifier, always "text"',
              required: true,
            },
            {
              name: 'value',
              type: 'string',
              description: 'Text content',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkStrongNode',
          description: 'Strong node interface, representing bold emphasis (**...**)',
          fields: [
            {
              name: 'type',
              type: "'strong'",
              description: 'Node type identifier, always "strong"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Inline nodes within the bold text',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkEmphasisNode',
          description: 'Emphasis node interface, representing italic emphasis (*...*)',
          fields: [
            {
              name: 'type',
              type: "'emphasis'",
              description: 'Node type identifier, always "emphasis"',
              required: true,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Inline nodes within the italic text',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkInlineCodeNode',
          description: 'Inline code node interface, representing inline code (`...`)',
          fields: [
            {
              name: 'type',
              type: "'inline_code'",
              description: 'Node type identifier, always "inline_code"',
              required: true,
            },
            {
              name: 'value',
              type: 'string',
              description: 'Code content',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkLinkNode',
          description: 'Link node interface, representing a Markdown link',
          fields: [
            {
              name: 'type',
              type: "'link'",
              description: 'Node type identifier, always "link"',
              required: true,
            },
            {
              name: 'url',
              type: 'string',
              description: 'Link target URL',
              required: true,
            },
            {
              name: 'title',
              type: 'string',
              description: 'Link title (shown on hover)',
              required: false,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Inline nodes of the link text',
              required: true,
            },
          ],
        },
        {
          name: 'SupramarkImageNode',
          description: 'Image node interface, representing a Markdown image',
          fields: [
            {
              name: 'type',
              type: "'image'",
              description: 'Node type identifier, always "image"',
              required: true,
            },
            {
              name: 'url',
              type: 'string',
              description: 'Image URL',
              required: true,
            },
            {
              name: 'alt',
              type: 'string',
              description: 'Image alt text',
              required: false,
            },
            {
              name: 'title',
              type: 'string',
              description: 'Image title',
              required: false,
            },
          ],
        },
      ],

      functions: [
        {
          name: 'createCoreMarkdownFeatureConfig',
          description:
            'Creates the Core Markdown Feature config object, used to enable base Markdown syntax support in SupramarkConfig',
          parameters: [
            {
              name: 'enabled',
              type: 'boolean',
              description: 'Whether to enable the Core Markdown Feature',
              optional: false,
            },
            {
              name: 'options',
              type: 'CoreMarkdownFeatureOptions',
              description: 'Core Markdown Feature configuration options (currently an empty object)',
              optional: true,
            },
          ],
          returns: 'FeatureConfigWithOptions<CoreMarkdownFeatureOptions>',
          examples: [
            `import { createCoreMarkdownFeatureConfig } from '@supramark/feature-core-markdown';

const config = {
  features: [
    createCoreMarkdownFeatureConfig(true),
  ],
};`,
          ],
        },
        {
          name: 'getCoreMarkdownFeatureOptions',
          description: 'Extracts the Core Markdown Feature configuration options from a SupramarkConfig',
          parameters: [
            {
              name: 'config',
              type: 'SupramarkConfig',
              description: 'The Supramark configuration object',
              optional: true,
            },
          ],
          returns: 'CoreMarkdownFeatureOptions | undefined',
          examples: [
            `import { getCoreMarkdownFeatureOptions } from '@supramark/feature-core-markdown';

const options = getCoreMarkdownFeatureOptions(config);`,
          ],
        },
      ],

      types: [
        {
          name: 'CoreMarkdownFeatureConfig',
          description:
            'Core Markdown Feature config type, a type alias for FeatureConfigWithOptions<CoreMarkdownFeatureOptions>',
          definition:
            'type CoreMarkdownFeatureConfig = FeatureConfigWithOptions<CoreMarkdownFeatureOptions>',
        },
      ],
    },

    bestPractices: [
      'Use # for headings, the count of # indicates the heading level (# through ######)',
      'Separate paragraphs with a blank line',
      'Use - or * for unordered list items, and a number followed by a dot for ordered list items',
      'Wrap code blocks in three backticks and specify the language to enable syntax highlighting',
      'Inline formatting: **bold**, *italic*, `code`',
      'Link syntax: [text](URL "title")',
      'Image syntax: ![alt text](URL "title")',
    ],

    faq: [
      {
        question: 'What does the Core Markdown Feature include?',
        answer:
          'The Core Markdown Feature includes all base Markdown syntax, including headings, paragraphs, lists, code blocks, blockquotes, emphasis, links, images and other core elements.',
      },
      {
        question: 'How does Core Markdown differ from extension features?',
        answer:
          'Core Markdown provides standard Markdown syntax support, while extension features (such as GFM, Math, Footnote etc.) provide additional syntax capabilities.',
      },
      {
        question: 'Is the Core Markdown Feature mandatory?',
        answer:
          'Yes. The Core Markdown Feature provides the base Markdown parsing capability and is the foundation for all other extension features.',
      },
    ],
  },
};

/**
 * Configuration options for the Core Markdown Feature.
 */
export interface CoreMarkdownFeatureOptions {
  // Currently empty, reserved for future extension
}

export type CoreMarkdownFeatureConfig = FeatureConfigWithOptions<CoreMarkdownFeatureOptions>;

const coreMarkdownHelpers = makeFeatureConfigHelpers<CoreMarkdownFeatureOptions>(
  '@supramark/feature-core-markdown'
);
export const createCoreMarkdownFeatureConfig = coreMarkdownHelpers.create;
export const getCoreMarkdownFeatureOptions = coreMarkdownHelpers.getOptions;
