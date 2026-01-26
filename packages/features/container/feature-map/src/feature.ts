import type {
  SupramarkMapNode,
  FeatureConfigWithOptions,
  SupramarkConfig,
  SupramarkFeature,
} from '@supramark/core';
import { getFeatureOptionsAs, FeatureRegistry } from '@supramark/core';
import { mapExamples } from './examples.js';

/**
 * Map Feature
 *
 * 地图卡片占位
 *
 * @example
 * ```markdown
 * :::map
 * center: [34.05, -118.24]
 * zoom: 12
 * marker:
 *   lat: 34.05
 *   lng: -118.24
 * :::
 * ```
 *
 * 节点类型说明：
 * - 解析统一生成 `type: 'map'` 的块级节点；
 * - 通过 center / zoom / marker 字段表达地图视图；
 * - 具体地图容器（Web / RN）由宿主实现。
 */
export const mapFeature: SupramarkFeature<SupramarkMapNode> = {
  metadata: {
    id: '@supramark/feature-map',
    name: 'Map',
    version: '0.1.0',
    author: 'Supramark Team',
    description: '地图卡片占位',
    license: 'Apache-2.0',
    tags: ['map', 'location', 'geo'],
    syntaxFamily: 'container',
  },

  syntax: {
    ast: {
      type: 'map',

      // 可选：描述节点接口
      interface: {
        required: ['type', 'center'],
        optional: ['zoom', 'marker', 'meta'],
        fields: {
          type: {
            type: 'string',
            description: '节点类型，固定为 "map"。',
          },
          center: {
            type: 'array',
            description: '地图中心点 [lat, lng]，必填。',
          },
          zoom: {
            type: 'number',
            description: '缩放级别（数值越大越放大），可选。',
          },
          marker: {
            type: 'object',
            description: '单个标记点坐标，可选。',
          },
          meta: {
            type: 'object',
            description: '附加元信息，例如 provider / style / 交互行为等。',
          },
        },
      },

      // 可选：节点约束
      constraints: {
        allowedParents: ['root', 'paragraph', 'list_item'],
        allowedChildren: [],
      },

      // 可选：示例节点
      examples: [
        {
          type: 'map',
          center: [34.05, -118.24],
          zoom: 12,
          marker: { lat: 34.05, lng: -118.24 },
        } as SupramarkMapNode,
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

  renderers: {
    rn: {
      platform: 'rn',
      infrastructure: {
        needsWorker: false,
        needsCache: false,
      },
      dependencies: [],
    },
    web: {
      platform: 'web',
      infrastructure: {
        needsClientScript: false,
        needsWorker: false,
        needsCache: false,
      },
      dependencies: [],
    },
  },

  // 使用示例
  examples: mapExamples,

  // 测试定义（最小可用）
  testing: {
    syntaxTests: {
      cases: [
        {
          name: '解析 :::map 容器为 map 节点',
          input: [
            ':::map',
            'center: [34.05, -118.24]',
            'zoom: 12',
            ':::',
          ].join('\n'),
          expected: {
            type: 'map',
          } as SupramarkMapNode,
          options: {
            typeOnly: true,
          },
        },
      ],
    },
    renderTests: {
      web: [
        {
          name: 'Web 渲染 map 节点（占位卡片存在）',
          input: {
            type: 'map',
            center: [0, 0],
          } as SupramarkMapNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
      rn: [
        {
          name: 'RN 渲染 map 节点（占位卡片存在）',
          input: {
            type: 'map',
            center: [0, 0],
          } as SupramarkMapNode,
          expected: (output: unknown) => output !== null && output !== undefined,
          snapshot: false,
        },
      ],
    },
    integrationTests: {
      cases: [
        {
          name: '端到端：markdown 中包含 :::map 容器',
          input: [
            '# Map demo',
            '',
            ':::map',
            'center: [34.05, -118.24]',
            ':::',
          ].join('\n'),
          validate: (result: unknown) => {
            if (!result || typeof result !== 'object') return false;
            const root = result as any;
            const children = Array.isArray(root.children) ? root.children : [];
            return children.some((n: any) => n.type === 'map');
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
# Map Feature

使用 \`:::map\` 容器定义一张「地图卡片」占位节点，由宿主在 RN / Web 中提供具体地图实现。

- 语法：\`:::map ... :::\`；
- AST：解析为 \`map\` 节点，包含 center / zoom / marker / meta 等结构化字段；
- 渲染：默认实现为简单卡片，展示「这里应该是地图」，真实地图由宿主注入。
    `.trim(),

    api: {
      interfaces: [
        {
          name: 'MapFeatureOptions',
          description: 'Map Feature 的配置选项，例如默认 provider / defaultZoom。',
          fields: [
            {
              name: 'provider',
              type: `'apple' | 'google' | 'mapbox' | 'custom' | undefined`,
              description: '默认地图提供方标识，由宿主解释具体含义。',
              required: false,
            },
            {
              name: 'defaultZoom',
              type: 'number | undefined',
              description: '当节点未指定 zoom 时使用的默认缩放级别。',
              required: false,
            },
          ],
        },
      ],
      functions: [
        {
          name: 'createMapFeatureConfig',
          description: '创建 Map Feature 的配置对象，用于 SupramarkConfig.features。',
          parameters: [
            { name: 'enabled', type: 'boolean', description: '是否启用该 Feature', optional: true },
            { name: 'options', type: 'MapFeatureOptions', description: '可选配置项', optional: true },
          ],
          returns: 'MapFeatureConfig',
        },
        {
          name: 'getMapFeatureOptions',
          description: '从 SupramarkConfig 中读取 Map Feature 的 options。',
          parameters: [
            { name: 'config', type: 'SupramarkConfig | undefined', description: '全局 supramark 配置', optional: true },
          ],
          returns: 'MapFeatureOptions | undefined',
        },
      ],
      types: [],
    },

    bestPractices: [
      '在 options.provider 中声明抽象的 provider 标识，由宿主进行实际映射。',
      '将地图业务逻辑封装在宿主组件中，Map 节点只承担数据与占位作用。',
    ],

    faq: [
      {
        question: '为什么 Map Feature 默认只渲染卡片而不是直接画地图？',
        answer:
          '因为不同项目对地图 SDK 的选择差异很大（Apple / Google / 第三方），supramark 只负责抽象 AST 结构和占位渲染，真实地图由宿主注入实现。',
      },
      {
        question: 'MapFeatureOptions 有什么作用？',
        answer:
          '它提供了一层与具体地图库解耦的配置：例如通过 provider 声明使用哪一类地图服务，通过 defaultZoom 指定未配置 zoom 时的默认缩放级别，上层宿主可以按自己选用的 SDK 做映射。',
      },
    ],
  },
};

export interface MapFeatureOptions {
  /**
   * 默认地图提供方（由宿主解释），例如：
   * - 'apple' | 'google' | 'mapbox' | 'custom'
   */
  provider?: 'apple' | 'google' | 'mapbox' | 'custom';

  /**
   * 可选：未在节点中指定 zoom 时使用的默认缩放级别。
   */
  defaultZoom?: number;
}

export type MapFeatureConfig = FeatureConfigWithOptions<MapFeatureOptions>;

export function createMapFeatureConfig(
  enabled = true,
  options?: MapFeatureOptions
): MapFeatureConfig {
  return {
    id: '@supramark/feature-map',
    enabled,
    options,
  };
}

export function getMapFeatureOptions(
  config?: SupramarkConfig
): MapFeatureOptions | undefined {
  return getFeatureOptionsAs<MapFeatureOptions>(
    config,
    '@supramark/feature-map'
  );
}

// 注册 Feature，便于通过 FeatureRegistry 统一发现与配置
FeatureRegistry.register(mapFeature);
