import type {
  SupramarkNode,
  SupramarkDiagramNode,
  FeatureConfigWithOptions,
  SupramarkConfig,
  SupramarkFeature,
} from '@supramark/core';
import { FeatureRegistry, getFeatureOptionsAs } from '@supramark/core';
import { diagramEchartsExamples } from './examples.js';

/**
 * ECharts 图表 Feature（规范层）
 *
 * - 复用现有的 `diagram` AST 节点；
 * - 只关心 engine 为 'echarts' 的 diagram；
 * - 解析与渲染逻辑暂由现有 pipeline（parseMarkdown + web-diagram + rn-diagram-worker）负责。
 *
 * @example
 * ```markdown
 * ```echarts
 * { "title": { "text": "ECharts" }, "series": [{ "type": "bar", "data": [1,2,3] }] }
 * ```
 * ```
 */

const isEchartsDiagram = (node: SupramarkNode): node is SupramarkDiagramNode => {
  return (
    node.type === 'diagram' &&
    typeof (node as SupramarkDiagramNode).engine === 'string' &&
    (node as SupramarkDiagramNode).engine.toLowerCase() === 'echarts'
  );
};

export const diagramEchartsFeature: SupramarkFeature<SupramarkDiagramNode> = {
  metadata: {
    id: '@supramark/feature-diagram-echarts',
    name: 'Diagram (ECharts)',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'Support for ECharts diagrams rendered via the unified diagram pipeline.',
    license: 'Apache-2.0',
    tags: ['diagram', 'echarts', 'chart'],
    syntaxFamily: 'fence',
  },

  syntax: {
    ast: {
      type: 'diagram',
      selector: isEchartsDiagram,
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
            description: 'Diagram engine identifier, expected to be "echarts".',
          },
          code: {
            type: 'string',
            description: 'Raw ECharts option JSON from the fenced code block.',
          },
          meta: {
            type: 'object',
            description: 'Optional metadata for ECharts rendering (theme / size / renderer).',
          },
        },
      },
      examples: [
        {
          type: 'diagram',
          engine: 'echarts',
          code: '{ "title": { "text": "ECharts" }, "series": [{ "type": "bar", "data": [1,2,3] }] }',
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
        clientScriptBuilder: () => '<!-- ECharts scripts provided by @supramark/web-diagram -->',
      },
      dependencies: [
        {
          name: 'echarts',
          version: '^5.0.0',
          type: 'cdn',
          cdnUrl: 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js',
        },
      ],
    },
  },

  examples: diagramEchartsExamples,

  testing: {
    syntaxTests: {
      cases: [
        {
          name: '解析 echarts 围栏代码块为 diagram 节点',
          input: ['```echarts', '{ "series": [] }', '```'].join('\n'),
          expected: {
            type: 'diagram',
            engine: 'echarts',
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
          name: 'Web 渲染 ECharts diagram（占位验证输出存在）',
          input: {
            type: 'diagram',
            engine: 'echarts',
            code: '{ "series": [] }',
          } as SupramarkDiagramNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
      rn: [
        {
          name: 'RN 渲染 ECharts diagram（占位验证输出存在）',
          input: {
            type: 'diagram',
            engine: 'echarts',
            code: '{ "series": [] }',
          } as SupramarkDiagramNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
    },
    integrationTests: {
      cases: [
        {
          name: '端到端：markdown 中包含 ```echarts 围栏',
          input: ['# ECharts demo', '', '```echarts', '{ "series": [] }', '```'].join('\n'),
          validate: (result: unknown) => {
            if (!result || typeof result !== 'object') return false;
            const root = result as any;
            const children = Array.isArray(root.children) ? root.children : [];
            return children.some(
              (n: any) => n.type === 'diagram' && String(n.engine).toLowerCase() === 'echarts'
            );
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
# Diagram (ECharts) Feature

为 supramark 提供基于 Apache ECharts 的图表示例支持。

- 语法：使用 \`\\\`\\\`echarts\` 围栏代码块，内容为 ECharts option JSON；
- AST：解析为 \`diagram\` 节点，engine = "echarts"，code 为 option 字符串；
- 渲染：通过统一图表子系统生成 SVG 后在 RN / Web 中展示。
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'DiagramEchartsFeatureOptions',
          description: 'Diagram (ECharts) Feature 的配置选项（当前为空，预留扩展）。',
          fields: [],
        },
      ],
      functions: [
        {
          name: 'createDiagramEchartsFeatureConfig',
          description: '创建 Diagram (ECharts) Feature 的配置，用于 SupramarkConfig.features。',
          parameters: [
            {
              name: 'enabled',
              type: 'boolean',
              description: '是否启用该 Feature',
              optional: false,
            },
            {
              name: 'options',
              type: 'DiagramEchartsFeatureOptions',
              description: '可选配置项',
              optional: true,
            },
          ],
          returns: 'DiagramEchartsFeatureConfig',
        },
        {
          name: 'getDiagramEchartsFeatureOptions',
          description: '从 SupramarkConfig 中读取 Diagram (ECharts) 的 options。',
          parameters: [
            {
              name: 'config',
              type: 'SupramarkConfig | undefined',
              description: '全局 supramark 配置',
              optional: true,
            },
          ],
          returns: 'DiagramEchartsFeatureOptions | undefined',
        },
      ],
      types: [],
    },

    bestPractices: [
      '尽量复用与前端项目一致的 ECharts option 结构，便于共享调试。',
      '使用 meta 字段传递与渲染相关的额外信息（如 renderer、theme）。',
    ],

    faq: [
      {
        question: 'RN 端如何渲染 ECharts？',
        answer:
          '通过 @supramark/rn-diagram-worker 中的 headless WebView 加载 ECharts 并生成 SVG，再交给 RN 端呈现。',
      },
    ],
  },
};

FeatureRegistry.register(diagramEchartsFeature);

export interface DiagramEchartsFeatureOptions {
  // 预留配置位：例如默认 renderer / theme 等
}

export type DiagramEchartsFeatureConfig = FeatureConfigWithOptions<DiagramEchartsFeatureOptions>;

export function createDiagramEchartsFeatureConfig(
  enabled: boolean,
  options?: DiagramEchartsFeatureOptions
): DiagramEchartsFeatureConfig {
  return {
    id: '@supramark/feature-diagram-echarts',
    enabled,
    options,
  };
}

export function getDiagramEchartsFeatureOptions(
  config?: SupramarkConfig
): DiagramEchartsFeatureOptions | undefined {
  return getFeatureOptionsAs<DiagramEchartsFeatureOptions>(
    config,
    '@supramark/feature-diagram-echarts'
  );
}
