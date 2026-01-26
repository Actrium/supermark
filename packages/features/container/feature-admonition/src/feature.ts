import type {
  SupramarkFeature,
  SupramarkAdmonitionNode,
  FeatureConfigWithOptions,
  SupramarkConfig,
  SupramarkAdmonitionKind,
} from '@supramark/core';
import { admonitionExamples } from './examples.js';
import { getFeatureOptionsAs } from '@supramark/core';

/**
 * Admonition Feature
 *
 * 提示框 / 容器块语法支持（note/tip/warning 等）的规范定义。
 *
 * - 复用 core 中 `admonition` AST 节点；
 * - 解析由 markdown-it-container + core 管线负责；
 * - 渲染由 @supramark/rn / @supramark/web 渲染器负责。
 *
 * @example
 * ```markdown
 * ::: note 提示
 * 一些说明文字
 * :::
 *
 * ::: warning
 * 需要注意的事项
 * :::
 * ```
 */
export const admonitionFeature: SupramarkFeature<SupramarkAdmonitionNode> = {
  metadata: {
    id: '@supramark/feature-admonition',
    name: 'Admonition',
    version: '0.1.0',
    author: 'Supramark Team',
    description: '提示框 / 容器块语法支持（note/tip/warning 等）',
    license: 'Apache-2.0',
    tags: ['admonition', 'callout', 'container', 'alert'],
    syntaxFamily: 'container',
  },
  // Admonition - 依赖基础 Markdown（内容可以包含段落、列表等）
  dependencies: ['@supramark/feature-core-markdown'],

  syntax: {
    ast: {
      type: 'admonition',

      interface: {
        required: ['type', 'kind', 'children'],
        optional: ['title'],
        fields: {
          type: {
            type: 'string',
            description: '节点类型，固定为 "admonition"。',
          },
          kind: {
            type: 'string',
            description:
              '提示框类别：note / tip / info / warning / danger 等。',
          },
          title: {
            type: 'string',
            description: '可选标题，来自容器第一行参数。',
          },
          children: {
            type: 'nodes',
            description: '提示框内部的内容节点列表（段落、列表、代码块等）。',
          },
        },
      },

      constraints: {
        allowedParents: ['root'],
        allowedChildren: ['paragraph', 'list', 'code', 'blockquote', 'table'],
      },

      examples: [
        {
          type: 'admonition',
          kind: 'note',
          title: '提示',
          children: [],
        } as SupramarkAdmonitionNode,
      ],
    },

    // 可选：如果需要自定义解析器
    // parser: {
    //   engine: 'markdown-it',
    //   markdownIt: {
    //     plugin: yourPlugin,
    //     tokenMapper: (token, context) => { /* ... */ }
    //   }
    // },

    // 可选：验证规则
    // validator: {
    //   validate: (node) => {
    //     // TODO: 添加验证逻辑
    //     return { valid: true, errors: [] };
    //   }
    // },
  },

  // 渲染器定义
  renderers: {
    // Web 平台渲染器
    web: {
      platform: 'web',

      // 基础设施需求
      infrastructure: {
        // Web 端使用语义 HTML + CSS 渲染（div.admonition）
        needsClientScript: false,
        // 无需 Worker
        needsWorker: false,
        // 无需缓存
        needsCache: false,
      },

      // 无外部依赖（使用语义 HTML + CSS）
      dependencies: [],
    },

    // React Native 平台渲染器
    rn: {
      platform: 'rn',

      // 基础设施需求
      infrastructure: {
        // RN 端使用 View + 动态样式渲染
        needsWorker: false,
        // 无需缓存
        needsCache: false,
      },

      // 无外部依赖（使用 View 组件 + StyleSheet）
      dependencies: [],
    },
  },

  // 使用示例
  examples: admonitionExamples,

  // 测试定义
  testing: {
    // Markdown → AST 语法测试
    syntaxTests: {
      cases: [
        {
          name: '解析 note 类型提示框',
          input: '::: note 提示\n内容\n:::',
          expected: {
            type: 'admonition',
            kind: 'note',
            title: '提示',
          } as SupramarkAdmonitionNode,
          options: {
            typeOnly: false,
            ignoreFields: ['children', 'position', 'data'],
          },
        },
        {
          name: '解析 warning 类型提示框',
          input: '::: warning\n警告内容\n:::',
          expected: {
            type: 'admonition',
            kind: 'warning',
          } as SupramarkAdmonitionNode,
          options: {
            typeOnly: false,
            ignoreFields: ['children', 'title', 'position', 'data'],
          },
        },
        {
          name: '解析 tip 类型提示框',
          input: '::: tip 小贴士\n这是建议\n:::',
          expected: {
            type: 'admonition',
            kind: 'tip',
            title: '小贴士',
          } as SupramarkAdmonitionNode,
          options: {
            typeOnly: false,
            ignoreFields: ['children', 'position', 'data'],
          },
        },
      ],
    },

    // AST → 渲染输出测试
    renderTests: {
      web: [
        {
          name: 'Web 渲染 note 提示框',
          input: {
            type: 'admonition',
            kind: 'note',
            title: '提示',
            children: [{ type: 'paragraph', children: [{ type: 'text', value: '内容' }] }],
          } as SupramarkAdmonitionNode,
          expected: (output) => output !== null && output !== undefined,
          snapshot: true,
        },
        {
          name: 'Web 渲染 warning 提示框',
          input: {
            type: 'admonition',
            kind: 'warning',
            children: [{ type: 'paragraph', children: [{ type: 'text', value: '警告' }] }],
          } as SupramarkAdmonitionNode,
          expected: (output) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
      rn: [
        {
          name: 'RN 渲染 danger 提示框',
          input: {
            type: 'admonition',
            kind: 'danger',
            title: '危险',
            children: [{ type: 'paragraph', children: [{ type: 'text', value: '危险操作' }] }],
          } as SupramarkAdmonitionNode,
          expected: (output) => output !== null && output !== undefined,
          snapshot: true,
        },
      ],
    },

    // 端到端集成测试
    integrationTests: {
      cases: [
        {
          name: 'Admonition 端到端：多种类型',
          input: '::: note\n提示\n:::\n\n::: warning\n警告\n:::',
          validate: (result) => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as any).children || [];
            const hasNote = nodes.some((n: any) => n.type === 'admonition' && n.kind === 'note');
            const hasWarning = nodes.some((n: any) => n.type === 'admonition' && n.kind === 'warning');
            return hasNote && hasWarning;
          },
          platforms: ['web', 'rn'],
        },
        {
          name: 'Admonition 端到端：带标题',
          input: '::: tip 重要提示\n内容文本\n:::',
          validate: (result) => {
            if (!result || typeof result !== 'object') return false;
            const nodes = (result as any).children || [];
            return nodes.some((n: any) =>
              n.type === 'admonition' &&
              n.kind === 'tip' &&
              n.title === '重要提示'
            );
          },
          platforms: ['web', 'rn'],
        },
      ],
    },

    // 覆盖率要求
    coverageRequirements: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
  },

  // 文档定义
  documentation: {
    readme: `
# Admonition Feature

为 Supramark 提供提示框容器块支持。

## 功能

- note 提示框
- warning 警告框
- 自定义提示框

## 使用

查看 examples 目录获取更多示例。
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'AdmonitionFeatureOptions',
          description: 'Admonition Feature 的配置选项接口',
          fields: [
            {
              name: 'kinds',
              type: 'SupramarkAdmonitionKind[]',
              description: '允许的提示框类别列表，默认包含 note、tip、info、warning、danger',
              required: false,
            },
          ],
        },
        {
          name: 'SupramarkAdmonitionNode',
          description: '提示框 AST 节点接口，用于表示容器块（::: note ... :::）',
          fields: [
            {
              name: 'type',
              type: "'admonition'",
              description: '节点类型标识，固定为 "admonition"',
              required: true,
            },
            {
              name: 'kind',
              type: 'SupramarkAdmonitionKind | string',
              description: '提示框类别，可以是预定义的类型（note/tip/info/warning/danger）或自定义字符串',
              required: true,
            },
            {
              name: 'title',
              type: 'string',
              description: '提示框标题，来自容器第一行参数（可选）',
              required: false,
            },
            {
              name: 'children',
              type: 'SupramarkNode[]',
              description: '提示框内部的内容节点列表（段落、列表、代码块等）',
              required: true,
            },
          ],
        },
      ],

      functions: [
        {
          name: 'createAdmonitionFeatureConfig',
          description: '创建 Admonition Feature 配置对象，用于在 SupramarkConfig 中启用提示框支持',
          parameters: [
            {
              name: 'enabled',
              type: 'boolean',
              description: '是否启用 Admonition Feature',
              optional: false,
            },
            {
              name: 'options',
              type: 'AdmonitionFeatureOptions',
              description: 'Admonition Feature 配置选项，可指定允许的提示框类别',
              optional: true,
            },
          ],
          returns: 'FeatureConfigWithOptions<AdmonitionFeatureOptions>',
          examples: [
            `import { createAdmonitionFeatureConfig } from '@supramark/feature-admonition';

const config = {
  features: [
    createAdmonitionFeatureConfig(true),
  ],
};`,
            `// 限制只使用特定类型的提示框
import { createAdmonitionFeatureConfig } from '@supramark/feature-admonition';

const config = {
  features: [
    createAdmonitionFeatureConfig(true, {
      kinds: ['note', 'warning', 'danger'],
    }),
  ],
};`,
          ],
        },
        {
          name: 'getAdmonitionFeatureOptions',
          description: '从 SupramarkConfig 中提取 Admonition Feature 的配置选项',
          parameters: [
            {
              name: 'config',
              type: 'SupramarkConfig',
              description: 'Supramark 配置对象',
              optional: true,
            },
          ],
          returns: 'AdmonitionFeatureOptions | undefined',
          examples: [
            `import { getAdmonitionFeatureOptions } from '@supramark/feature-admonition';

const options = getAdmonitionFeatureOptions(config);
if (options?.kinds) {
  console.log('允许的提示框类型:', options.kinds);
}`,
          ],
        },
      ],

      types: [
        {
          name: 'AdmonitionFeatureConfig',
          description: 'Admonition Feature 配置类型，是 FeatureConfigWithOptions<AdmonitionFeatureOptions> 的类型别名',
          definition: 'type AdmonitionFeatureConfig = FeatureConfigWithOptions<AdmonitionFeatureOptions>',
        },
        {
          name: 'SupramarkAdmonitionKind',
          description: '预定义的提示框类别类型',
          definition: "type SupramarkAdmonitionKind = 'note' | 'tip' | 'info' | 'warning' | 'danger'",
        },
      ],
    },

    bestPractices: [
      '使用 ::: 包裹提示框内容，格式为 ::: kind title',
      '为提示框添加有意义的标题，提高可读性',
      '根据内容重要性选择合适的提示框类型（note/tip/info/warning/danger）',
      '确保提示框的开始标记（:::）和结束标记（:::）成对出现',
    ],

    faq: [
      {
        question: 'Admonition Feature 支持哪些提示框类型？',
        answer: '默认支持 note（提示）、tip（技巧）、info（信息）、warning（警告）、danger（危险）五种类型，也可以使用自定义类型。',
      },
      {
        question: '如何自定义提示框类型？',
        answer: '可以在 ::: 后使用任意字符串作为自定义类型，例如 ::: custom 我的提示框。不过建议优先使用预定义的类型以保持一致性。',
      },
      {
        question: '提示框内可以包含哪些内容？',
        answer: '提示框内可以包含段落、列表、代码块、引用块等各种 Markdown 元素，提供丰富的内容展示能力。',
      },
    ],
  },
};

/**
 * Admonition Feature 的配置项。
 *
 * - kinds: 允许的提示框类别列表（来自 SUPRAMARK_ADMONITION_KINDS），
 *   当前解析/渲染层会据此裁剪可用的容器类型。
 */
export interface AdmonitionFeatureOptions {
  kinds?: SupramarkAdmonitionKind[];
}

export type AdmonitionFeatureConfig =
  FeatureConfigWithOptions<AdmonitionFeatureOptions>;

export function createAdmonitionFeatureConfig(
  enabled = true,
  options?: AdmonitionFeatureOptions
): AdmonitionFeatureConfig {
  return {
    id: '@supramark/feature-admonition',
    enabled,
    options,
  };
}

export function getAdmonitionFeatureOptions(
  config?: SupramarkConfig
): AdmonitionFeatureOptions | undefined {
  return getFeatureOptionsAs<AdmonitionFeatureOptions>(
    config,
    '@supramark/feature-admonition'
  );
}
