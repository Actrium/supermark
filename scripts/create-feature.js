#!/usr/bin/env node

/**
 * Supramark Feature 脚手架工具
 *
 * 用法：
 *   node scripts/create-feature.js
 *   npm run create-feature
 *
 * 功能：
 * - 交互式问答收集 Feature 信息
 * - 生成 Feature 定义文件
 * - 生成测试文件模板
 * - 生成文档模板
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getNewFeatureLocation } = require('./feature-layout');

const REPO_ROOT = path.resolve(__dirname, '..');

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 创建交互式输入接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(`${colors.blue}${prompt}${colors.reset}`, (answer) => {
      resolve(answer.trim());
    });
  });
}

// 验证函数
function validateId(id) {
  return /^@[\w-]+\/feature-[\w-]+$/.test(id);
}

function validateVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

// 常见节点类型的字段推荐
const NODE_TYPE_TEMPLATES = {
  diagram: {
    required: ['type', 'engine', 'code'],
    optional: ['meta', 'title', 'width', 'height'],
    fields: {
      engine: { type: 'string', description: 'Diagram engine (e.g., mermaid, plantuml, vega-lite)' },
      code: { type: 'string', description: 'Diagram code content' },
      meta: { type: 'object', description: 'Additional metadata' },
      title: { type: 'string', description: 'Diagram title' },
      width: { type: 'number', description: 'Diagram width' },
      height: { type: 'number', description: 'Diagram height' },
    },
  },
  math_inline: {
    required: ['type', 'value'],
    optional: ['katexOptions'],
    fields: {
      value: { type: 'string', description: 'LaTeX math expression' },
      katexOptions: { type: 'object', description: 'KaTeX rendering options' },
    },
    multiNodeNote: '注意: Math Feature 通常需要处理 math_inline 和 math_block 两种节点类型',
  },
  math_block: {
    required: ['type', 'value'],
    optional: ['katexOptions', 'label'],
    fields: {
      value: { type: 'string', description: 'LaTeX math expression' },
      katexOptions: { type: 'object', description: 'KaTeX rendering options' },
      label: { type: 'string', description: 'Equation label for reference' },
    },
  },
  footnote_reference: {
    required: ['type', 'index', 'label'],
    optional: [],
    fields: {
      index: { type: 'number', description: 'Footnote index (1-based)' },
      label: { type: 'string', description: 'Footnote label/identifier' },
    },
    multiNodeNote: '注意: Footnote Feature 通常需要处理 footnote_reference 和 footnote_definition 两种节点类型',
  },
  footnote_definition: {
    required: ['type', 'index', 'label'],
    optional: ['children'],
    fields: {
      index: { type: 'number', description: 'Footnote index (1-based)' },
      label: { type: 'string', description: 'Footnote label/identifier' },
      children: { type: 'array', description: 'Footnote content nodes' },
    },
  },
  admonition: {
    required: ['type', 'kind', 'children'],
    optional: ['title'],
    fields: {
      kind: { type: 'string', description: 'Admonition type (note, warning, tip, etc.)' },
      title: { type: 'string', description: 'Optional title' },
      children: { type: 'array', description: 'Content nodes' },
    },
  },
  definition_list: {
    required: ['type', 'children'],
    optional: [],
    fields: {
      children: { type: 'array', description: 'Definition list items' },
    },
  },
  code: {
    required: ['type', 'lang', 'value'],
    optional: ['meta', 'highlight'],
    fields: {
      lang: { type: 'string', description: 'Programming language' },
      value: { type: 'string', description: 'Code content' },
      meta: { type: 'string', description: 'Metadata string (e.g., line numbers)' },
      highlight: { type: 'array', description: 'Lines to highlight' },
    },
  },
};

// 获取节点类型的字段建议
function getNodeTypeTemplate(nodeType) {
  // 直接匹配
  if (NODE_TYPE_TEMPLATES[nodeType]) {
    return NODE_TYPE_TEMPLATES[nodeType];
  }

  // 模糊匹配（如 math -> math_inline）
  const fuzzyMatch = Object.keys(NODE_TYPE_TEMPLATES).find((key) =>
    key.startsWith(nodeType) || nodeType.startsWith(key.split('_')[0])
  );

  if (fuzzyMatch) {
    return NODE_TYPE_TEMPLATES[fuzzyMatch];
  }

  // 返回默认模板
  return {
    required: ['type'],
    optional: [],
    fields: {},
  };
}

// 模板生成函数
function generateFeatureTemplate(config) {
  const {
    id,
    name,
    version,
    author,
    description,
    type,
    nodeType,
    selector,
    syntaxFamily,
  } = config;

  // 获取节点类型模板
  const template = getNodeTypeTemplate(nodeType);
  const hasTemplate = template.required.length > 1; // 有具体模板（不只是 ['type']）

  const selectorCode = selector
    ? `\n      selector: (node) => node.type === '${nodeType}' && ${selector},`
    : '';

  // 生成字段定义代码
  const generateFieldsCode = () => {
    const typeField = {
      type: 'string',
      description: 'Node type identifier',
    };

    if (!hasTemplate) {
      return `          type: ${JSON.stringify(typeField, null, 12).replace(/\n/g, '\n          ')},
          // TODO: 添加其他字段定义`;
    }

    const allFields = { type: typeField, ...template.fields };
    const fieldsCode = Object.entries(allFields)
      .map(([key, value]) => {
        const valueStr = JSON.stringify(value, null, 12).replace(/\n/g, `\n          `);
        return `          ${key}: ${valueStr},`;
      })
      .join('\n');

    return fieldsCode;
  };

  // 多节点类型提示
  const multiNodeWarning = template.multiNodeNote
    ? `\n      // ${template.multiNodeNote}\n`
    : '';

  return `import type { SupramarkFeature, SupramarkNode } from '@supramark/core';

/**
 * ${name} Feature
 *
 * ${description}
 *
 * @example
 * \`\`\`markdown
 * TODO: 添加 Markdown 示例
 * \`\`\`
 *
 * 节点类型说明：
 * - 如果此 Feature 只处理单一节点类型（如 'diagram'），直接使用当前配置即可
 * - 如果此 Feature 需要处理多个节点类型（如 'math_inline' 和 'math_block'），
 *   请参考下面的"多节点类型处理"注释，定义具体的节点接口和 selector
 */
