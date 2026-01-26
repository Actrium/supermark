#!/usr/bin/env node
/**
 * 从 Feature 的 documentation.api 字段自动生成 VitePress 文档
 * 100% real, no fake, no mock
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import featureLayout from './feature-layout.js';

const { findFeaturePackageByShortName } = featureLayout;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Feature 包列表（使用 shortName，方便通过 feature-layout 查找）
const FEATURES = [
  'core-markdown',
  'gfm',
  'math',
  'admonition',
  'definition-list',
  'emoji',
  'footnote',
];

// 确保输出目录存在
const docsDir = join(projectRoot, 'docs/features');
mkdirSync(docsDir, { recursive: true });

console.log('🚀 开始生成 Feature 文档...\n');

// 生成 Features 索引页
const indexContent = generateIndexPage();
writeFileSync(join(docsDir, 'index.md'), indexContent);
console.log('✅ 生成 features/index.md');

// 为每个 Feature 生成文档页
for (const shortName of FEATURES) {
  const pkg = findFeaturePackageByShortName(shortName);

  if (!pkg) {
    console.error(`❌ 生成失败: 未找到 Feature 包 ${shortName}`);
    continue;
  }

  const featureName = `feature-${shortName}`;
  const featurePath = join(pkg.dir, 'src/feature.ts');

  try {
    const content = readFileSync(featurePath, 'utf-8');
    const featureData = extractFeatureData(content, featureName);
    const docContent = generateFeatureDoc(featureData);

    const docName = featureName.replace('feature-', '') + '.md';
    writeFileSync(join(docsDir, docName), docContent);
    console.log(`✅ 生成 features/${docName}`);
  } catch (err) {
    console.error(`❌ 生成失败: ${featureName} - ${err.message}`);
  }
}

console.log('\n✅ Feature 文档生成完成！');

// ============================================================================
// 辅助函数
// ============================================================================

function generateIndexPage() {
  return `# Features

Supramark 采用模块化的 Feature 系统，每个 Feature 都是一个独立的功能扩展包。

## 核心 Features

### [@supramark/feature-core-markdown](./core-markdown)

标准 Markdown 语法支持，包括标题、段落、列表、代码块等基础元素。

### [@supramark/feature-gfm](./gfm)

GitHub Flavored Markdown 扩展，支持表格、任务列表、删除线等。

### [@supramark/feature-math](./math)

LaTeX 数学公式支持，包括行内公式和块级公式。

## 扩展 Features

### [@supramark/feature-admonition](./admonition)

提示框组件，支持 note、tip、warning、danger 等多种类型。

### [@supramark/feature-definition-list](./definition-list)

定义列表支持，用于术语和描述的展示。

### [@supramark/feature-emoji](./emoji)

Emoji 短代码支持，将 \`:smile:\` 转换为 😄。

### [@supramark/feature-footnote](./footnote)

脚注支持，用于添加页面底部的参考注释。

## 使用 Features

所有 Feature 都遵循统一的配置模式：

\`\`\`typescript
import { Supramark } from '@supramark/web'
import { mathFeature } from '@supramark/feature-math'
import { gfmFeature } from '@supramark/feature-gfm'

<Supramark
  markdown={markdown}
  config={{
    features: [
      mathFeature,
      gfmFeature,
      // ... 其他 Features
    ]
  }}
/>
\`\`\`

## 创建自定义 Feature

参考 [Feature 开发指南](/guide/custom-features) 了解如何创建自己的 Feature。
`;
}

function extractFeatureData(content, featureName) {
  // 提取 metadata
  const metadataMatch = content.match(/metadata:\s*\{([^}]+)\}/s);
  let metadata = {};
  if (metadataMatch) {
    const metadataStr = '{' + metadataMatch[1] + '}';
    // 简单解析（production 环境应使用 AST 解析）
    const idMatch = metadataStr.match(/id:\s*['"]([^'"]+)['"]/);
    const nameMatch = metadataStr.match(/name:\s*['"]([^'"]+)['"]/);
    const descMatch = metadataStr.match(/description:\s*['"]([^'"]+)['"]/);
    metadata = {
      id: idMatch ? idMatch[1] : featureName,
      name: nameMatch ? nameMatch[1] : featureName,
      description: descMatch ? descMatch[1] : '',
    };
  }

  // 提取 readme
  const readmeMatch = content.match(/readme:\s*`([^`]+)`/s);
  const readme = readmeMatch ? readmeMatch[1].trim() : '';

  // 提取 API 文档
  const api = extractApiData(content);

  // 提取 bestPractices
  const bestPracticesMatch = content.match(/bestPractices:\s*\[([^\]]+)\]/s);
  const bestPractices = bestPracticesMatch
    ? (bestPracticesMatch[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1))
    : [];

  // 提取 FAQ
  const faq = extractFaqData(content);

  return { metadata, readme, api, bestPractices, faq };
}

function extractApiData(content) {
  const api = { interfaces: [], functions: [], types: [] };

  // 提取 interfaces
  const interfacesMatch = content.match(/interfaces:\s*\[([^\]]+)\]/s);
  if (interfacesMatch) {
    const interfacesStr = interfacesMatch[1];
    // 简单提取（production 应使用更健壮的解析）
    const interfaceBlocks = interfacesStr.split(/\},\s*\{/).map(s => '{' + s + '}');
    for (const block of interfaceBlocks) {
      const nameMatch = block.match(/name:\s*['"]([^'"]+)['"]/);
      const descMatch = block.match(/description:\s*['"]([^'"]+)['"]/);
      if (nameMatch && descMatch) {
        api.interfaces.push({
          name: nameMatch[1],
          description: descMatch[1],
        });
      }
    }
  }

  // 提取 functions
  const functionsMatch = content.match(/functions:\s*\[([^\]]+)\]/s);
  if (functionsMatch) {
    const functionsStr = functionsMatch[1];
    const functionBlocks = functionsStr.split(/\},\s*\{/).map(s => s.includes('{') ? s : '{' + s);
    for (const block of functionBlocks) {
      const nameMatch = block.match(/name:\s*['"]([^'"]+)['"]/);
      const descMatch = block.match(/description:\s*['"]([^'"]+)['"]/);
      if (nameMatch && descMatch) {
        api.functions.push({
          name: nameMatch[1],
          description: descMatch[1],
        });
      }
    }
  }

  return api;
}

function extractFaqData(content) {
  const faq = [];
  const faqMatch = content.match(/faq:\s*\[([^\]]+)\]/s);
  if (faqMatch) {
    const faqStr = faqMatch[1];
    const faqBlocks = faqStr.split(/\},\s*\{/).map(s => s.includes('{') ? s : '{' + s);
    for (const block of faqBlocks) {
      const qMatch = block.match(/question:\s*['"]([^'"]+)['"]/);
      const aMatch = block.match(/answer:\s*['"]([^'"]+)['"]/);
      if (qMatch && aMatch) {
        faq.push({
          question: qMatch[1],
          answer: aMatch[1],
        });
      }
    }
  }
  return faq;
}

function generateFeatureDoc(data) {
  const { metadata, readme, api, bestPractices, faq } = data;

  let doc = `# ${metadata.name}\n\n`;
  doc += `> ${metadata.description}\n\n`;

  // Readme 内容
  if (readme) {
    doc += readme + '\n\n';
  }

  // API 参考
  if (api.interfaces.length > 0 || api.functions.length > 0) {
    doc += `## API 参考\n\n`;

    if (api.functions.length > 0) {
      doc += `### 函数\n\n`;
      for (const func of api.functions) {
        doc += `#### \`${func.name}\`\n\n`;
        doc += `${func.description}\n\n`;
      }
    }

    if (api.interfaces.length > 0) {
      doc += `### 接口\n\n`;
      for (const iface of api.interfaces) {
        doc += `#### \`${iface.name}\`\n\n`;
        doc += `${iface.description}\n\n`;
      }
    }
  }

  // 最佳实践
  if (bestPractices.length > 0) {
    doc += `## 最佳实践\n\n`;
    for (const practice of bestPractices) {
      doc += `- ${practice}\n`;
    }
    doc += '\n';
  }

  // FAQ
  if (faq.length > 0) {
    doc += `## 常见问题\n\n`;
    for (const item of faq) {
      doc += `### ${item.question}\n\n`;
      doc += `${item.answer}\n\n`;
    }
  }

  return doc;
}
