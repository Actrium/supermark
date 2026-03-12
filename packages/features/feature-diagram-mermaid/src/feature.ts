import type {
  SupramarkNode,
  SupramarkDiagramNode,
  FeatureConfigWithOptions,
  SupramarkConfig,
  SupramarkFeature,
} from '@supramark/core';
import { FeatureRegistry, getFeatureOptionsAs } from '@supramark/core';
import { diagramMermaidExamples } from './examples.js';

/**
 * Mermaid 图表 Feature
 *
 * - 复用通用 `diagram` AST 节点；
 * - 只关心 engine 为 'mermaid' 的 diagram；
 * - 通过 diagram-engine 中的 mermaid 引擎（beautiful-mermaid）渲染为 SVG。
 *
 * @example
 * ```markdown
 * ```mermaid
 * graph TD
 *   A --> B
 * ```
 * ```
 */

const isMermaidDiagram = (node: SupramarkNode): node is SupramarkDiagramNode => {
  return (
    node.type === 'diagram' &&
    typeof (node as SupramarkDiagramNode).engine === 'string' &&
    (node as SupramarkDiagramNode).engine.toLowerCase() === 'mermaid'
  );
};

export const diagramMermaidFeature: SupramarkFeature<SupramarkDiagramNode> = {
  metadata: {
    id: '@supramark/feature-diagram-mermaid',
    name: 'Diagram (Mermaid)',
    version: '0.1.0',
    author: 'Supramark Team',
    description:
      'Support for Mermaid diagrams. Renders flowcharts, sequence diagrams, class diagrams and more via the mermaid engine.',
    license: 'Apache-2.0',
    tags: ['diagram', 'mermaid'],
    syntaxFamily: 'fence',
  },

  syntax: {
    ast: {
      type: 'diagram',
      selector: isMermaidDiagram,
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
            description: 'Diagram engine identifier, "mermaid".',
          },
          code: {
            type: 'string',
            description: 'Raw Mermaid source text from the fenced code block.',
          },
          meta: {
            type: 'object',
            description:
              'Optional metadata for Mermaid rendering (theme, config overrides, etc.).',
          },
        },
      },
      examples: [
        {
          type: 'diagram',
          engine: 'mermaid',
          code: 'graph TD\n  A --> B',
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

  examples: diagramMermaidExamples,

  testing: {
    syntaxTests: {
      cases: [
        {
          name: '解析 mermaid 围栏为 diagram 节点',
          input: ['```mermaid', 'graph TD', '  A --> B', '```'].join('\n'),
          expected: {
            type: 'diagram',
            engine: 'mermaid',
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
          name: 'Web 渲染 Mermaid diagram',
          input: {
            type: 'diagram',
            engine: 'mermaid',
            code: 'graph TD\n  A --> B',
          } as SupramarkDiagramNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
      rn: [
        {
          name: 'RN 渲染 Mermaid diagram',
          input: {
            type: 'diagram',
            engine: 'mermaid',
            code: 'graph TD\n  A --> B',
          } as SupramarkDiagramNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
    },
    integrationTests: {
      cases: [
        {
          name: '端到端：markdown 中包含 ```mermaid 围栏',
          input: ['# Mermaid demo', '', '```mermaid', 'graph TD', '  A --> B', '```'].join('\n'),
          validate: (result: unknown) => {
            if (!result || typeof result !== 'object') return false;
            const root = result as any;
            const children = Array.isArray(root.children) ? root.children : [];
            return children.some(
              (n: any) =>
                n.type === 'diagram' &&
                String(n.engine).toLowerCase() === 'mermaid'
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
# Diagram (Mermaid) Feature

为 supramark 提供 Mermaid 围栏代码块的 AST 建模与渲染支持。

- 语法：使用 \`\\\`\\\`mermaid\` 围栏；
- AST：解析为 \`diagram\` 节点，engine = "mermaid"，code 为 Mermaid 源码；
- 渲染：通过 diagram-engine 的 mermaid 引擎（beautiful-mermaid）渲染为 SVG。
- 支持：flowchart、sequence diagram、class diagram、state diagram、ER diagram、gantt 等。
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'DiagramMermaidFeatureOptions',
          description: 'Mermaid Feature 的配置选项。',
          fields: [],
        },
      ],
      functions: [
        {
          name: 'createDiagramMermaidFeatureConfig',
          description: '创建 Diagram (Mermaid) Feature 的配置对象。',
          parameters: [
            {
              name: 'enabled',
              type: 'boolean',
              description: '是否启用该 Feature',
              optional: false,
            },
            {
              name: 'options',
              type: 'DiagramMermaidFeatureOptions',
              description: '可选配置项',
              optional: true,
            },
          ],
          returns: 'DiagramMermaidFeatureConfig',
        },
        {
          name: 'getDiagramMermaidFeatureOptions',
          description: '从 SupramarkConfig 中读取 Diagram (Mermaid) 的 options。',
          parameters: [
            {
              name: 'config',
              type: 'SupramarkConfig | undefined',
              description: '全局 supramark 配置',
              optional: true,
            },
          ],
          returns: 'DiagramMermaidFeatureOptions | undefined',
        },
      ],
      types: [],
    },

    bestPractices: ['在 AST 层保持 Mermaid 源码完整，确保渲染引擎可以正确解析。'],

    faq: [
      {
        question: 'Mermaid 渲染依赖什么？',
        answer:
          'diagram-engine 中的 mermaid 引擎使用 beautiful-mermaid 库进行渲染，需要确保该依赖已安装。',
      },
    ],
  },
};

FeatureRegistry.register(diagramMermaidFeature);

export interface DiagramMermaidFeatureOptions {
  // 未来可加入 theme / config 等选项
}

export type DiagramMermaidFeatureConfig = FeatureConfigWithOptions<DiagramMermaidFeatureOptions>;

export function createDiagramMermaidFeatureConfig(
  enabled: boolean,
  options?: DiagramMermaidFeatureOptions
): DiagramMermaidFeatureConfig {
  return {
    id: '@supramark/feature-diagram-mermaid',
    enabled,
    options,
  };
}

export function getDiagramMermaidFeatureOptions(
  config?: SupramarkConfig
): DiagramMermaidFeatureOptions | undefined {
  return getFeatureOptionsAs<DiagramMermaidFeatureOptions>(config, '@supramark/feature-diagram-mermaid');
}