export const ${toCamelCase(name)}Feature: SupramarkFeature<SupramarkNode> = {
  metadata: {
    id: '${id}',
    name: '${name}',
    version: '${version}',
    author: '${author}',
    description: '${description}',
    license: 'Apache-2.0',
    syntaxFamily: '${syntaxFamily || 'main'}',
    tags: [], // TODO: 添加标签
  },

  syntax: {
    ast: {
      type: '${nodeType}',${selectorCode}
${multiNodeWarning}
      // 多节点类型处理完整示例：
      //
      // 场景：Footnote Feature 需要处理 footnote_reference 和 footnote_definition
      //
      // 1. 定义节点接口
      // interface FootnoteReferenceNode extends SupramarkNode {
      //   type: 'footnote_reference';
      //   index: number;
      //   label: string;
      // }
      //
      // interface FootnoteDefinitionNode extends SupramarkNode {
      //   type: 'footnote_definition';
      //   index: number;
      //   label: string;
      //   children?: SupramarkNode[];
      // }
      //
      // type FootnoteNode = FootnoteReferenceNode | FootnoteDefinitionNode;
      //
      // 2. 使用联合类型和 selector
      // export const footnoteFeature: SupramarkFeature<FootnoteNode> = {
      //   metadata: { ... },
      //   syntax: {
      //     ast: {
      //       type: 'footnote_reference' as const, // 或 'footnote_definition'
      //       selector: (node) =>
      //         node.type === 'footnote_reference' || node.type === 'footnote_definition',
      //       interface: {
      //         required: ['type', 'index', 'label'],
      //         optional: ['children'],
      //         // ...
      //       }
      //     }
      //   }
      // };

      // 可选：描述节点接口${hasTemplate ? ` (基于 ${nodeType} 类型自动生成)` : ''}
      interface: {
        required: ${JSON.stringify(template.required, null, 8)},
        optional: ${JSON.stringify(template.optional, null, 8)},
        fields: {
${generateFieldsCode()}
        },
      },

      // 可选：节点约束
      constraints: {
        allowedParents: ['root'], // TODO: 指定允许的父节点
        allowedChildren: [], // TODO: 指定允许的子节点
      },

      // 可选：示例节点
      examples: [
        // TODO: 添加示例节点
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

  // 可选：渲染器定义
  renderers: {
    // rn: {
    //   platform: 'rn',
    //   infrastructure: {
    //     needsWorker: false,
    //     needsCache: false,
    //   },
    // },
    // web: {
    //   platform: 'web',
    // },
  },

  // 使用示例（初始为空，建议后续补充）
  examples: [],

  // 测试定义（初始为空，建议后续补充）
  testing: {},

  // 文档定义（提供最小可用 README，建议后续完善）
  documentation: {
    readme: \`# ${name}

${description}
\`.trim(),
  },
};

// 注册 Feature（可选）
// FeatureRegistry.register(${toCamelCase(name)}Feature);
`;
}

function generateTestTemplate(config) {
  const { name } = config;

  return `import { ${toCamelCase(name)}Feature } from '../src/feature';
import { validateFeature } from '@supramark/core';

describe('${name} Feature', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      const result = validateFeature(${toCamelCase(name)}Feature);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct id', () => {
      expect(${toCamelCase(name)}Feature.metadata.id).toMatch(/^@[\\w-]+\\/feature-[\\w-]+$/);
    });

    it('should have semantic version', () => {
      expect(${toCamelCase(name)}Feature.metadata.version).toMatch(/^\\d+\\.\\d+\\.\\d+$/);
    });
  });

  describe('Syntax', () => {
    it('should define AST node type', () => {
      expect(${toCamelCase(name)}Feature.syntax.ast.type).toBeDefined();
      expect(typeof ${toCamelCase(name)}Feature.syntax.ast.type).toBe('string');
    });

    // TODO: 添加更多语法测试
  });

  // TODO: 添加渲染测试
  // TODO: 添加集成测试
});
`;
}

function generateREADME(config) {
  const { name, description } = config;

  return `# ${name}

${description}

## 功能特性

TODO: 描述主要功能

## 语法

TODO: 添加 Markdown 语法示例

\`\`\`markdown
<!-- TODO: 示例 -->
\`\`\`

## AST 结构

TODO: 描述 AST 节点结构

## 平台支持

- [ ] React Native
- [ ] Web (React)
- [ ] CLI (终端)

## 开发状态

- [ ] AST 定义
- [ ] 解析器实现
- [ ] RN 渲染器
- [ ] Web 渲染器
- [ ] 测试用例
- [ ] 文档完善

## 示例

TODO: 添加使用示例

## 相关资源

- [Feature Interface 文档](../../docs/FEATURE_INTERFACE_IMPROVEMENTS.md)
- [API 文档](../core/docs/api)
`;
}

function generatePackageJson(config) {
  const { id, name, version, description, repositoryDirectory } = config;
  const kebabName = toKebabCase(name);

  return `{
  "name": "${id}",
  "version": "${version}",
  "description": "${description || name + ' Feature'}",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "src",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "keywords": [
    "supramark",
    "feature",
    "${kebabName}",
    "markdown"
  ],
  "author": "${config.author}",
  "license": "Apache-2.0",
  "peerDependencies": {
    "@supramark/core": "workspace:*"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.5.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/supramark/supramark.git",
    "directory": "${repositoryDirectory}"
  }
}
`;
}

function generateTsConfig() {
  return `{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
`;
}

function generateExamplesTemplate(config) {
  const { name } = config;
  const camelName = toCamelCase(name);

  return `import type { ExampleDefinition } from '@supramark/core';

/**
 * ${name} Feature examples
 */
export const ${camelName}Examples: ExampleDefinition[] = [
  {
    name: 'TODO',
    description: 'TODO',
    markdown: '\n<!-- TODO: add example markdown -->\n'.trim(),
  },
];
`;
}

function generateContainerRuntimeTemplate(config) {
  const { nodeType } = config;

  return `import type { ContainerHookContext } from '@supramark/core';
import { registerContainerHook } from '@supramark/core';

/**
 * Container runtime for :::${nodeType}
 *
 * TODO: implement parsing logic and push a node into ctx.stack[ctx.stack.length - 1].children
 */
registerContainerHook({
  name: '${nodeType}',
  opaque: true,
  onOpen(_ctx: ContainerHookContext) {
    // TODO
  },
});
`;
}

function generateContainerExtensionTemplate(config) {
  const { id, nodeType } = config;
  const featureDir = `feature-${toKebabCase(config.name)}`;

  return `import type { ContainerExtensionSpec } from '@supramark/core';

/**
 * Extension spec used by scripts/generate-container-registry.ts
 */
export const extension: ContainerExtensionSpec = {
  kind: 'container',
  featureId: '${id}',
  featureDir: '${featureDir}',
  nodeName: '${nodeType}',
  containerNames: ['${nodeType}'],
  parserExport: 'register${toCamelCase(config.name).charAt(0).toUpperCase() + toCamelCase(config.name).slice(1)}ContainerParser',
  webRendererExport: 'render${toCamelCase(config.name).charAt(0).toUpperCase() + toCamelCase(config.name).slice(1)}ContainerWeb',
  rnRendererExport: 'render${toCamelCase(config.name).charAt(0).toUpperCase() + toCamelCase(config.name).slice(1)}ContainerRN',
};
`;
}

function generateContainerSyntaxTemplate(config) {
  const pascalName = toCamelCase(config.name).charAt(0).toUpperCase() + toCamelCase(config.name).slice(1);
  return `/**
 * Container parser registration entry.
 *
 * The actual parser for \`:::${config.nodeType}\` is registered by importing \`runtime.ts\`.
 * This module exists so the registry generator can call a stable exported function.
 */

import './runtime.js';

export function register${pascalName}ContainerParser(): void {
  // runtime.ts registers the container hook as a side-effect.
}
`;
}

function generateContainerRuntimeWebTemplate(config) {
  const pascalName = toCamelCase(config.name).charAt(0).toUpperCase() + toCamelCase(config.name).slice(1);
  return `import React from 'react';
import type { SupramarkConfig } from '@supramark/core';

export interface WebContainerRenderArgs {
  node: any;
  key: number;
  classNames: any;
  config?: SupramarkConfig;
  renderChildren: (children: any[]) => React.ReactNode;
}

export function render${pascalName}ContainerWeb({ node, key, classNames }: WebContainerRenderArgs): React.ReactNode {
  // TODO: render your container block
  return (
    <div key={key} className={classNames.paragraph}>
      <strong>${config.nodeType}</strong>
      <pre>{JSON.stringify(node?.data ?? {}, null, 2)}</pre>
    </div>
  );
}
`;
}

function generateContainerRuntimeRNTemplate(config) {
  const pascalName = toCamelCase(config.name).charAt(0).toUpperCase() + toCamelCase(config.name).slice(1);
  return `import React from 'react';
import { View, Text } from 'react-native';
import type { SupramarkConfig } from '@supramark/core';

export interface RNContainerRenderArgs {
  node: any;
  key: number;
  styles: any;
  config?: SupramarkConfig;
  renderChildren: (children: any[]) => React.ReactNode;
}

export function render${pascalName}ContainerRN({ node, key, styles }: RNContainerRenderArgs): React.ReactNode {
  // TODO: render your container block
  return (
    <View key={key} style={styles.paragraph}>
      <Text style={styles.strong}>${config.nodeType}</Text>
      <Text style={styles.code}>{JSON.stringify(node?.data ?? {})}</Text>
    </View>
  );
}
`;
}

function generateIndexFile(config) {
  const { name, syntaxFamily } = config;
  const camelName = toCamelCase(name);

  const examplesExport = `export { ${camelName}Examples } from './examples.js';\n`;
  const runtimeImport =
    syntaxFamily === 'container'
      ? "\n// Runtime: register container hooks\nimport './runtime.js';\n"
      : '';

  return `/**
 * ${name} Feature
 *
 * @packageDocumentation
 */

export { ${camelName}Feature } from './feature.js';
${examplesExport}${runtimeImport}`;
}

function generateJestConfig(jestPresetPath) {
  return `/** @type {import('jest').Config} */
module.exports = {
  // 使用 Supramark 共享的 Jest preset
  // 与 @supramark/core 的测试配置保持一致
  ...require('${jestPresetPath}'),

  // Feature 包特定的配置可以在这里覆盖
  // 例如：
  // testEnvironment: 'jsdom', // 如果需要 DOM 环境
  // collectCoverage: true,     // 启用覆盖率收集
};
`;
}

// 辅助函数
function toCamelCase(str) {
  return str
    .split(/[\s-_]+/)
    .map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}

function toKebabCase(str) {
  return str
    .replace(/\s+/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    name: null,
    id: null,
    version: '0.1.0',
    author: 'Supramark Team',
    description: '',
    nodeType: null,
    selector: '',
    syntaxFamily: null,
    dryRun: false,
    outputDir: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if ((arg === '--name' || arg === '-n') && nextArg) {
      options.name = nextArg;
      i++;
    } else if ((arg === '--id' || arg === '-i') && nextArg) {
      options.id = nextArg;
      i++;
    } else if ((arg === '--version' || arg === '-v') && nextArg) {
      options.version = nextArg;
      i++;
    } else if ((arg === '--author' || arg === '-a') && nextArg) {
      options.author = nextArg;
      i++;
    } else if ((arg === '--description' || arg === '-d') && nextArg) {
      options.description = nextArg;
      i++;
    } else if ((arg === '--node-type' || arg === '-t') && nextArg) {
      options.nodeType = nextArg;
      i++;
    } else if ((arg === '--family' || arg === '-f') && nextArg) {
      options.syntaxFamily = nextArg;
      i++;
    } else if ((arg === '--selector' || arg === '-s') && nextArg) {
      options.selector = nextArg;
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if ((arg === '--output-dir' || arg === '-o') && nextArg) {
      options.outputDir = nextArg;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }

  return options;
}

// 显示帮助信息
function showHelp() {
  console.log(`
${colors.bright}Supramark Feature 脚手架工具${colors.reset}

${colors.blue}用法：${colors.reset}
  npm run create-feature [选项]

${colors.blue}选项：${colors.reset}
  -n, --name <name>          Feature 名称 (如 "Vega-Lite")
  -i, --id <id>              Feature ID (如 "@supramark/feature-vega-lite")
  -v, --version <version>    版本号 (默认: "0.1.0")
  -a, --author <author>      作者 (默认: "Supramark Team")
  -d, --description <desc>   简短描述
  -t, --node-type <type>     AST 节点类型 (如 "diagram")
  -f, --family <family>      语法家族: main | container | fence (默认: main)
  -s, --selector <selector>  节点选择器逻辑 (可选)
  --dry-run                  仅打印将生成的文件列表，不写入磁盘
  -o, --output-dir <dir>     输出目录（用于验证/自定义输出；会覆盖默认 packages/features/... 位置）
  -h, --help                 显示此帮助信息

说明：
  - family=container 会额外生成：
      - src/runtime.ts（解析 hook）
      - src/extension.ts / src/syntax.ts（供 gen:container-registry 自动发现/注册）
      - src/runtime.web.tsx / src/runtime.rn.tsx（内置渲染器，零手工集成）
    并在 src/index.ts 自动 import './runtime.js'
  - family=main|fence 不生成上述 container 文件
  - 所有 family 都会生成 src/examples.ts，并在 src/index.ts 导出对应 Examples 常量

${colors.blue}示例：${colors.reset}
  ${colors.gray}# 交互式创建${colors.reset}
  npm run create-feature

  ${colors.gray}# 通过参数创建${colors.reset}
  npm run create-feature -- \\
    --name "Vega-Lite" \\
    --node-type "diagram" \\
    --selector "['vega-lite', 'vega'].includes(node.engine)" \\
    --description "Vega-Lite 数据可视化支持"

  ${colors.gray}# 简写形式${colors.reset}
  npm run create-feature -- \\
    -n "Math Formula" \\
    -t "math" \\
    -d "LaTeX 数学公式支持"
`);
}

// 主函数
async function main() {
  log('\n🚀 Supramark Feature 脚手架工具\n', 'bright');

  try {
    // 解析命令行参数
    const cliOptions = parseArgs();

    let name = cliOptions.name;
    let id = cliOptions.id;
    let version = cliOptions.version;
    let author = cliOptions.author;
    let description = cliOptions.description;
    let nodeType = cliOptions.nodeType;
    let selector = cliOptions.selector;
    let syntaxFamily = cliOptions.syntaxFamily;
    const dryRun = cliOptions.dryRun;
    const outputDirOption = cliOptions.outputDir;

    // 如果没有提供必需参数，进入交互式模式
    const isInteractive = !name || !nodeType;

    if (isInteractive) {
      // 1. 收集基本信息
      log('请提供 Feature 的基本信息：\n', 'gray');

      if (!name) {
        name = await question('Feature 名称 (如 "Vega-Lite"): ');
        if (!name) {
          throw new Error('Feature 名称不能为空');
        }
      } else {
        log(`Feature 名称: ${name}`, 'gray');
      }

      const defaultId = `@supramark/feature-${toKebabCase(name)}`;
      if (!id) {
        id = await question(`Feature ID [${defaultId}]: `);
        id = id || defaultId;
      } else {
        log(`Feature ID: ${id}`, 'gray');
      }

      if (!validateId(id)) {
        throw new Error('Feature ID 格式无效，应为 @scope/feature-name 格式');
      }

      if (!cliOptions.version || version === '0.1.0') {
        const inputVersion = await question('版本号 [0.1.0]: ');
        version = inputVersion || version;
      } else {
        log(`版本号: ${version}`, 'gray');
      }

      if (!validateVersion(version)) {
        throw new Error('版本号格式无效，应为 x.y.z 格式');
      }

      if (author === 'Supramark Team') {
        const inputAuthor = await question('作者 [Supramark Team]: ');
        author = inputAuthor || author;
      } else {
        log(`作者: ${author}`, 'gray');
      }

      if (!description) {
        description = await question('简短描述: ');
      } else {
        log(`简短描述: ${description}`, 'gray');
      }

      // 2. 收集 AST 信息
      log('\nAST 节点配置：\n', 'gray');

      if (!nodeType) {
        nodeType = await question('AST 节点类型 (如 "diagram"): ');
        if (!nodeType) {
          throw new Error('节点类型不能为空');
        }
      } else {
        log(`AST 节点类型: ${nodeType}`, 'gray');
      }

      if (!selector) {
        const needsSelector = await question('是否需要节点选择器？(y/N): ');
        if (needsSelector.toLowerCase() === 'y') {
          selector = await question('选择器逻辑 (如 "node.engine === \'vega-lite\'"): ');
        }
      } else {
        log(`选择器: ${selector}`, 'gray');
      }

      // 3. 语法家族
      log('\n语法家族（main / container / fence）：\n', 'gray');
      if (!syntaxFamily) {
        const familyInput = await question('Syntax family [main]: ');
        const normalized = (familyInput || 'main').trim().toLowerCase();
        if (['main', 'container', 'fence'].includes(normalized)) {
          syntaxFamily = normalized;
        } else {
          syntaxFamily = 'main';
        }
      } else {
        log(`语法家族: ${syntaxFamily}`, 'gray');
      }
    } else {
      // 非交互式模式：使用命令行参数
      log('使用命令行参数创建 Feature：\n', 'gray');
      log(`  Feature 名称: ${name}`, 'gray');

      // 生成默认 ID（如果没有提供）
      if (!id) {
        id = `@supramark/feature-${toKebabCase(name)}`;
      }
      log(`  Feature ID: ${id}`, 'gray');

      if (!validateId(id)) {
        throw new Error('Feature ID 格式无效，应为 @scope/feature-name 格式');
      }

      log(`  版本号: ${version}`, 'gray');

      if (!validateVersion(version)) {
        throw new Error('版本号格式无效，应为 x.y.z 格式');
      }

      log(`  作者: ${author}`, 'gray');
      log(`  简短描述: ${description || '(未提供)'}`, 'gray');
      log(`  AST 节点类型: ${nodeType}`, 'gray');
      if (selector) {
        log(`  选择器: ${selector}`, 'gray');
      }
      syntaxFamily = (syntaxFamily || 'main').toLowerCase();
      if (!['main', 'container', 'fence'].includes(syntaxFamily)) {
        syntaxFamily = 'main';
      }
      log(`  语法家族: ${syntaxFamily}`, 'gray');
      log('');
    }

    // 3. 目录冲突检查
    const featureName = toKebabCase(name);
    const familyForLayout = (syntaxFamily || 'main').toLowerCase();
    const defaultLocation = getNewFeatureLocation(featureName, familyForLayout);
    const defaultBasePath = defaultLocation.dir;
    const defaultRelativeDir = defaultLocation.relativeDir;

    const basePath = outputDirOption
      ? path.resolve(process.cwd(), outputDirOption)
      : defaultBasePath;

    const relativeDir = outputDirOption
      ? path.relative(REPO_ROOT, basePath).replace(/\\/g, '/') || '.'
      : defaultRelativeDir;

    if (!dryRun && fs.existsSync(basePath)) {
      throw new Error(`Feature 目录已存在: ${path.relative(process.cwd(), basePath)}\n请选择其他名称或删除现有目录`);
    }

    // 4. 创建目录结构
    log(`\n📁 创建目录结构${dryRun ? ' (dry-run)' : ''}...\n`, 'gray');

    const dirs = [
      basePath,
      path.join(basePath, 'src'),
      path.join(basePath, '__tests__'),
    ];

    if (!dryRun) {
      dirs.forEach((dir) => {
        fs.mkdirSync(dir, { recursive: true });
        log(`  ✓ ${path.relative(process.cwd(), dir)}`, 'green');
      });
    } else {
      dirs.forEach((dir) => {
        log(`  • ${path.relative(process.cwd(), dir)}`, 'gray');
      });
    }

    // 5. 生成文件
    const config = {
      id,
      name,
      version,
      author,
      description,
      nodeType,
      selector,
      repositoryDirectory: relativeDir,
      syntaxFamily: familyForLayout,
    };

    const jestPresetPath = path
      .relative(basePath, path.join(REPO_ROOT, 'jest.preset.cjs'))
      .replace(/\\/g, '/');

    const files = [
      {
        path: path.join(basePath, 'package.json'),
        content: generatePackageJson(config),
        desc: 'package.json',
      },
      {
        path: path.join(basePath, 'tsconfig.json'),
        content: generateTsConfig(),
        desc: 'tsconfig.json',
      },
      {
        path: path.join(basePath, 'jest.config.cjs'),
        content: generateJestConfig(jestPresetPath.startsWith('.') ? jestPresetPath : `./${jestPresetPath}`),
        desc: 'jest.config.cjs',
      },
      {
        path: path.join(basePath, 'src', 'index.ts'),
        content: generateIndexFile(config),
        desc: 'src/index.ts',
      },
      {
        path: path.join(basePath, 'src', 'feature.ts'),
        content: generateFeatureTemplate(config),
        desc: 'src/feature.ts',
      },
      {
        path: path.join(basePath, 'src', 'examples.ts'),
        content: generateExamplesTemplate(config),
        desc: 'src/examples.ts',
      },
      {
        path: path.join(basePath, '__tests__', 'feature.test.ts'),
        content: generateTestTemplate(config),
        desc: '__tests__/feature.test.ts',
      },
      {
        path: path.join(basePath, 'README.md'),
        content: generateREADME(config),
        desc: 'README.md',
      },
    ];

    // family-specific files
    if (familyForLayout === 'container') {
      files.push(
        {
          path: path.join(basePath, 'src', 'runtime.ts'),
          content: generateContainerRuntimeTemplate(config),
          desc: 'src/runtime.ts',
        },
        {
          path: path.join(basePath, 'src', 'extension.ts'),
          content: generateContainerExtensionTemplate(config),
          desc: 'src/extension.ts',
        },
        {
          path: path.join(basePath, 'src', 'syntax.ts'),
          content: generateContainerSyntaxTemplate(config),
          desc: 'src/syntax.ts',
        },
        {
          path: path.join(basePath, 'src', 'runtime.web.tsx'),
          content: generateContainerRuntimeWebTemplate(config),
          desc: 'src/runtime.web.tsx',
        },
        {
          path: path.join(basePath, 'src', 'runtime.rn.tsx'),
          content: generateContainerRuntimeRNTemplate(config),
          desc: 'src/runtime.rn.tsx',
        }
      );
    }

    log(`\n📝 生成文件${dryRun ? ' (dry-run)' : ''}...\n`, 'gray');
    files.forEach((file) => {
      if (!dryRun) {
        fs.writeFileSync(file.path, file.content, 'utf-8');
        log(`  ✓ ${file.desc}`, 'green');
      } else {
        log(`  • ${file.desc}`, 'gray');
      }
    });

    if (dryRun) {
      log('\n(dry-run) 未写入任何文件。\n', 'yellow');
      return;
    }

    // 6. 完成提示
    log('\n✨ Feature 脚手架创建完成！\n', 'bright');
    log('📦 生成的包：', 'yellow');
    log(`  ${colors.blue}${id}${colors.reset}`, 'reset');
    log(`  位置: ${colors.gray}${relativeDir}${colors.reset}\n`, 'reset');

    log('📝 下一步：', 'yellow');
    log(`  ${colors.gray}1.${colors.reset} cd ${relativeDir}`, 'reset');
    log(`  ${colors.gray}2.${colors.reset} 完善 src/feature.ts 中的 Feature 定义`, 'reset');
    log(`  ${colors.gray}3.${colors.reset} 编写测试用例 __tests__/feature.test.ts`, 'reset');
    log(`  ${colors.gray}4.${colors.reset} 完善 README.md 文档`, 'reset');
    log(`  ${colors.gray}5.${colors.reset} npm run build 编译 TypeScript`, 'reset');
    log(`  ${colors.gray}6.${colors.reset} npm test 运行测试`, 'reset');
    log(`  ${colors.gray}7.${colors.reset} bun run register:features 生成/更新 generated 注册表（让 examples 自动集成）\n`, 'reset');

    log('💡 提示：', 'yellow');
    log(`  • 使用 ${colors.green}FeatureRegistry.register(${toCamelCase(name)}Feature)${colors.reset} 注册 Feature`, 'reset');
    log(`  • 参考文档: ${colors.blue}docs/CREATE_FEATURE_GUIDE.md${colors.reset}`, 'reset');
    log(`  • 完整示例: ${colors.blue}docs/features.vega-lite.example.ts${colors.reset}\n`, 'reset');

  } catch (error) {
    log(`\n❌ 错误: ${error.message}\n`, 'yellow');
    process.exit(1);
  } finally {
    rl.close();
  }
}

// 运行
main();
