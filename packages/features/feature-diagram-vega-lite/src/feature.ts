import type {
  SupramarkNode,
  SupramarkDiagramNode,
  FeatureConfigWithOptions,
  SupramarkConfig,
  SupramarkFeature,
} from '@supramark/core';
import { FeatureRegistry, getFeatureOptionsAs } from '@supramark/core';
import { diagramVegaLiteExamples } from './examples.js';

/**
 * Vega-Lite 图表 Feature（规范层）
 *
 * - 复用现有的 `diagram` AST 节点；
 * - 只关心 engine 为 'vega-lite' / 'vega' / 'chart' / 'chartjs' 的子集；
 * - 解析与渲染逻辑暂由现有 pipeline（parseMarkdown + web-diagram + rn-diagram-worker）负责；
 * - Feature 主要用于：描述约束、生成文档、做能力发现。
 *
 * @example
 * ```markdown
 * ```vega-lite
 * {
 *   "mark": "bar",
 *   "encoding": { "x": { "field": "category" }, "y": { "field": "value" } },
 *   "data": { "values": [{ "category": "A", "value": 1 }] }
 * }
 * ```
 * ```
 */

const isVegaLiteDiagram = (node: SupramarkNode): node is SupramarkDiagramNode => {
  return (
    node.type === 'diagram' &&
    typeof (node as SupramarkDiagramNode).engine === 'string' &&
    ['vega-lite', 'vega', 'chart', 'chartjs'].includes(
      (node as SupramarkDiagramNode).engine.toLowerCase()
    )
  );
};

