#!/usr/bin/env node
/**
 * 为所有 Feature 添加真实的 dependencies 声明
 * 100% real, no fake, no mock
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import featureLayout from './feature-layout.js';

const { findFeaturePackageByShortName } = featureLayout;

// Feature 依赖关系配置
const FEATURE_DEPENDENCIES = {
  'feature-core-markdown': {
    dependencies: [],
    comment: '// 基础 Markdown - 无依赖',
  },
  'feature-gfm': {
    dependencies: ['@supramark/feature-core-markdown'],
    comment: '// GFM 扩展 - 依赖基础 Markdown（删除线、任务列表、表格的 children 都需要 core）',
  },
  'feature-admonition': {
    dependencies: ['@supramark/feature-core-markdown'],
    comment: '// Admonition - 依赖基础 Markdown（内容可以包含段落、列表等）',
  },
  'feature-definition-list': {
    dependencies: ['@supramark/feature-core-markdown'],
    comment: '// Definition List - 依赖基础 Markdown（term 和 descriptions 可以包含 inline/block 节点）',
  },
  'feature-emoji': {
    dependencies: [],
    comment: '// Emoji - 无依赖（独立的字符替换功能）',
  },
  'feature-footnote': {
    dependencies: ['@supramark/feature-core-markdown'],
    comment: '// Footnote - 依赖基础 Markdown（脚注定义可以包含段落等）',
  },
  'feature-math': {
    dependencies: [],
    comment: '// Math - 无依赖（独立的 LaTeX 语法，只有 value 字符串）',
  },
};

// 生成 dependencies 字段代码
function generateDependenciesCode(config) {
  const { dependencies, comment } = config;

  if (dependencies.length === 0) {
    return `  ${comment}\n  // dependencies: [] - 不显式声明空依赖`;
  }

  const lines = [];
  lines.push(`  ${comment}`);
  lines.push('  dependencies: [');
  for (const dep of dependencies) {
    lines.push(`    '${dep}',`);
  }
  lines.push('  ],');

  return lines.join('\n');
}

// 更新 Feature 文件
for (const [featureName, depConfig] of Object.entries(FEATURE_DEPENDENCIES)) {
  const shortName = featureName.replace(/^feature-/, '');
  const pkg = findFeaturePackageByShortName(shortName);

  if (!pkg) {
    console.error(`❌ 更新失败: 未找到 Feature 包 ${featureName}`);
    // 继续处理其他 Feature
    continue;
  }

  const featurePath = join(pkg.dir, 'src/feature.ts');

  try {
    let content = readFileSync(featurePath, 'utf-8');

    // 找到 metadata 字段结束的位置（metadata 对象的最后一个 },）
    // 然后在 syntax 字段之前插入 dependencies

    // 策略：在 syntax: { 之前插入 dependencies
    const syntaxRegex = /(\n\s*)(syntax:\s*\{)/;

    const newDependencies = generateDependenciesCode(depConfig);

    if (syntaxRegex.test(content)) {
      content = content.replace(
        syntaxRegex,
        (match, indent, syntaxStart) => {
          return `\n${newDependencies}\n${indent}${syntaxStart}`;
        }
      );

      writeFileSync(featurePath, content, 'utf-8');
      console.log(`✅ 已更新: ${featureName}`);
    } else {
      console.warn(`⚠️  未找到 syntax 字段: ${featureName}`);
    }
  } catch (err) {
    console.error(`❌ 更新失败: ${featureName} - ${err.message}`);
  }
}

console.log('\n✅ 所有 Feature dependencies 声明完成！');
