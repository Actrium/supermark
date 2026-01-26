# Supramark Feature Interface 使用示例

## 接口体系结构

```
SupramarkFeature (顶层接口)
├── metadata: FeatureMetadata (元信息)
├── syntax: SyntaxDefinition (语法定义)
│   ├── ast: ASTNodeDefinition (AST节点定义)
│   │   ├── interface: NodeInterface (节点接口)
│   │   │   ├── required: Field[] (必需字段)
│   │   │   ├── optional: Field[] (可选字段)
│   │   │   └── fields: FieldDefinition[] (字段定义)
│   │   └── constraints: NodeConstraints (节点约束)
│   ├── parser: ParserRules (解析规则)
│   │   ├── engine: 'markdown-it' | 'remark' | 'custom'
│   │   ├── markdownIt: MarkdownItRules
│   │   │   ├── plugin: MarkdownItPlugin
│   │   │   ├── options: Options
│   │   │   └── tokenMapper: TokenMapper
│   │   └── remark: RemarkRules
│   └── validator: ValidatorRules (验证规则)
│       ├── validate: ValidateFunction
│       └── strict: boolean
├── renderers: RendererDefinitions (渲染器定义)
│   ├── rn: PlatformRenderer<'rn'> (RN渲染器)
│   │   ├── platform: 'rn'
│   │   ├── render: RenderFunction
│   │   ├── styles: StyleDefinition
│   │   │   ├── default: ReactNativeStyles
│   │   │   ├── themes: ThemeStyles
│   │   │   └── variables: StyleVariables
│   │   ├── infrastructure: InfrastructureRequirements
│   │   │   ├── needsWorker: boolean
│   │   │   ├── needsCache: boolean
│   │   │   └── cacheConfig: CacheConfig
│   │   └── dependencies: PlatformDependency[]
│   ├── web: PlatformRenderer<'web'> (Web渲染器)
│   └── cli: PlatformRenderer<'cli'> (CLI渲染器)
├── testing: TestingDefinition (测试定义)
│   ├── syntaxTests: SyntaxTestSuite
│   │   └── cases: SyntaxTestCase[]
│   ├── renderTests: RenderTestSuite
│   │   ├── rn: RenderTestCase[]
│   │   ├── web: RenderTestCase[]
│   │   └── cli: RenderTestCase[]
│   ├── integrationTests: IntegrationTestSuite
│   └── coverageRequirements: CoverageRequirements
├── documentation: DocumentationDefinition (文档定义)
│   ├── readme: string
│   ├── api: APIDocumentation
│   ├── examples: ExampleDefinition[]
│   ├── bestPractices: string[]
│   └── faq: FAQItem[]
├── dependencies: string[] (依赖的其他功能)
└── hooks: FeatureHooks (生命周期钩子)
    ├── beforeRegister: Hook
    ├── afterRegister: Hook
    ├── beforeParse: Hook
    ├── afterParse: Hook
    ├── beforeRender: Hook
    ├── afterRender: Hook
    └── onUnregister: Hook
```

## 完整示例：Admonition 功能定义

