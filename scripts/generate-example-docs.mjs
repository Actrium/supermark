#!/usr/bin/env node
/**
 * 从示例项目自动生成示例文档
 * 从 examples/ 目录提取实际可运行的代码示例
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 示例项目列表
const EXAMPLES = [
  { name: 'react-web', title: 'React Web 示例', path: 'examples/react-web' },
  { name: 'react-web-csr', title: 'React Web CSR 示例', path: 'examples/react-web-csr' },
  { name: 'react-native', title: 'React Native 示例', path: 'examples/react-native' },
];

// 确保输出目录存在
const docsDir = join(projectRoot, 'docs/examples');
mkdirSync(docsDir, { recursive: true });

console.log('🚀 开始生成示例文档...\n');

// 生成示例索引页
generateExampleIndex();

// 为每个示例项目生成文档
for (const example of EXAMPLES) {
  console.log(`📱 处理示例: ${example.title}`);

  try {
    const exampleData = extractExampleData(example);
    const docContent = generateExampleDoc(exampleData, example);

    const outputPath = join(docsDir, `${example.name}.md`);
    writeFileSync(outputPath, docContent);
    console.log(`  ✅ 生成 examples/${example.name}.md`);
  } catch (err) {
    console.error(`  ❌ 失败: ${err.message}`);
  }
}

console.log('\n✅ 示例文档生成完成！');

// ============================================================================
// 辅助函数
// ============================================================================

function generateExampleIndex() {
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
  doc += `# 克隆仓库\n`;
  doc += `git clone https://github.com/supramark/supramark.git\n`;
  doc += `cd supramark\n\n`;
  doc += `# 安装依赖\n`;
  doc += `npm install\n\n`;
  doc += `# 运行示例（以 React Web 为例）\n`;
  doc += `cd examples/react-web\n`;
  doc += `bun run dev\n`;
  doc += `\`\`\`\n\n`;

  doc += `## 相关资源\n\n`;
  doc += `- [快速开始](/guide/getting-started) - 基础使用教程\n`;
  doc += `- [API 参考](/api/) - 完整 API 文档\n`;
  doc += `- [Features](/features/) - 所有可用功能\n`;

  writeFileSync(join(docsDir, 'index.md'), doc);
  console.log(`✅ 生成 examples/index.md`);
}

function extractExampleData(example) {
  const examplePath = join(projectRoot, example.path);

  // 读取 package.json
  let packageJson = {};
  try {
    const pkgPath = join(examplePath, 'package.json');
    packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch (err) {
    console.warn(`  ⚠️  无法读取 package.json: ${err.message}`);
  }

  // 读取 README.md
  let readme = '';
  try {
    const readmePath = join(examplePath, 'README.md');
    readme = readFileSync(readmePath, 'utf-8');
  } catch (err) {
    // README 可能不存在
  }

  // 查找主要源文件
  const sourceFiles = findSourceFiles(examplePath);

  return {
    packageJson,
    readme,
    sourceFiles
  };
}

function findSourceFiles(dir) {
  const files = [];
  const srcDir = join(dir, 'src');

  try {
    const entries = readdirSync(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = extname(entry.name);
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
          const filePath = join(srcDir, entry.name);
          const content = readFileSync(filePath, 'utf-8');

          files.push({
            name: entry.name,
            path: filePath,
            content
          });
        }
      }
    }
  } catch (err) {
    // src 目录可能不存在
  }

  return files;
}

function generateExampleDoc(data, example) {
  let doc = `# ${example.title}\n\n`;

  // 如果有 README，使用其内容
  if (data.readme) {
    // 跳过 README 的标题（第一行）
    const readmeLines = data.readme.split('\n');
    const contentStart = readmeLines.findIndex(line => line.trim() && !line.startsWith('#'));
    if (contentStart > 0) {
      doc += readmeLines.slice(contentStart).join('\n') + '\n\n';
    }
  } else {
    doc += `完整的 ${example.title}，展示 Supramark 的实际使用方法。\n\n`;
  }

  // 安装和运行
  doc += `## 快速开始\n\n`;
  doc += `\`\`\`bash\n`;
  doc += `cd ${example.path}\n`;
  doc += `npm install\n`;

  if (data.packageJson.scripts) {
    const devScript = data.packageJson.scripts.dev || data.packageJson.scripts.start;
    if (devScript) {
      doc += `npm run ${data.packageJson.scripts.dev ? 'dev' : 'start'}\n`;
    }
  }

  doc += `\`\`\`\n\n`;

  // 依赖
  if (data.packageJson.dependencies) {
    const supramarkDeps = Object.keys(data.packageJson.dependencies).filter(dep =>
      dep.startsWith('@supramark/')
    );

    if (supramarkDeps.length > 0) {
      doc += `## Supramark 依赖\n\n`;
      for (const dep of supramarkDeps) {
        const version = data.packageJson.dependencies[dep];
        doc += `- \`${dep}\` - ${version}\n`;
      }
      doc += `\n`;
    }
  }

  // 源代码示例
  if (data.sourceFiles.length > 0) {
    doc += `## 源代码\n\n`;

    // 只展示主要文件
    const mainFiles = data.sourceFiles.filter(f =>
      ['index', 'App', 'main'].some(name => f.name.includes(name))
    ).slice(0, 2);

    for (const file of mainFiles) {
      doc += `### ${file.name}\n\n`;

      // 提取代码的关键部分
      const snippet = extractCodeSnippet(file.content);
      const ext = extname(file.name).slice(1);

      doc += `\`\`\`${ext}\n`;
      doc += snippet;
      doc += `\n\`\`\`\n\n`;
    }
  }

  // 项目结构
  doc += `## 项目结构\n\n`;
  doc += `\`\`\`\n`;
  doc += `${example.path}/\n`;
  doc += `├── src/           # 源代码\n`;
  doc += `├── public/        # 静态资源\n`;
  doc += `├── package.json   # 依赖配置\n`;
  doc += `└── README.md      # 项目说明\n`;
  doc += `\`\`\`\n\n`;

  // 相关资源
  doc += `## 相关资源\n\n`;
  doc += `- [快速开始](/guide/getting-started)\n`;
  doc += `- [API 参考](/api/)\n`;
  doc += `- [其他示例](/examples/)\n`;

  // 添加自动生成标记
  doc += `\n---\n\n`;
  doc += `*此文档由 \`scripts/generate-example-docs.mjs\` 自动生成*\n`;

  return doc;
}

function extractCodeSnippet(content) {
  // 提取关键代码片段（去掉 import 和注释）
  const lines = content.split('\n');
  const codeLines = [];
  let skipImports = true;

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过 import 语句
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

  // 限制长度
  return codeLines.slice(0, 50).join('\n');
}
