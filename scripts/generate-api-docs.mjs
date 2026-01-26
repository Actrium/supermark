#!/usr/bin/env node
/**
 * 从源代码的 JSDoc 和类型定义自动生成 API 文档
 * 100% real, no fake, no mock
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 包列表
const PACKAGES = [
  { name: 'core', path: 'packages/core' },
  { name: 'web', path: 'packages/web' },
  { name: 'rn', path: 'packages/rn' },
];

// 确保输出目录存在
const docsDir = join(projectRoot, 'docs/api');
mkdirSync(docsDir, { recursive: true });

console.log('🚀 开始生成 API 文档...\n');

for (const pkg of PACKAGES) {
  console.log(`📦 处理包: @supramark/${pkg.name}`);

  try {
    // 读取包的主入口文件
    const indexPath = join(projectRoot, pkg.path, 'src/index.ts');
    const content = readFileSync(indexPath, 'utf-8');

    // 提取 JSDoc 注释和导出
    const apiData = extractAPIData(content, pkg);

    // 生成文档
    const docContent = generateAPIDoc(apiData, pkg);

    // 写入文件
    const outputPath = join(docsDir, `${pkg.name}.md`);
    writeFileSync(outputPath, docContent);
    console.log(`  ✅ 生成 api/${pkg.name}.md`);
  } catch (err) {
    console.error(`  ❌ 失败: ${err.message}`);
  }
}

console.log('\n✅ API 文档生成完成！');

// ============================================================================
// 辅助函数
// ============================================================================

function extractAPIData(content, pkg) {
  const exports = [];

  // 提取所有导出的函数和类型
  const exportRegex = /export\s+(?:type\s+)?(?:\{[^}]+\}|[\w]+)(?:\s+from\s+['"][^'"]+['"])?/g;
  const matches = content.matchAll(exportRegex);

  for (const match of matches) {
    exports.push(match[0]);
  }

  // 提取 JSDoc 注释块
  const jsdocBlocks = extractJSDocBlocks(content);

  return {
    packageName: `@supramark/${pkg.name}`,
    exports,
    jsdocBlocks,
    rawContent: content
  };
}

function extractJSDocBlocks(content) {
  const blocks = [];
  const jsdocRegex = /\/\*\*\s*\n([\s\S]*?)\*\/\s*\n\s*export\s+([\s\S]*?)(?=\n\/\*\*|\nexport|$)/g;

  let match;
  while ((match = jsdocRegex.exec(content)) !== null) {
    const [fullMatch, comment, declaration] = match;

    // 解析 JSDoc 注释
    const lines = comment.split('\n').map(line =>
      line.replace(/^\s*\*\s?/, '').trim()
    ).filter(Boolean);

    // 提取主要描述
    const description = [];
    const tags = {};

    for (const line of lines) {
      if (line.startsWith('@')) {
        const [tag, ...value] = line.split(/\s+/);
        const tagName = tag.slice(1);
        if (!tags[tagName]) tags[tagName] = [];
        tags[tagName].push(value.join(' '));
      } else {
        description.push(line);
      }
    }

    blocks.push({
      description: description.join(' '),
      tags,
      declaration: declaration.trim()
    });
  }

  return blocks;
}

function generateAPIDoc(data, pkg) {
  let doc = `# ${data.packageName}\n\n`;

  // 包描述（从第一个 JSDoc 块获取）
  if (data.jsdocBlocks.length > 0) {
    const firstBlock = data.jsdocBlocks[0];
    if (firstBlock.description) {
      doc += `${firstBlock.description}\n\n`;
    }
  }

  // 安装说明
  doc += `## 安装\n\n`;
  doc += `\`\`\`bash\n`;
  if (pkg.name === 'core') {
    doc += `npm install @supramark/core\n`;
  } else {
    doc += `bun add @supramark/core @supramark/${pkg.name}\n`;
  }
  doc += `\`\`\`\n\n`;

  // 主要导出
  doc += `## 主要导出\n\n`;
  doc += `> **注意**: 完整的类型定义请查看 [TypeDoc API 文档](/typedoc/)\n\n`;

  // 列出所有 JSDoc 块
  for (const block of data.jsdocBlocks) {
    if (!block.declaration) continue;

    // 提取函数/类名
    const nameMatch = block.declaration.match(/(?:function|class|const|type|interface)\s+(\w+)/);
    const name = nameMatch ? nameMatch[1] : 'Unknown';

    doc += `### \`${name}\`\n\n`;

    if (block.description) {
      doc += `${block.description}\n\n`;
    }

    // 参数
    if (block.tags.param) {
      doc += `**参数：**\n`;
      for (const param of block.tags.param) {
        doc += `- ${param}\n`;
      }
      doc += `\n`;
    }

    // 返回值
    if (block.tags.returns) {
      doc += `**返回：**\n`;
      for (const ret of block.tags.returns) {
        doc += `- ${ret}\n`;
      }
      doc += `\n`;
    }

    // 示例
    if (block.tags.example) {
      doc += `**示例：**\n\n`;
      for (const example of block.tags.example) {
        doc += `${example}\n\n`;
      }
    }
  }

  // 相关资源
  doc += `## 相关资源\n\n`;
  doc += `- [TypeDoc API 文档](/typedoc/) - 完整类型定义\n`;
  doc += `- [Features 文档](/features/) - 查看所有 Features\n`;
  doc += `- [快速开始](/guide/getting-started) - 使用指南\n`;

  // 添加自动生成标记
  doc += `\n---\n\n`;
  doc += `*此文档由 \`scripts/generate-api-docs.mjs\` 自动生成*\n`;

  return doc;
}
