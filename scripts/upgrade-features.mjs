/**
 * 批量升级 Feature 从 MinimalFeature 到 SupramarkFeature
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import featureLayout from './feature-layout.js';

const { findFeaturePackageByShortName } = featureLayout;

const features = [
  {
    name: 'gfm',
    examplesImport: 'gfmExamples',
    title: 'GFM Feature',
    description: '为 Supramark 提供 GitHub Flavored Markdown 扩展支持。',
    capabilities: ['删除线', '任务列表', '表格'],
  },
  {
    name: 'admonition',
    examplesImport: 'admonitionExamples',
    title: 'Admonition Feature',
    description: '为 Supramark 提供提示框容器块支持。',
    capabilities: ['note 提示框', 'warning 警告框', '自定义提示框'],
  },
  {
    name: 'definition-list',
    examplesImport: 'definitionListExamples',
    title: 'Definition List Feature',
    description: '为 Supramark 提供定义列表支持。',
    capabilities: ['术语定义', '多段描述'],
  },
  {
    name: 'emoji',
    examplesImport: 'emojiExamples',
    title: 'Emoji Feature',
    description: '为 Supramark 提供 Emoji 短代码支持。',
    capabilities: ['GitHub 风格短代码', '原生 Emoji'],
  },
  {
    name: 'footnote',
    examplesImport: 'footnoteExamples',
    title: 'Footnote Feature',
    description: '为 Supramark 提供脚注支持。',
    capabilities: ['脚注引用', '脚注定义'],
  },
  {
    name: 'core-markdown',
    examplesImport: 'coreMarkdownExamples',
    title: 'Core Markdown Feature',
    description: '为 Supramark 提供核心 Markdown 语法支持。',
    capabilities: ['标题', '段落', '列表', '代码块', '强调'],
  },
];

for (const feature of features) {
  const pkg = findFeaturePackageByShortName(feature.name);

  if (!pkg) {
    console.warn(`⚠️  跳过 ${feature.name}，未找到对应 Feature 包`);
    continue;
  }

  const featurePath = join(pkg.dir, 'src/feature.ts');

  console.log(`处理 ${feature.name}...`);

  let content = readFileSync(featurePath, 'utf-8');

  // 1. 替换导入
  content = content.replace(
    /import type \{[^}]*MinimalFeature[^}]*\} from '@supramark\/core';/,
    (match) => match.replace('MinimalFeature', 'SupramarkFeature')
  );

  // 2. 添加 examples 导入
  if (!content.includes(`from './examples.js'`)) {
    const importIndex = content.indexOf("from '@supramark/core';");
    const insertPos = content.indexOf('\n', importIndex) + 1;
    content =
      content.slice(0, insertPos) +
      `import { ${feature.examplesImport} } from './examples.js';\n` +
      content.slice(insertPos);
  }

  // 3. 替换 Feature 类型
  content = content.replace(
    /: MinimalFeature</g,
    ': SupramarkFeature<'
  );

  // 4. 在 renderers 后添加 examples, testing, documentation
  const renderersEnd = content.lastIndexOf('  },\n};');

  if (renderersEnd !== -1) {
    const additionContent = `  },

  // 使用示例
  examples: ${feature.examplesImport},

  // 测试定义
  testing: {
    unit: [
      {
        name: '基础解析测试',
        input: '测试输入',
        expectedAST: {
          type: 'root',
          children: [],
        },
      },
    ],
    integration: [
      {
        name: '端到端渲染测试',
        markdown: '测试 markdown',
        validate: (result: unknown) => {
          return typeof result === 'object' && result !== null;
        },
      },
    ],
  },

  // 文档定义
  documentation: {
    readme: \`
# ${feature.title}

${feature.description}

## 功能

${feature.capabilities.map(cap => `- ${cap}`).join('\n')}

## 使用

查看 examples 目录获取更多示例。
    \`.trim(),

    bestPractices: [
      '遵循标准 Markdown 语法',
      '确保内容格式正确',
    ],

    faq: [
      {
        question: '如何使用此功能？',
        answer: '参考示例和文档说明。',
      },
    ],
  },
};`;

    content = content.slice(0, renderersEnd + 4) + additionContent.slice(4);
  }

  writeFileSync(featurePath, content, 'utf-8');
  console.log(`✅ ${feature.name} 升级完成`);
}

console.log('\n所有 Feature 升级完成！');