```typescript
import { SupramarkFeature, SupramarkAdmonitionNode } from '@supramark/core';
import container from 'markdown-it-container';

/**
 * Admonition 功能定义
 */
export const admonitionFeature: SupramarkFeature<SupramarkAdmonitionNode> = {
  // ========================================================================
  // 第一层：元信息
  // ========================================================================
  metadata: {
    id: '@supramark/feature-admonition',
    name: 'Admonition',
    version: '1.0.0',
    author: 'Supramark Team',
    description: 'GitHub-style admonition blocks (note, tip, warning, etc.)',
    license: 'Apache-2.0',
    homepage: 'https://supramark.dev/features/admonition',
    repository: 'https://github.com/supramark/supramark',
    tags: ['container', 'callout', 'alert', 'ui'],
  },

  // ========================================================================
  // 第一层：语法定义
  // ========================================================================
  syntax: {
    // ----------------------------------------------------------------------
    // 第二层：AST 节点定义
    // ----------------------------------------------------------------------
    ast: {
      type: 'admonition',

      // 第三层：节点接口
      interface: {
        required: ['type', 'kind', 'children'],
        optional: ['title'],
        fields: {
          type: {
            type: 'string',
            description: 'Node type identifier, always "admonition"',
          },
          kind: {
            type: 'string',
            description: 'Admonition variant: note, tip, info, warning, danger',
            validate: (value) => ['note', 'tip', 'info', 'warning', 'danger'].includes(value as string),
          },
          title: {
            type: 'string',
            description: 'Optional custom title',
            default: undefined,
          },
          children: {
            type: 'nodes',
            description: 'Child nodes (paragraphs, lists, code blocks, etc.)',
          },
        },
      },

      // 第三层：节点约束
      constraints: {
        allowedParents: ['root'],
        allowedChildren: ['paragraph', 'list', 'code', 'blockquote'],
        allowSelfNesting: false,
        requireChildren: false,
      },

      examples: [
        {
          type: 'admonition',
          kind: 'note',
          title: 'Important',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: 'This is a note.' }],
            },
          ],
        },
      ],
    },

    // ----------------------------------------------------------------------
    // 第二层：解析规则
    // ----------------------------------------------------------------------
    parser: {
      engine: 'markdown-it',

      // 第三层：markdown-it 规则
      markdownIt: {
        plugin: container,
        options: {
          validate: (params: string) => params.trim().match(/^(note|tip|info|warning|danger)\s*(.*)$/),
        },

        // 第三层：Token 映射器
        tokenMapper: (token, context) => {
          if (!token.type.startsWith('container_')) return null;

          const match = /^container_(.+)_open$/.exec(token.type);
          if (!match) return null;

          const kind = match[1];
          if (!['note', 'tip', 'info', 'warning', 'danger'].includes(kind)) {
            return null;
          }

          const info = (token.info || '').trim();
          const parts = info.split(/\s+/);
          const title = parts.length > 1 ? parts.slice(1).join(' ') : undefined;

          return {
            type: 'admonition',
            kind,
            title,
            children: [],
          } as SupramarkAdmonitionNode;
        },
      },
    },

    // ----------------------------------------------------------------------
    // 第二层：验证规则
    // ----------------------------------------------------------------------
    validator: {
      validate: (node) => {
        const errors: ValidationError[] = [];

        // 验证 kind
        if (!['note', 'tip', 'info', 'warning', 'danger'].includes(node.kind)) {
          errors.push({
            code: 'INVALID_KIND',
            message: `Invalid admonition kind: ${node.kind}`,
            path: `admonition.kind`,
            data: { kind: node.kind },
          });
        }

        // 验证 children
        if (!node.children || node.children.length === 0) {
          errors.push({
            code: 'EMPTY_CONTENT',
            message: 'Admonition must have content',
            path: `admonition.children`,
          });
        }

        return {
          valid: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined,
        };
      },
      strict: false,
    },
  },

  // ========================================================================
  // 第一层：渲染器定义
  // ========================================================================
  renderers: {
    // ----------------------------------------------------------------------
    // 第二层：React Native 渲染器
    // ----------------------------------------------------------------------
    rn: {
      platform: 'rn',

      // 第三层：渲染函数
      render: (node, context) => {
        const { key, styles } = context;
        const title = node.title;

        return (
          <View key={key} style={styles.admonition[node.kind]}>
            {title ? (
              <Text style={styles.admonitionTitle}>{title}</Text>
            ) : null}
            <View style={styles.admonitionContent}>
              {context.renderChildren(node.children)}
            </View>
          </View>
        );
      },

      // 第三层：样式定义
      styles: {
        default: {
          admonition: {
            note: {
              backgroundColor: '#E3F2FD',
              borderLeftWidth: 4,
              borderLeftColor: '#2196F3',
              padding: 12,
              marginVertical: 8,
              borderRadius: 4,
            },
            tip: {
              backgroundColor: '#E8F5E9',
              borderLeftWidth: 4,
              borderLeftColor: '#4CAF50',
              padding: 12,
              marginVertical: 8,
              borderRadius: 4,
            },
            warning: {
              backgroundColor: '#FFF3E0',
              borderLeftWidth: 4,
              borderLeftColor: '#FF9800',
              padding: 12,
              marginVertical: 8,
              borderRadius: 4,
            },
            danger: {
              backgroundColor: '#FFEBEE',
              borderLeftWidth: 4,
              borderLeftColor: '#F44336',
              padding: 12,
              marginVertical: 8,
              borderRadius: 4,
            },
          },
          admonitionTitle: {
            fontWeight: '600',
            fontSize: 16,
            marginBottom: 8,
          },
          admonitionContent: {
            fontSize: 14,
          },
        },

        themes: {
          dark: {
            admonition: {
              note: { backgroundColor: '#1A237E', borderLeftColor: '#64B5F6' },
              tip: { backgroundColor: '#1B5E20', borderLeftColor: '#81C784' },
              warning: { backgroundColor: '#E65100', borderLeftColor: '#FFB74D' },
              danger: { backgroundColor: '#B71C1C', borderLeftColor: '#E57373' },
            },
          },
        },

        variables: {
          colors: {
            noteBackground: '#E3F2FD',
            noteBorder: '#2196F3',
            tipBackground: '#E8F5E9',
            tipBorder: '#4CAF50',
          },
          sizes: {
            padding: 12,
            borderWidth: 4,
            borderRadius: 4,
          },
        },
      },

      // 第三层：基础设施需求
      infrastructure: {
        needsWorker: false,
        needsCache: false,
      },

      dependencies: [],
    },

    // ----------------------------------------------------------------------
    // 第二层：Web 渲染器
    // ----------------------------------------------------------------------
    web: {
      platform: 'web',

      // 第三层：渲染函数
      render: (node, context) => {
        const { key, styles } = context;
        const title = node.title;

        return (
          <div
            key={key}
            className={`${styles.admonition} ${styles[`admonition-${node.kind}`]}`}
          >
            {title ? (
              <p className={styles.admonitionTitle}>
                <strong>{title}</strong>
              </p>
            ) : null}
            <div className={styles.admonitionContent}>
              {context.renderChildren(node.children)}
            </div>
          </div>
        );
      },

      // 第三层：样式定义（CSS 类名）
      styles: {
        default: {
          admonition: 'supramark-admonition',
          'admonition-note': 'supramark-admonition--note',
          'admonition-tip': 'supramark-admonition--tip',
          'admonition-warning': 'supramark-admonition--warning',
          'admonition-danger': 'supramark-admonition--danger',
          admonitionTitle: 'supramark-admonition__title',
          admonitionContent: 'supramark-admonition__content',
        },
      },

      infrastructure: {
        needsWorker: false,
        needsCache: false,
        needsClientScript: false,
      },

      dependencies: [],
    },

    // ----------------------------------------------------------------------
    // 第二层：CLI 渲染器
    // ----------------------------------------------------------------------
    cli: {
      platform: 'cli',

      render: (node, context) => {
        const ICONS = {
          note: 'ℹ',
          tip: '💡',
          info: 'ℹ',
          warning: '⚠',
          danger: '⛔',
        };

        const icon = ICONS[node.kind as keyof typeof ICONS] || 'ℹ';
        const title = node.title || node.kind.toUpperCase();

        const content = context.renderChildren(node.children).join('\n');

        return `
