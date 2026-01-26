import type {
  SupramarkNode,
  SupramarkDiagramNode,
  FeatureConfigWithOptions,
  SupramarkConfig,
  SupramarkFeature,
} from '@supramark/core';
import {
  FeatureRegistry,
  getFeatureOptionsAs,
} from '@supramark/core';
import { diagramPlantUmlExamples } from './examples.js';

/**
 * PlantUML 图表 Feature（规范层）
 *
 * - 复用通用 `diagram` AST 节点；
 * - 只关心 engine 为 'plantuml' 的 diagram；
 * - 解析与渲染逻辑由现有 pipeline（parseMarkdown + web-diagram + rn-diagram-worker）负责。
 *
 * @example
 * ```markdown
 * ```plantuml
 * @startuml
 * Alice -> Bob: Hello
 * @enduml
 * ```
 * ```
 */

const isPlantUmlDiagram = (node: SupramarkNode): node is SupramarkDiagramNode => {
  return (
    node.type === 'diagram' &&
    typeof (node as SupramarkDiagramNode).engine === 'string' &&
    (node as SupramarkDiagramNode).engine.toLowerCase() === 'plantuml'
  );
};

export const diagramPlantUmlFeature: SupramarkFeature<SupramarkDiagramNode> = {
  metadata: {
    id: '@supramark/feature-diagram-plantuml',
    name: 'Diagram (PlantUML)',
    version: '0.1.0',
    author: 'Supramark Team',
    description: 'Support for PlantUML diagrams rendered via remote PlantUML server (SVG).',
    license: 'Apache-2.0',
    tags: ['diagram', 'plantuml', 'uml'],
    syntaxFamily: 'fence',
  },

  syntax: {
    ast: {
      type: 'diagram',
      selector: isPlantUmlDiagram,
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
            description: 'Diagram engine identifier, fixed as "plantuml" for this feature.',
          },
          code: {
            type: 'string',
            description: 'Raw PlantUML source text (between ```plantuml fences).',
          },
          meta: {
            type: 'object',
            description:
              'Optional metadata used by runtime (e.g. custom PlantUML server URL, timeout settings).',
          },
        },
      },
      examples: [
        {
          type: 'diagram',
          engine: 'plantuml',
          code: '@startuml\nAlice -> Bob: Hello\n@enduml',
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
    },
    web: {
      platform: 'web',
      infrastructure: {
        needsClientScript: true,
        clientScriptBuilder: () =>
          '<!-- PlantUML integration provided by @supramark/web-diagram (remote server → SVG). -->',
      },
    },
  },

  examples: diagramPlantUmlExamples,

  testing: {
    syntaxTests: {
      cases: [
        {
          name: '解析 plantuml 围栏为 diagram 节点',
          input: [
            '```plantuml',
            '@startuml',
            'Alice -> Bob: Hello',
            '@enduml',
            '```',
          ].join('\n'),
          expected: {
            type: 'diagram',
            engine: 'plantuml',
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
          name: 'Web 渲染 PlantUML diagram（占位验证输出存在）',
          input: {
            type: 'diagram',
            engine: 'plantuml',
            code: '@startuml\nAlice -> Bob: Hello\n@enduml',
          } as SupramarkDiagramNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
      rn: [
        {
          name: 'RN 渲染 PlantUML diagram（占位验证输出存在）',
          input: {
            type: 'diagram',
            engine: 'plantuml',
            code: '@startuml\nAlice -> Bob: Hello\n@enduml',
          } as SupramarkDiagramNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
    },
    integrationTests: {
      cases: [
        {
          name: '端到端：markdown 中包含 ```plantuml 围栏',
          input: [
            '# PlantUML demo',
            '',
            '```plantuml',
            '@startuml',
            'Alice -> Bob: Hello',
            '@enduml',
            '```',
          ].join('\n'),
          validate: (result: unknown) => {
            if (!result || typeof result !== 'object') return false;
            const root = result as any;
            const children = Array.isArray(root.children) ? root.children : [];
            return children.some(
              (n: any) =>
                n.type === 'diagram' &&
                String(n.engine).toLowerCase() === 'plantuml',
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
# Diagram (PlantUML) Feature

为 supramark 提供基于 PlantUML 的图表示例支持，通过远端 PlantUML server 渲染为 SVG。

- 语法：使用 \`\\\`\\\`plantuml\` 围栏包裹 PlantUML 源码；
- AST：解析为 \`diagram\` 节点，engine = "plantuml"，code 为 PlantUML 文本；
- 渲染：统一交给图表子系统，通常通过 HTTP 调用 PlantUML server。
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'DiagramPlantUmlFeatureOptions',
          description: 'PlantUML Feature 的配置选项，例如自定义 PlantUML server 地址。',
          fields: [
            {
              name: 'server',
              type: 'string',
              description: '可选的 PlantUML server 地址（例如 https://www.plantuml.com/plantuml）。',
              required: false,
            },
          ],
        },
      ],
      functions: [
        {
          name: 'createDiagramPlantUmlFeatureConfig',
          description: '创建 Diagram (PlantUML) Feature 的配置对象。',
          parameters: [
            { name: 'enabled', type: 'boolean', description: '是否启用该 Feature', optional: false },
            { name: 'options', type: 'DiagramPlantUmlFeatureOptions', description: '可选配置项', optional: true },
          ],
          returns: 'DiagramPlantUmlFeatureConfig',
        },
        {
          name: 'getDiagramPlantUmlFeatureOptions',
          description: '从 SupramarkConfig 中读取 PlantUML Feature 的 options。',
          parameters: [
            { name: 'config', type: 'SupramarkConfig | undefined', description: '全局 supramark 配置', optional: true },
          ],
          returns: 'DiagramPlantUmlFeatureOptions | undefined',
        },
      ],
      types: [],
    },

    bestPractices: [
      '在服务端或配置中统一管理 PlantUML server 地址，避免硬编码在 markdown 中。',
      '对于大规模使用 PlantUML 的项目，建议在前端加上缓存层，减少重复请求。',
    ],

    faq: [
      {
        question: '为什么需要远端 PlantUML server？',
        answer:
          'PlantUML 依赖 Java/Graphviz 等环境，直接在 RN/Web 端运行成本较高，通过远端 server 渲染为 SVG 更为实际。',
      },
    ],
  },
};

FeatureRegistry.register(diagramPlantUmlFeature);

export interface DiagramPlantUmlFeatureOptions {
  server?: string;
}

export type DiagramPlantUmlFeatureConfig =
  FeatureConfigWithOptions<DiagramPlantUmlFeatureOptions>;

export function createDiagramPlantUmlFeatureConfig(
  enabled: boolean,
  options?: DiagramPlantUmlFeatureOptions
): DiagramPlantUmlFeatureConfig {
  return {
    id: '@supramark/feature-diagram-plantuml',
    enabled,
    options,
  };
}

export function getDiagramPlantUmlFeatureOptions(
  config?: SupramarkConfig
): DiagramPlantUmlFeatureOptions | undefined {
  return getFeatureOptionsAs<DiagramPlantUmlFeatureOptions>(
    config,
    '@supramark/feature-diagram-plantuml'
  );
}
