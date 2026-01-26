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
import { diagramDotExamples } from './examples.js';

/**
 * DOT / Graphviz 图表 Feature（规范层，占位实现）
 *
 * - 复用通用 `diagram` AST 节点；
 * - 只关心 engine 为 'dot' 或 'graphviz' 的 diagram；
 * - 当前阶段：仅解析为 diagram 节点，在 RN / Web 中以占位方式展示；
 *   未来可以接入 wasm / 远端服务生成 SVG。
 *
 * @example
 * ```markdown
 * ```dot
 * digraph G { A -> B }
 * ```
 * ```
 */

const isDotDiagram = (node: SupramarkNode): node is SupramarkDiagramNode => {
  return (
    node.type === 'diagram' &&
    typeof (node as SupramarkDiagramNode).engine === 'string' &&
    ['dot', 'graphviz'].includes((node as SupramarkDiagramNode).engine.toLowerCase())
  );
};

export const diagramDotFeature: SupramarkFeature<SupramarkDiagramNode> = {
  metadata: {
    id: '@supramark/feature-diagram-dot',
    name: 'Diagram (DOT / Graphviz)',
    version: '0.1.0',
    author: 'Supramark Team',
    description:
      'Placeholder support for DOT / Graphviz diagrams. Currently parsed as diagram nodes with textual fallback rendering.',
    license: 'Apache-2.0',
    tags: ['diagram', 'dot', 'graphviz'],
    syntaxFamily: 'fence',
  },

  syntax: {
    ast: {
      type: 'diagram',
      selector: isDotDiagram,
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
            description: 'Diagram engine identifier, "dot" or "graphviz".',
          },
          code: {
            type: 'string',
            description: 'Raw DOT source text from the fenced code block.',
          },
          meta: {
            type: 'object',
            description:
              'Optional metadata reserved for future Graphviz integration (layout engine, options, etc.).',
          },
        },
      },
      examples: [
        {
          type: 'diagram',
          engine: 'dot',
          code: 'digraph G { A -> B }',
        } as SupramarkDiagramNode,
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
    },
    web: {
      platform: 'web',
      infrastructure: {
        needsClientScript: false,
      },
    },
  },

  examples: diagramDotExamples,

  testing: {
    syntaxTests: {
      cases: [
        {
          name: '解析 dot 围栏为 diagram 节点',
          input: [
            '```dot',
            'digraph G { A -> B }',
            '```',
          ].join('\n'),
          expected: {
            type: 'diagram',
            engine: 'dot',
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
          name: 'Web 渲染 DOT diagram（占位文本）',
          input: {
            type: 'diagram',
            engine: 'dot',
            code: 'digraph G { A -> B }',
          } as SupramarkDiagramNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
      rn: [
        {
          name: 'RN 渲染 DOT diagram（占位文本）',
          input: {
            type: 'diagram',
            engine: 'dot',
            code: 'digraph G { A -> B }',
          } as SupramarkDiagramNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
    },
    integrationTests: {
      cases: [
        {
          name: '端到端：markdown 中包含 ```dot 围栏',
          input: [
            '# DOT demo',
            '',
            '```dot',
            'digraph G { A -> B }',
            '```',
          ].join('\n'),
          validate: (result: unknown) => {
            if (!result || typeof result !== 'object') return false;
            const root = result as any;
            const children = Array.isArray(root.children) ? root.children : [];
            return children.some(
              (n: any) =>
                n.type === 'diagram' &&
                (String(n.engine).toLowerCase() === 'dot' ||
                  String(n.engine).toLowerCase() === 'graphviz'),
            );
          },
          platforms: ['web', 'rn'],
        },
      ],
    },
    coverageRequirements: {
      statements: 40,
      branches: 30,
      functions: 30,
      lines: 40,
    },
  },

  documentation: {
    readme: `
# Diagram (DOT / Graphviz) Feature

为 supramark 提供 DOT / Graphviz 围栏代码块的 AST 建模，目前渲染为占位文本。

- 语法：使用 \`\\\`\\\`dot\` 或 \`\\\`\\\`graphviz\` 围栏；
- AST：解析为 \`diagram\` 节点，engine = "dot" 或 "graphviz"，code 为 DOT 源码；
- 渲染：当前仅以文本占位，未来可接入 wasm / 远端服务生成 SVG。
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'DiagramDotFeatureOptions',
          description: 'DOT / Graphviz Feature 的配置选项（占位）。',
          fields: [],
        },
      ],
      functions: [
        {
          name: 'createDiagramDotFeatureConfig',
          description: '创建 Diagram (DOT / Graphviz) Feature 的配置对象。',
          parameters: [
            { name: 'enabled', type: 'boolean', description: '是否启用该 Feature', optional: false },
            { name: 'options', type: 'DiagramDotFeatureOptions', description: '可选配置项', optional: true },
          ],
          returns: 'DiagramDotFeatureConfig',
        },
        {
          name: 'getDiagramDotFeatureOptions',
          description: '从 SupramarkConfig 中读取 Diagram (DOT / Graphviz) 的 options。',
          parameters: [
            { name: 'config', type: 'SupramarkConfig | undefined', description: '全局 supramark 配置', optional: true },
          ],
          returns: 'DiagramDotFeatureOptions | undefined',
        },
      ],
      types: [],
    },

    bestPractices: [
      '在 AST 层就保持 DOT 源码完整，方便未来接入真实渲染引擎。',
    ],

    faq: [
      {
        question: '为什么目前只有占位渲染？',
        answer:
          'DOT / Graphviz 的 SVG 渲染通常依赖 C / wasm 或外部服务，目前阶段先保证语法与 AST 完整，渲染能力会在后续迭代中补上。',
      },
    ],
  },
};

FeatureRegistry.register(diagramDotFeature);

export interface DiagramDotFeatureOptions {
  // 占位：未来可加入 layout / engine 等选项
}

export type DiagramDotFeatureConfig =
  FeatureConfigWithOptions<DiagramDotFeatureOptions>;

export function createDiagramDotFeatureConfig(
  enabled: boolean,
  options?: DiagramDotFeatureOptions
): DiagramDotFeatureConfig {
  return {
    id: '@supramark/feature-diagram-dot',
    enabled,
    options,
  };
}

export function getDiagramDotFeatureOptions(
  config?: SupramarkConfig
): DiagramDotFeatureOptions | undefined {
  return getFeatureOptionsAs<DiagramDotFeatureOptions>(
    config,
    '@supramark/feature-diagram-dot'
  );
}
