import type {
  SupramarkFeature,
  SupramarkNode,
  SupramarkRootNode,
  SupramarkTextNode,
  FeatureConfigWithOptions,
} from '@supramark/core';
import { emojiExamples } from './examples.js';
import { makeFeatureConfigHelpers } from '@supramark/core';

/**
 * Emoji Feature
 *
 * Canonical definition of Emoji / shortcode support (:smile: → 😄).
 *
 * - The supramark-markdown AST v2 parser converts shortcodes such as `:smile:` into Unicode emoji;
 * - supramark AST does not introduce a separate emoji node — it's embedded directly in `text.value`;
 * - Parsing and rendering logic is handled by @supramark/core / the RN / Web renderers.
 *
 * @example
 * ```markdown
 * GitHub-style shortcodes are supported:
 *
 * - :smile: :joy: :wink:
 * - :rocket: :tada: :warning:
 *
 * Native Emoji characters 😄🚀🎉 can also be typed directly.
 * ```
 */
export const emojiFeature: SupramarkFeature<SupramarkTextNode> = {
  metadata: {
    id: '@supramark/feature-emoji',
    name: 'Emoji',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'Emoji / shortcode support (:smile: → 😄)',
    license: 'Apache-2.0',
    tags: ['emoji', 'shortcode'],
    syntaxFamily: 'main',
  },
  // Emoji - no dependencies (a standalone character-substitution feature)
  // dependencies: [] - do not declare an empty dependency array explicitly

  syntax: {
    ast: {
      type: 'text',

      interface: {
        required: ['type', 'value'],
        optional: [],
        fields: {
          type: {
            type: 'string',
            description: 'Node type, always "text".',
          },
          value: {
            type: 'string',
            description:
              'Text content, where any Emoji have already been converted from shortcodes to Unicode characters by the AST v2 parser.',
          },
        },
      },

      constraints: {
        allowedParents: ['paragraph', 'heading', 'list_item', 'table_cell', 'admonition'],
        allowedChildren: [],
      },

      examples: [
        {
          type: 'text',
          value: 'This is a text containing an Emoji 😄🚀.',
        } as SupramarkTextNode,
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
        // On Web, uses Unicode characters + an optional Twemoji CDN
        needsClientScript: false,
        // No worker needed
        needsWorker: false,
        // No cache needed
        needsCache: false,
      },

      // External library dependencies (optional)
      dependencies: [
        {
          name: 'twemoji',
          version: '^14.0.2',
          type: 'cdn',
          cdnUrl: 'https://cdn.jsdelivr.net/npm/twemoji@14.0.2/dist/twemoji.min.js',
          optional: true, // optional dependency, defaults to system emoji
        },
      ],
    },

    // React Native platform renderer
    rn: {
      platform: 'rn',

      // Infrastructure requirements
      infrastructure: {
        // On RN, uses system emoji (Unicode characters)
        needsWorker: false,
        // No cache needed
        needsCache: false,
      },

      // No external dependencies (uses system emoji)
      dependencies: [],
    },
  },

  // Usage examples
  examples: emojiExamples,

  // Test definitions
  testing: {
    // Markdown → AST syntax tests
    syntaxTests: {
      cases: [
        {
          name: 'parses an emoji shortcode into Unicode',
          input: ':smile:',
          expected: {
            type: 'text',
            value: '😄',
          } as SupramarkTextNode,
          options: {
            typeOnly: false,
            ignoreFields: ['position', 'data'],
          },
        },
        {
          name: 'parses multiple emoji shortcodes',
          input: ':rocket: :tada: :heart:',
          expected: {
            type: 'text',
            value: '🚀 🎉 ❤️',
          } as SupramarkTextNode,
          options: {
            typeOnly: false,
            ignoreFields: ['position', 'data'],
          },
        },
        {
          name: 'parses an emoji within text',
          input: 'I like :coffee: and :tea:',
          expected: {
            type: 'text',
            value: 'I like ☕ and 🍵',
          } as SupramarkTextNode,
          options: {
            typeOnly: false,
            ignoreFields: ['position', 'data'],
          },
        },
      ],
    },

    // AST → render output tests
    renderTests: {
      web: [
        {
          name: 'Web renders emoji text',
          input: {
            type: 'text',
            value: '😄🚀🎉',
          } as SupramarkTextNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
      rn: [
        {
          name: 'RN renders emoji text',
          input: {
            type: 'text',
            value: '❤️✨🌟',
          } as SupramarkTextNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
    },

    // End-to-end integration tests
    integrationTests: {
      cases: [
        {
          name: 'Emoji end-to-end: shortcode conversion',
          input: 'Test :smile: and :rocket:',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            return nodes.some(
              (n: SupramarkNode) =>
                n.type === 'paragraph' &&
                n.children?.some(
                  (c: SupramarkNode) =>
                    c.type === 'text' && (c.value.includes('😄') || c.value.includes('🚀'))
                )
            );
          },
          platforms: ['web', 'rn'],
        },
        {
          name: 'Emoji end-to-end: native emoji',
          input: 'Using directly 😄🚀',
          validate: result => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as SupramarkRootNode).children || [];
            return nodes.some(
              (n: SupramarkNode) =>
                n.type === 'paragraph' &&
                n.children?.some((c: SupramarkNode) => c.type === 'text' && c.value.includes('😄'))
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
# Emoji Feature

Provides Emoji shortcode support for Supramark.

## Features

- GitHub-style shortcodes
- Native Emoji

## Usage

See the examples directory for more examples.
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'EmojiFeatureOptions',
          description: 'Configuration options interface for the Emoji Feature (currently empty, reserved for future extension)',
          fields: [],
        },
        {
          name: 'SupramarkTextNode (with emoji)',
          description: 'Text AST node interface; Emoji are converted to Unicode characters and embedded in the text node',
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
              description:
                'Text content, where any Emoji have already been converted from shortcodes (:smile:) to Unicode characters (😄) by the AST v2 parser',
              required: true,
            },
          ],
        },
      ],

      functions: [
        {
          name: 'createEmojiFeatureConfig',
          description:
            'Creates an Emoji Feature config object, used to enable Emoji shortcode support in SupramarkConfig',
          parameters: [
            {
              name: 'enabled',
              type: 'boolean',
              description: 'Whether to enable the Emoji Feature',
              optional: false,
            },
            {
              name: 'options',
              type: 'EmojiFeatureOptions',
              description: 'Emoji Feature configuration options (currently an empty object)',
              optional: true,
            },
          ],
          returns: 'FeatureConfigWithOptions<EmojiFeatureOptions>',
          examples: [
            `import { createEmojiFeatureConfig } from '@supramark/feature-emoji';

const config = {
  features: [
    createEmojiFeatureConfig(true),
  ],
};`,
          ],
        },
        {
          name: 'getEmojiFeatureOptions',
          description: 'Extracts the Emoji Feature configuration options from a SupramarkConfig',
          parameters: [
            {
              name: 'config',
              type: 'SupramarkConfig',
              description: 'The Supramark configuration object',
              optional: true,
            },
          ],
          returns: 'EmojiFeatureOptions | undefined',
          examples: [
            `import { getEmojiFeatureOptions } from '@supramark/feature-emoji';

const options = getEmojiFeatureOptions(config);`,
          ],
        },
      ],

      types: [
        {
          name: 'EmojiFeatureConfig',
          description:
            'Emoji Feature configuration type, a type alias for FeatureConfigWithOptions<EmojiFeatureOptions>',
          definition: 'type EmojiFeatureConfig = FeatureConfigWithOptions<EmojiFeatureOptions>',
        },
      ],
    },

    bestPractices: [
      'Use GitHub-style shortcode format, e.g. :smile: :rocket: :heart:',
      'Shortcodes are wrapped in colons, with an emoji name in between',
      'Native Unicode Emoji characters can also be typed directly',
      'Common emoji shortcodes: :+1: (👍), :-1: (👎), :tada: (🎉), :sparkles: (✨)',
    ],

    faq: [
      {
        question: 'Which shortcodes does the Emoji Feature support?',
        answer:
          'GitHub-style emoji shortcodes are supported; see the GitHub Emoji API for the full list.',
      },
      {
        question: 'How is Emoji represented in the AST?',
        answer:
          'The Emoji Feature does not create a separate AST node type — it converts shortcodes to Unicode characters and embeds them in the value of a text node.',
      },
      {
        question: 'Can Unicode Emoji be used directly?',
        answer: 'Yes. Besides using shortcodes, native Unicode Emoji characters can also be typed directly in Markdown.',
      },
    ],
  },
};

/**
 * Configuration options for the Emoji Feature.
 */
export interface EmojiFeatureOptions {
  // Currently empty, reserved for future extension
}

export type EmojiFeatureConfig = FeatureConfigWithOptions<EmojiFeatureOptions>;

const emojiHelpers = makeFeatureConfigHelpers<EmojiFeatureOptions>('@supramark/feature-emoji');
export const createEmojiFeatureConfig = emojiHelpers.create;
export const getEmojiFeatureOptions = emojiHelpers.getOptions;
