#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

interface ExampleInfo {
  name: string;
  title: string;
  path: string;
}

const EXAMPLES: ExampleInfo[] = [
  { name: 'react-web', title: 'React Web 示例', path: 'examples/react-web' },
  { name: 'react-web-csr', title: 'React Web CSR 示例', path: 'examples/react-web-csr' },
  { name: 'react-native', title: 'React Native 示例', path: 'examples/react-native' },
];

const docsDir = path.join(projectRoot, 'docs/examples');
fs.mkdirSync(docsDir, { recursive: true });

console.log('🚀 开始生成示例文档...\n');

function generateExampleIndex(): string {
  let doc = `# 示例项目\n\n`;
  doc += `Supramark 提供完整的示例项目，展示在不同平台上的实际使用方法。\n\n`;
  doc += `## 示例列表\n\n`;

  for (const example of EXAMPLES) {
    doc += `### [${example.title}](./${example.name})\n\n`;
    doc += `完整的可运行项目，展示 Supramark 在该平台的使用方法。\n\n`;
  }

  doc += `## 运行示例\n\n`;
  doc += `所有示例项目都可以直接克隆并运行：\n\n`;
  doc += `\`\`\`bash\n`;
  doc += `git clone https://github.com/supramark/supramark.git\n`;
  doc += `cd supramark\n`;
  doc += `bun install\n`;
  doc += `cd examples/react-web\n`;
  doc += `bun run dev\n`;
  doc += `\`\`\`\n\n`;

  doc += `## 相关资源\n\n`;
  doc += `- [快速开始](/guide/getting-started)\n`;
  doc += `- [API 参考](/api/)\n`;
  doc += `- [Features](/features/)\n`;

  return doc;
}

interface ExampleData {
  packageJson: Record<string, unknown>;
  readme: string;
  sourceFiles: Array<{ name: string; path: string; content: string }>;
}

function extractExampleData(example: ExampleInfo): ExampleData {
  const examplePath = path.join(projectRoot, example.path);

  let packageJson: Record<string, unknown> = {};
  try {
    const pkgPath = path.join(examplePath, 'package.json');
    packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    // ignore
  }

  let readme = '';
  try {
    const readmePath = path.join(examplePath, 'README.md');
    readme = fs.readFileSync(readmePath, 'utf-8');
  } catch {
    // README may not exist
  }

  const sourceFiles: Array<{ name: string; path: string; content: string }> = [];
  const srcDir = path.join(examplePath, 'src');

  try {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
          const filePath = path.join(srcDir, entry.name);
          const content = fs.readFileSync(filePath, 'utf-8');
          sourceFiles.push({ name: entry.name, path: filePath, content });
        }
      }
    }
  } catch {
    // src dir may not exist
  }

  return { packageJson, readme, sourceFiles };
}

function generateExampleDoc(data: ExampleData, example: ExampleInfo): string {
  let doc = `# ${example.title}\n\n`;

  if (data.readme) {
    const readmeLines = data.readme.split('\n');
    const contentStart = readmeLines.findIndex(line => line.trim() && !line.startsWith('#'));
    if (contentStart > 0) {
      doc += readmeLines.slice(contentStart).join('\n') + '\n\n';
    }
  } else {
    doc += `完整的 ${example.title}，展示 Supramark 的实际使用方法。\n\n`;
  }

  doc += `## 快速开始\n\n`;
  doc += `\`\`\`bash\n`;
  doc += `cd ${example.path}\n`;
  doc += `bun install\n`;
  if (data.packageJson.scripts) {
    const scripts = data.packageJson.scripts as Record<string, string>;
    if (scripts.dev || scripts.start) {
      doc += `bun run ${scripts.dev ? 'dev' : 'start'}\n`;
    }
  }
  doc += `\`\`\`\n\n`;

  const deps = data.packageJson.dependencies as Record<string, string> | undefined;
  if (deps) {
    const supramarkDeps = Object.keys(deps).filter(dep => dep.startsWith('@supramark/'));
    if (supramarkDeps.length > 0) {
      doc += `## Supramark 依赖\n\n`;
      for (const dep of supramarkDeps) {
        const version = deps[dep];
        doc += `- \`${dep}\` - ${version}\n`;
      }
      doc += `\n`;
    }
  }

  if (data.sourceFiles.length > 0) {
    doc += `## 源代码\n\n`;

    const mainFiles = data.sourceFiles
      .filter(f => ['index', 'App', 'main'].some(name => f.name.includes(name)))
      .slice(0, 2);

    for (const file of mainFiles) {
      doc += `### ${file.name}\n\n`;
      const snippet = extractCodeSnippet(file.content);
      const ext = path.extname(file.name).slice(1);
      doc += `\`\`\`${ext}\n`;
      doc += snippet;
      doc += `\n\`\`\`\n\n`;
    }
  }

  doc += `## 项目结构\n\n`;
  doc += `\`\`\`\n`;
  doc += `${example.path}/\n`;
  doc += `├── src/\n`;
  doc += `├── public/\n`;
  doc += `├── package.json\n`;
  doc += `└── README.md\n`;
  doc += `\`\`\`\n\n`;

  doc += `## 相关资源\n\n`;
  doc += `- [快速开始](/guide/getting-started)\n`;
  doc += `- [API 参考](/api/)\n`;
  doc += `- [其他示例](/examples/)\n\n`;
  doc += `---\n*此文档由 scripts/doc-gen-example.ts 自动生成*\n`;

  return doc;
}

function extractCodeSnippet(content: string): string {
  const lines = content.split('\n');
  const codeLines: string[] = [];
  let skipImports = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (skipImports && (trimmed.startsWith('import ') || trimmed.startsWith('//'))) {
      continue;
    }
    if (trimmed && !trimmed.startsWith('import ')) {
      skipImports = false;
    }
    if (!skipImports && !trimmed.startsWith('//')) {
      codeLines.push(line);
    }
  }

  return codeLines.slice(0, 50).join('\n');
}

generateExampleIndex();
fs.writeFileSync(path.join(docsDir, 'index.md'), generateExampleIndex());
console.log('✅ 生成 examples/index.md');

for (const example of EXAMPLES) {
  console.log(`📱 处理示例: ${example.title}`);

  try {
    const exampleData = extractExampleData(example);
    const docContent = generateExampleDoc(exampleData, example);
    const outputPath = path.join(docsDir, `${example.name}.md`);
    fs.writeFileSync(outputPath, docContent);
    console.log(`  ✅ 生成 examples/${example.name}.md`);
  } catch (err) {
    console.error(`  ❌ 失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log('\n✅ 示例文档生成完成！');