┌─ ${icon} ${title}
│
${content.split('\n').map(line => `│ ${line}`).join('\n')}
│
└─────────────────
`;
      },

      infrastructure: {
        needsWorker: false,
        needsCache: false,
      },

      dependencies: [],
    },
  },

  // ========================================================================
  // 第一层：测试定义
  // ========================================================================
  testing: {
    // ----------------------------------------------------------------------
    // 第二层：语法测试
    // ----------------------------------------------------------------------
    syntaxTests: {
      cases: [
        {
          name: 'Parse basic note admonition',
          input: `
::: note
This is a note.
:::
`,
          expected: {
            type: 'admonition',
            kind: 'note',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'This is a note.' }],
              },
            ],
          },
        },
        {
          name: 'Parse admonition with custom title',
          input: `
::: warning Custom Warning Title
Be careful!
:::
`,
          expected: {
            type: 'admonition',
            kind: 'warning',
            title: 'Custom Warning Title',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'Be careful!' }],
              },
            ],
          },
        },
      ],
    },

    // ----------------------------------------------------------------------
    // 第二层：渲染测试
    // ----------------------------------------------------------------------
    renderTests: {
      rn: [
        {
          name: 'Render note admonition in RN',
          input: {
            type: 'admonition',
            kind: 'note',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'Test note' }],
              },
            ],
          },
          snapshot: true,
        },
      ],
      web: [
        {
          name: 'Render warning admonition in Web',
          input: {
            type: 'admonition',
            kind: 'warning',
            title: 'Warning',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'Be careful' }],
              },
            ],
          },
          snapshot: true,
        },
      ],
    },

    // ----------------------------------------------------------------------
    // 第二层：集成测试
    // ----------------------------------------------------------------------
    integrationTests: {
      cases: [
        {
          name: 'End-to-end admonition rendering',
          input: `