export const diagramVegaLiteFeature: SupramarkFeature<SupramarkDiagramNode> = {
  metadata: {
    id: '@supramark/feature-diagram-vega-lite',
    name: 'Diagram (Vega-Lite)',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'Support for Vega-Lite based diagrams rendered via the unified diagram pipeline.',
    license: 'Apache-2.0',
    tags: ['diagram', 'vega-lite', 'chart'],
    syntaxFamily: 'fence',
  },

  syntax: {
    ast: {
      type: 'diagram',
      selector: isVegaLiteDiagram,
      interface: {
        required: ['type', 'engine', 'code'],
        optional: ['meta'],
        fields: {
          type: {
            type: 'string',
            description: 'Node type identifier, always "diagram".',
          },
          engine: {
            type: 'string',
            description:
              'Diagram engine identifier. For this feature, expected to be "vega-lite" / "vega" / "chart" / "chartjs".',
          },
          code: {
            type: 'string',
            description: 'Raw Vega-Lite JSON spec encoded in the fenced code block.',
          },
          meta: {
            type: 'object',
            description:
              'Optional metadata, e.g. renderer / theme / width / height, passed through to runtime.',
          },
        },
      },
      examples: [
        {
          type: 'diagram',
          engine: 'vega-lite',
          code: '{ "mark": "bar", "encoding": { "x": { "field": "category" }, "y": { "field": "value" } }, "data": { "values": [{ "category": "A", "value": 1 }] } }',
        } as SupramarkDiagramNode,
      ],
    },
  },

  renderers: {
    rn: {
      platform: 'rn',
      infrastructure: {
        needsWorker: true,
        needsCache: true,
        workerType: 'webview',
      },
      dependencies: [
        {
          name: 'react-native-svg',
          version: '^13.0.0',
          type: 'npm',
        },
      ],
    },
    web: {
      platform: 'web',
      infrastructure: {
        needsClientScript: true,
        clientScriptBuilder: () => '<!-- Vega-Lite scripts provided by @supramark/web-diagram -->',
      },
      dependencies: [
        {
          name: 'vega',
          version: '^5.0.0',
          type: 'cdn',
          cdnUrl: 'https://cdn.jsdelivr.net/npm/vega@5',
        },
        {
          name: 'vega-lite',
          version: '^5.0.0',
          type: 'cdn',
          cdnUrl: 'https://cdn.jsdelivr.net/npm/vega-lite@5',
        },
        {
          name: 'vega-embed',
          version: '^6.0.0',
          type: 'cdn',
          cdnUrl: 'https://cdn.jsdelivr.net/npm/vega-embed@6',
        },
      ],
    },
  },

  // 使用示例
  examples: diagramVegaLiteExamples,

  // 测试定义：主要用于文档与质量校验，这里提供最小可用的语法 / 渲染 / 集成测试描述
  testing: {
    syntaxTests: {
      cases: [
        {
          name: '解析 vega-lite 围栏代码块为 diagram 节点',
          input: ['```vega-lite', '{ "mark": "bar", "data": { "values": [] } }', '```'].join('\n'),
          expected: {
            type: 'diagram',
            engine: 'vega-lite',
          } as unknown as SupramarkDiagramNode,
          options: {
            typeOnly: true,
          },
        },
      ],
    },
    renderTests: {
      web: [
        {
          name: 'Web 渲染 Vega-Lite diagram（占位验证输出存在）',
          input: {
            type: 'diagram',
            engine: 'vega-lite',
            code: '{ "mark": "bar" }',
          } as SupramarkDiagramNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
      rn: [
        {
          name: 'RN 渲染 Vega-Lite diagram（占位验证输出存在）',
          input: {
            type: 'diagram',
            engine: 'vega-lite',
            code: '{ "mark": "bar" }',
          } as SupramarkDiagramNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
    },
    integrationTests: {
      cases: [
        {
          name: '端到端：markdown 中包含 ```vega-lite 围栏',
          input: ['# Diagram test', '', '```vega-lite', '{ "mark": "bar" }', '```'].join('\n'),
          validate: (result: unknown) => {
            if (!result || typeof result !== 'object') return false;
            const root = result as any;
            const children = Array.isArray(root.children) ? root.children : [];
            return children.some((n: any) => n.type === 'diagram' && typeof n.engine === 'string');
          },
          platforms: ['web', 'rn'],
        },
      ],
    },
    coverageRequirements: {
      statements: 50,
      branches: 40,
      functions: 40,
      lines: 50,
    },
  },

  documentation: {
    readme: `
# Diagram (Vega-Lite) Feature

为 supramark 提供基于 Vega / Vega-Lite / ChartJS 的图表示例支持。

- 语法：使用 \`\\\`\\\`vega-lite\`、\`\\\`\\\`vega\`、\`\\\`\\\`chart\` 或 \`\\\`\\\`chartjs\` 围栏代码块；
- AST：解析为 \`diagram\` 节点，engine 字段为对应引擎名，code 为 JSON spec；
- 渲染：通过统一图表子系统（RN 端 headless WebView，Web 端 @supramark/web-diagram）生成 SVG。
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'DiagramVegaLiteFeatureOptions',
          description: 'Diagram (Vega-Lite) Feature 的配置选项（当前为空，预留扩展）。',
          fields: [],
        },
      ],
      functions: [
        {
          name: 'createDiagramVegaLiteFeatureConfig',
          description:
            '创建带有强类型 options 的 FeatureConfig，方便在 SupramarkConfig.features 中使用。',
          parameters: [
            {
              name: 'enabled',
              type: 'boolean',
              description: '是否启用该 Feature',
              optional: false,
            },
            {
              name: 'options',
              type: 'DiagramVegaLiteFeatureOptions',
              description: '可选配置项',
              optional: true,
            },
          ],
          returns: 'DiagramVegaLiteFeatureConfig',
        },
        {
          name: 'getDiagramVegaLiteFeatureOptions',
          description: '从 SupramarkConfig 中读取 Diagram (Vega-Lite) 的 options 配置。',
          parameters: [
            {
              name: 'config',
              type: 'SupramarkConfig | undefined',
              description: '全局 supramark 配置',
              optional: true,
            },
          ],
          returns: 'DiagramVegaLiteFeatureOptions | undefined',
        },
      ],
      types: [],
    },

    bestPractices: [
      '将 Vega-Lite spec 保持为有效 JSON，便于调试与重用。',
      '尽量在 meta 中声明渲染相关的非数据选项（如宽高、主题），与纯数据部分解耦。',
    ],

    faq: [
      {
        question: 'Vega-Lite 图表何时会被实际渲染为 SVG？',
        answer:
          '在 RN 端由 @supramark/rn-diagram-worker 的 headless WebView 渲染，在 Web 端由 @supramark/web-diagram 注入的脚本完成。',
      },
    ],
  },
};

// 注册到 FeatureRegistry，便于能力发现 / 配置桥梁
FeatureRegistry.register(diagramVegaLiteFeature);

// 目前保留空 options 类型，预留未来扩展（例如默认 renderer / theme 等）
export interface DiagramVegaLiteFeatureOptions {
  // reserved for future options
}

export type DiagramVegaLiteFeatureConfig = FeatureConfigWithOptions<DiagramVegaLiteFeatureOptions>;

export function createDiagramVegaLiteFeatureConfig(
  enabled: boolean,
  options?: DiagramVegaLiteFeatureOptions
): DiagramVegaLiteFeatureConfig {
  return {
    id: '@supramark/feature-diagram-vega-lite',
    enabled,
    options,
  };
}

export function getDiagramVegaLiteFeatureOptions(
  config?: SupramarkConfig
): DiagramVegaLiteFeatureOptions | undefined {
  return getFeatureOptionsAs<DiagramVegaLiteFeatureOptions>(
    config,
    '@supramark/feature-diagram-vega-lite'
  );
}
