#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

interface PackageInfo {
  name: string;
  path: string;
}

const PACKAGES: PackageInfo[] = [
  { name: 'core', path: 'packages/core' },
  { name: 'web', path: 'packages/renderers/web' },
  { name: 'rn', path: 'packages/renderers/rn' },
];

const docsDir = path.join(projectRoot, 'docs/api');
fs.mkdirSync(docsDir, { recursive: true });

console.log('🚀 开始生成 API 文档...\n');

interface JSDocBlock {
  description: string;
  tags: Record<string, string[]>;
  declaration: string;
}

function extractJSDocBlocks(content: string): JSDocBlock[] {
  const blocks: JSDocBlock[] = [];
  const jsdocRegex = /\/\*\*\s*\n([\s\S]*?)\*\/\s*\n\s*export\s+([\s\S]*?)(?=\n\/\*\*|\nexport|$)/g;

  let match;
  while ((match = jsdocRegex.exec(content)) !== null) {
    const [, comment, declaration] = match;

    const lines = comment
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean);

    const description: string[] = [];
    const tags: Record<string, string[]> = {};

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
      declaration: declaration.trim(),
    });
  }

  return blocks;
}

function generateAPIDoc(content: string, pkg: PackageInfo): string {
  let doc = `# @supramark/${pkg.name}\n\n`;
  const jsdocBlocks = extractJSDocBlocks(content);

  if (jsdocBlocks.length > 0 && jsdocBlocks[0].description) {
    doc += `${jsdocBlocks[0].description}\n\n`;
  }

  doc += `## 安装\n\n`;
  doc += `\`\`\`bash\n`;
  doc += `bun add @supramark/core @supramark/${pkg.name}\n`;
  doc += `\`\`\`\n\n`;

  doc += `## 主要导出\n\n`;
  doc += `> **注意**: 完整的类型定义请查看 [TypeDoc API 文档](/typedoc/)\n\n`;

  for (const block of jsdocBlocks) {
    if (!block.declaration) continue;

    const nameMatch = block.declaration.match(/(?:function|class|const|type|interface)\s+(\w+)/);
    const name = nameMatch ? nameMatch[1] : 'Unknown';

    doc += `### \`${name}\`\n\n`;

    if (block.description) {
      doc += `${block.description}\n\n`;
    }

    if (block.tags.param) {
      doc += `**参数：**\n`;
      for (const param of block.tags.param) {
        doc += `- ${param}\n`;
      }
      doc += `\n`;
    }

    if (block.tags.returns) {
      doc += `**返回：**\n`;
      for (const ret of block.tags.returns) {
        doc += `- ${ret}\n`;
      }
      doc += `\n`;
    }
  }

  doc += `## 相关资源\n\n`;
  doc += `- [TypeDoc API 文档](/typedoc/)\n`;
  doc += `- [Features 文档](/features/)\n`;
  doc += `- [快速开始](/guide/getting-started)\n\n`;
  doc += `---\n*此文档由 scripts/doc-gen-api.ts 自动生成*\n`;

  return doc;
}

for (const pkg of PACKAGES) {
  console.log(`📦 处理包: @supramark/${pkg.name}`);

  try {
    const indexPath = path.join(projectRoot, pkg.path, 'src/index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const docContent = generateAPIDoc(content, pkg);
    const outputPath = path.join(docsDir, `${pkg.name}.md`);
    fs.writeFileSync(outputPath, docContent);
    console.log(`  ✅ 生成 api/${pkg.name}.md`);
  } catch (err) {
    console.error(`  ❌ 失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log('\n✅ API 文档生成完成！');