::: tip Pro Tip
Use admonitions to highlight important information!
:::
`,
          validate: (result) => {
            return result.includes('Pro Tip') &&
                   result.includes('Use admonitions');
          },
          platforms: ['rn', 'web'],
        },
      ],
    },

    // ----------------------------------------------------------------------
    // 第二层：覆盖率要求
    // ----------------------------------------------------------------------
    coverageRequirements: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
  },

  // ========================================================================
  // 第一层：文档定义
  // ========================================================================
  documentation: {
    readme: `
# Admonition Feature

GitHub-style admonition blocks for highlighting important information.

## Supported Variants

- \`note\`: Informational notes (blue)
- \`tip\`: Helpful tips (green)
- \`info\`: General information (blue)
- \`warning\`: Warning messages (orange)
- \`danger\`: Critical warnings (red)

## Syntax

\`\`\`markdown
::: note
This is a note.
:::

::: tip Custom Title
This is a tip with a custom title.
:::
\`\`\`
`,

    api: {
      interfaces: [
        {
          name: 'SupramarkAdmonitionNode',
          description: 'AST node representing an admonition block',
          fields: [
            {
              name: 'type',
              type: '"admonition"',
              description: 'Node type identifier',
              required: true,
            },
            {
              name: 'kind',
              type: '"note" | "tip" | "info" | "warning" | "danger"',
              description: 'Admonition variant',
              required: true,
            },
            {
              name: 'title',
              type: 'string',
              description: 'Optional custom title',
              required: false,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: 'Child nodes',
              required: true,
            },
          ],
        },
      ],
    },

    examples: [
      {
        name: 'Basic Note',
        description: 'A simple informational note',
        markdown: `
::: note
This is important information.
:::
`,
      },
      {
        name: 'Warning with Title',
        description: 'A warning with a custom title',
        markdown: `
::: warning Deprecation Warning
This feature will be removed in v2.0.
:::
`,
      },
    ],

    bestPractices: [
      'Use admonitions sparingly to maintain their impact',
      'Choose the appropriate variant for your message type',
      'Keep admonition content concise and focused',
      'Always provide meaningful titles for complex admonitions',
    ],

    faq: [
      {
        question: 'Can I nest admonitions?',
        answer: 'No, admonitions cannot be nested within each other.',
      },
      {
        question: 'How do I customize the colors?',
        answer: 'Override the default styles in your theme configuration.',
        links: ['https://supramark.dev/docs/theming'],
      },
    ],
  },

  // ========================================================================
  // 第一层：依赖
  // ========================================================================
  dependencies: [],

  // ========================================================================
  // 第一层：生命周期钩子
  // ========================================================================
  hooks: {
    beforeRegister: () => {
      console.log('[Admonition] Registering feature...');
    },

    afterRegister: () => {
      console.log('[Admonition] Feature registered successfully');
    },

    beforeParse: (markdown) => {
      // 预处理：确保容器块前后有空行
      return markdown.replace(/(^|\n)(:::)/g, '$1\n$2');
    },

    afterParse: (nodes) => {
      // 后处理：验证所有 admonition 节点
      return nodes.map(node => {
        if (node.type === 'admonition') {
          const result = admonitionFeature.syntax.validator!.validate(node as SupramarkAdmonitionNode);
          if (!result.valid) {
            console.warn('[Admonition] Validation failed:', result.errors);
          }
        }
        return node;
      });
    },
  },
};
```

## 接口使用的核心价值

### 1. **完整性**
每个功能定义涵盖所有方面：元信息、语法、渲染、测试、文档

### 2. **类型安全**
TypeScript 类型系统确保接口实现的完整性和正确性

### 3. **可发现性**
通过接口定义，开发者可以清楚地知道需要实现哪些部分

### 4. **可扩展性**
新平台只需实现 `PlatformRenderer` 接口即可支持

### 5. **标准化**
统一的接口确保所有功能遵循相同的开发模式

### 6. **文档化**
接口本身就是最好的文档，每个字段都有明确的类型和描述

## 下一步

1. 将现有功能（Math、Diagram、Admonition）重构为符合此接口的实现
2. 创建 `@supramark/plugin-sdk` 提供辅助工具和验证器
3. 开发 CLI 工具用于生成功能模板
4. 建立功能市场和注册机制
