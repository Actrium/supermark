import type {
  SupramarkHtmlPageNode,
  SupramarkNode,
  FeatureConfigWithOptions,
  SupramarkConfig,
  SupramarkFeature,
} from '@supramark/core';
import { getFeatureOptionsAs } from '@supramark/core';
import { htmlPageExamples } from './examples.js';

/**
 * Html Page Feature
 *
 * - 将 :::html 容器解析为 `html_page` AST 节点；
 * - 在主 Markdown 流中以“卡片”方式呈现；
 * - 真正打开 HTML 页的行为由宿主通过回调 / 容器实现。
 *
 * @example
 * ```markdown
 * :::html
 * <!doctype html>
 * <html>
 *   <head><title>HTML Page</title></head>
 *   <body><h1>Hello HTML Page</h1></body>
 * </html>
 * :::
 * ```
 */
export const htmlPageFeature: SupramarkFeature<SupramarkHtmlPageNode> = {
  metadata: {
    id: '@supramark/feature-html-page',
    name: 'HTML Page',
    version: '0.1.0',
    author: 'Supramark Team',
    description:
      '使用 :::html 容器定义独立 HTML 页面节点，并在宿主中以卡片 + 独立容器方式打开。',
    license: 'Apache-2.0',
    tags: ['html', 'page', 'card'],
    syntaxFamily: 'container',
  },

  syntax: {
    ast: {
      type: 'html_page',
      selector: (node: SupramarkNode) => node.type === 'html_page',
      interface: {
        required: ['type', 'html'],
        optional: ['title', 'url', 'meta'],
        fields: {
          type: {
            type: 'string',
            description: '节点类型，固定为 "html_page"。',
          },
          html: {
            type: 'string',
            description: '独立 HTML 页面内容，可以是完整文档或片段。',
          },
          title: {
            type: 'string',
            description:
              '可选标题。优先从配置 / 元信息中获得，其次可以由宿主从 HTML 的 <title> 中提取。',
          },
          url: {
            type: 'string',
            description:
              '可选：当 HTML 页有外部访问地址时的 URL，宿主可以用来决定打开行为（如 window.open 或 WebView 加载）。',
          },
          meta: {
            type: 'object',
            description: '附加元信息，例如作者自定义的 data-* 字段。',
          },
        },
      },
      constraints: {
        allowedParents: ['root', 'paragraph', 'list_item'],
        allowedChildren: [],
      },
      examples: [
        {
          type: 'html_page',
          html: '<!doctype html><html><head><title>Example</title></head><body>Hello</body></html>',
          title: 'Example',
        } as SupramarkHtmlPageNode,
      ],
    },
  },

  renderers: {
    rn: {
      platform: 'rn',
      infrastructure: {
        needsWorker: false,
        needsCache: false,
      },
      // 具体渲染由 @supramark/rn 中的组件负责。
    },
    web: {
      platform: 'web',
      infrastructure: {
        needsClientScript: false,
        needsWorker: false,
        needsCache: false,
      },
      // 具体渲染由 @supramark/web 中的组件负责。
    },
  },

  // 使用示例
  examples: htmlPageExamples,

  // 测试定义（当前以占位形式存在）
  testing: {
    syntaxTests: {
      cases: [
        {
          name: '解析 :::html 容器为 html_page 节点（类型检查）',
          input: [
            ':::html',
            '<html><body>Example</body></html>',
            ':::',
          ].join('\n'),
          expected: {
            type: 'html_page',
          } as SupramarkHtmlPageNode,
          options: {
            typeOnly: true,
          },
        },
      ],
    },
    renderTests: {
      web: [
        {
          name: 'Web 渲染 html_page 节点（占位卡片存在）',
          input: {
            type: 'html_page',
            html: '<html><body>Example</body></html>',
          } as SupramarkHtmlPageNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
      rn: [
        {
          name: 'RN 渲染 html_page 节点（占位卡片存在）',
          input: {
            type: 'html_page',
            html: '<html><body>Example</body></html>',
          } as SupramarkHtmlPageNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
    },
    integrationTests: {
      cases: [
        {
          name: '端到端：markdown 中包含 :::html 容器',
          input: [
            '# HTML Page demo',
            '',
            ':::html',
            '<html><body>Example</body></html>',
            ':::',
          ].join('\n'),
          validate: (result: unknown) => {
            if (!result || typeof result !== 'object') return false;
            const root = result as any;
            const children = Array.isArray(root.children) ? root.children : [];
            return children.some((n: any) => n.type === 'html_page');
          },
          platforms: ['web', 'rn'],
        },
      ],
    },
    coverageRequirements: {
      statements: 30,
      branches: 20,
      functions: 20,
      lines: 30,
    },
  },

  documentation: {
    readme: `
# HTML Page Feature

使用 \`:::html\` 容器定义独立 HTML 页面节点，并在主 Markdown 流中以卡片形式呈现，由宿主在 Web / RN 中提供实际容器（ShadowDOM / WebView）来加载页面。

- 语法：\`:::html ... :::\`；
- AST：解析为 \`html_page\` 节点，携带完整 HTML 文本及可选元信息；
- 渲染：默认实现为占位卡片，点击后由宿主打开独立容器。
    `.trim(),
    api: {
      interfaces: [
        {
          name: 'HtmlPageFeatureOptions',
          description: 'HTML Page Feature 的配置选项，例如默认打开方式。',
          fields: [
            {
              name: 'webOpenMode',
              type: `'window' | 'callback-only' | undefined`,
              description:
                "Web 端默认打开方式：'window' 使用 window.open 打开新窗口，'callback-only' 仅通过回调交由宿主处理。",
              required: false,
            },
            {
              name: 'rnOpenMode',
              type: `'callback-only' | undefined`,
              description: "RN 端默认打开方式，目前仅支持 'callback-only'。",
              required: false,
            },
          ],
        },
      ],
      functions: [
        {
          name: 'createHtmlPageFeatureConfig',
          description: '创建 Html Page Feature 的配置对象，用于 SupramarkConfig.features。',
          parameters: [
            {
              name: 'enabled',
              type: 'boolean',
              description: '是否启用该 Feature',
              optional: true,
            },
            {
              name: 'options',
              type: 'HtmlPageFeatureOptions',
              description: '可选配置项',
              optional: true,
            },
          ],
          returns: 'HtmlPageFeatureConfig',
        },
        {
          name: 'getHtmlPageFeatureOptions',
          description: '从 SupramarkConfig 中读取 Html Page Feature 的 options。',
          parameters: [
            {
              name: 'config',
              type: 'SupramarkConfig | undefined',
              description: '全局 supramark 配置',
              optional: true,
            },
          ],
          returns: 'HtmlPageFeatureOptions | undefined',
        },
      ],
      types: [],
    },
    bestPractices: [
      '将 HTML 页面中的复杂脚本与样式隔离在独立容器中，避免污染主应用环境。',
      '通过 Feature 配置或宿主回调控制打开行为，以适配不同平台需求。',
    ],
    faq: [
      {
        question: '为什么不直接在 Markdown 中内联渲染 HTML？',
        answer:
          '独立 HTML 页面往往包含脚本与样式隔离需求，通过 html_page 节点 + 独立容器可以更好地控制安全性与生命周期。',
      },
    ],
  },
};

export interface HtmlPageFeatureOptions {
  /**
   * Web 端默认打开方式：
   * - 'window': 使用 window.open + about:blank 方式打开一个新窗口并注入 HTML
   * - 'callback-only': 仅触发回调，由宿主自行处理
   *
   * 默认值为 'window'。
   */
  webOpenMode?: 'window' | 'callback-only';

  /**
   * RN 端默认打开方式：
   * - 'callback-only': 仅触发 onOpenHtmlPage 回调，由宿主决定如何打开（推荐）
   * - 未来可以扩展为 'internal-webview' 等
   *
   * 默认值为 'callback-only'。
   */
  rnOpenMode?: 'callback-only';
}

export type HtmlPageFeatureConfig =
  FeatureConfigWithOptions<HtmlPageFeatureOptions>;

export function createHtmlPageFeatureConfig(
  enabled = true,
  options?: HtmlPageFeatureOptions
): HtmlPageFeatureConfig {
  return {
    id: '@supramark/feature-html-page',
    enabled,
    options,
  };
}

export function getHtmlPageFeatureOptions(
  config?: SupramarkConfig
): HtmlPageFeatureOptions | undefined {
  return getFeatureOptionsAs<HtmlPageFeatureOptions>(
    config,
    '@supramark/feature-html-page'
  );
}
