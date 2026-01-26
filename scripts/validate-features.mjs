#!/usr/bin/env node
/**
 * Feature 验证和质量检查工具（增强版）
 *
 * 验证所有 Feature 是否符合 SupramarkFeature 接口规范
 * 100% real, no fake, no mock - 检查内容质量而不仅仅是字段存在性
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import featureLayout from './feature-layout.js';

const { discoverFeaturePackages } = featureLayout;

const REQUIRED_FIELDS = ['metadata', 'syntax', 'renderers', 'examples', 'testing', 'documentation'];
const REQUIRED_METADATA = ['id', 'name', 'version', 'author', 'description', 'license'];

// Feature 依赖关系配置（用于验证依赖声明的正确性）
const EXPECTED_DEPENDENCIES = {
  'feature-core-markdown': [],
  'feature-gfm': ['@supramark/feature-core-markdown'],
  'feature-admonition': ['@supramark/feature-core-markdown'],
  'feature-definition-list': ['@supramark/feature-core-markdown'],
  'feature-emoji': [],
  'feature-footnote': ['@supramark/feature-core-markdown'],
  'feature-math': [],
  // 图表类 Feature：允许在 renderers 中声明外部依赖
  // 这里的 "依赖" 仅用于文档提示，不强制是 Feature ID
  'feature-diagram-vega-lite': ['vega-lite'],
  'feature-diagram-echarts': ['echarts'],
  'feature-diagram-plantuml': ['plantuml'],
  'feature-diagram-dot': ['dot'],
};

let totalErrors = 0;
let totalWarnings = 0;
let qualityIssues = 0;

console.log('🔍 开始验证 Feature 规范...\n');

// 查找所有 Feature 包（排除特殊包）
const EXCLUDED_SHORT_NAMES = ['html-page']; // 特殊包，不是标准 Feature
const featurePackages = discoverFeaturePackages().filter(
  (pkg) => !EXCLUDED_SHORT_NAMES.includes(pkg.shortName)
);

for (const pkg of featurePackages) {
  const pkgDir = pkg.dir;
  const featureName = `feature-${pkg.shortName}`;

  console.log(`\n📦 检查 ${featureName}...`);

  // 检查 feature.ts 文件
  const featureFile = join(pkgDir, 'src/feature.ts');
  let featureContent = ''; // 保存 feature.ts 的内容，供后续检查使用

  try {
    featureContent = readFileSync(featureFile, 'utf-8');
    const content = featureContent; // 为了兼容现有代码

    // ==================== 基础检查 ====================

    // 检查是否使用 SupramarkFeature
    if (!content.includes('SupramarkFeature')) {
      console.error(`  ❌ 错误: 未使用 SupramarkFeature 接口`);
      totalErrors++;
    } else {
      console.log(`  ✅ 使用 SupramarkFeature 接口`);
    }

    // 检查必需字段
    for (const field of REQUIRED_FIELDS) {
      const hasField = new RegExp(`\\b${field}\\s*:`).test(content);
      if (!hasField) {
        console.error(`  ❌ 错误: 缺少必需字段 '${field}'`);
        totalErrors++;
      }
    }

    // ==================== Renderers 质量检查 ====================
    console.log(`\n  📐 Renderers 质量检查:`);

    // 检查 renderers 是否为空或仅有 TODO
    if (content.includes('renderers: {}') || content.includes('renderers: { }')) {
      console.error(`    ❌ 质量问题: renderers 为空对象`);
      qualityIssues++;
    } else if (content.includes('renderers: { // TODO')) {
      console.error(`    ❌ 质量问题: renderers 仅有 TODO 注释`);
      qualityIssues++;
    } else {
      console.log(`    ✅ renderers 有实际内容`);
    }

    // 检查是否有 infrastructure 声明
    if (content.includes('infrastructure:')) {
      console.log(`    ✅ 声明了 infrastructure 需求`);
    } else {
      console.warn(`    ⚠️  警告: 缺少 infrastructure 声明`);
      totalWarnings++;
    }

    // 检查 Web 和 RN 平台（使用更准确的模式）
    const hasWebRenderer = /renderers:\s*\{[\s\S]*?web:\s*\{/.test(content);
    const hasRnRenderer = /renderers:\s*\{[\s\S]*?rn:\s*\{/.test(content);

    if (hasWebRenderer) {
      console.log(`    ✅ 包含 Web 平台渲染器`);
    } else {
      console.error(`    ❌ 错误: 缺少 Web 平台渲染器`);
      totalErrors++;
    }

    if (hasRnRenderer) {
      console.log(`    ✅ 包含 RN 平台渲染器`);
    } else {
      console.error(`    ❌ 错误: 缺少 RN 平台渲染器`);
      totalErrors++;
    }

    // ==================== Testing 质量检查 ====================
    console.log(`\n  🧪 Testing 质量检查:`);

    // 检查 syntaxTests
    if (content.includes('syntaxTests:')) {
      // 检查是否有真实测试用例（而不是空的或占位的）
      const syntaxTestsMatch = content.match(/syntaxTests:\s*\{[\s\S]*?cases:\s*\[([\s\S]*?)\]/);
      if (syntaxTestsMatch) {
        const casesContent = syntaxTestsMatch[1];
        if (casesContent.includes('input:') && casesContent.includes('expected:')) {
          console.log(`    ✅ syntaxTests 包含真实测试用例`);
        } else {
          console.error(`    ❌ 质量问题: syntaxTests 测试用例不完整`);
          qualityIssues++;
        }
      } else {
        console.error(`    ❌ 质量问题: syntaxTests 为空`);
        qualityIssues++;
      }
    } else {
      console.warn(`    ⚠️  警告: 缺少 syntaxTests`);
      totalWarnings++;
    }

    // 检查 renderTests
    if (content.includes('renderTests:')) {
      const hasWebTests = content.includes('renderTests:') && content.includes('web:');
      const hasRnTests = content.includes('renderTests:') && content.includes('rn:');

      if (hasWebTests && hasRnTests) {
        console.log(`    ✅ renderTests 包含 Web 和 RN 测试`);
      } else {
        console.warn(`    ⚠️  警告: renderTests 缺少平台测试 (Web: ${hasWebTests}, RN: ${hasRnTests})`);
        totalWarnings++;
      }
    } else {
      console.warn(`    ⚠️  警告: 缺少 renderTests`);
      totalWarnings++;
    }

    // 检查 integrationTests
    if (content.includes('integrationTests:')) {
      const hasValidate = content.includes('validate:');
      if (hasValidate) {
        console.log(`    ✅ integrationTests 包含验证逻辑`);
      } else {
        console.error(`    ❌ 质量问题: integrationTests 缺少验证逻辑`);
        qualityIssues++;
      }
    } else {
      console.warn(`    ⚠️  警告: 缺少 integrationTests`);
      totalWarnings++;
    }

    // 检查 coverageRequirements
    if (content.includes('coverageRequirements:')) {
      console.log(`    ✅ 设置了 coverageRequirements`);
    } else {
      console.error(`    ❌ 质量问题: 缺少 coverageRequirements`);
      qualityIssues++;
    }

    // ==================== Documentation 质量检查 ====================
    console.log(`\n  📚 Documentation 质量检查:`);

    // 检查 readme
    if (content.includes('readme:')) {
      // 检查是否为空或仅有 TODO
      if (content.includes("readme: ''") || content.includes('readme: ""') || content.includes('readme: `TODO')) {
        console.error(`    ❌ 质量问题: readme 为空或仅有 TODO`);
        qualityIssues++;
      } else {
        console.log(`    ✅ readme 有实际内容`);
      }
    } else {
      console.warn(`    ⚠️  警告: 缺少 readme`);
      totalWarnings++;
    }

    // 检查 api 字段
    if (content.includes('api:')) {
      const hasInterfaces = content.includes('interfaces:');
      const hasFunctions = content.includes('functions:');
      const hasTypes = content.includes('types:');

      if (hasInterfaces || hasFunctions || hasTypes) {
        console.log(`    ✅ api 包含文档 (interfaces: ${hasInterfaces}, functions: ${hasFunctions}, types: ${hasTypes})`);
      } else {
        console.error(`    ❌ 质量问题: api 字段为空`);
        qualityIssues++;
      }
    } else {
      console.error(`    ❌ 质量问题: 缺少 api 字段`);
      qualityIssues++;
    }

    // 检查 bestPractices
    if (content.includes('bestPractices:')) {
      if (content.includes('bestPractices: []')) {
        console.warn(`    ⚠️  警告: bestPractices 为空`);
        totalWarnings++;
      } else {
        console.log(`    ✅ 包含 bestPractices`);
      }
    }

    // 检查 faq
    if (content.includes('faq:')) {
      if (content.includes('faq: []')) {
        console.warn(`    ⚠️  警告: faq 为空`);
        totalWarnings++;
      } else {
        console.log(`    ✅ 包含 faq`);
      }
    }

    // ==================== Dependencies 检查 ====================
    console.log(`\n  🔗 Dependencies 检查:`);

    const expectedDeps = EXPECTED_DEPENDENCIES[featureName] || [];
    if (expectedDeps.length === 0) {
      // 无依赖的 Feature
      if (content.includes('dependencies: [') && !content.includes('// dependencies: []')) {
        console.error(`    ❌ 错误: ${featureName} 不应该有依赖`);
        totalErrors++;
      } else {
        console.log(`    ✅ 正确声明无依赖`);
      }
    } else {
      // 有依赖的 Feature
      let allDepsFound = true;
      for (const dep of expectedDeps) {
        if (content.includes(`'${dep}'`)) {
          console.log(`    ✅ 正确声明依赖: ${dep}`);
        } else {
          console.error(`    ❌ 错误: 缺少依赖声明: ${dep}`);
          totalErrors++;
          allDepsFound = false;
        }
      }
    }

    // 检查 examples 导入
    if (!content.includes('from \'./examples')) {
      console.warn(`  ⚠️  警告: 未导入 examples`);
      totalWarnings++;
    } else {
      console.log(`  ✅ 导入了 examples`);
    }

  } catch (err) {
    console.error(`  ❌ 错误: 无法读取 feature.ts - ${err.message}`);
    totalErrors++;
    continue;
  }

  // ==================== Examples 文件检查 ====================
  console.log(`\n  📝 Examples 文件检查:`);

  const examplesFile = join(pkgDir, 'src/examples.ts');
  try {
    const examplesContent = readFileSync(examplesFile, 'utf-8');
    console.log(`  ✅ 存在 examples.ts`);

    // 检查是否有真实示例
    if (examplesContent.includes('markdown:') && examplesContent.includes('description:')) {
      console.log(`  ✅ 包含真实示例（有 markdown 和 description）`);
    } else {
      console.error(`  ❌ 质量问题: 示例不完整`);
      qualityIssues++;
    }
  } catch {
    console.error(`  ❌ 错误: 缺少 examples.ts 文件`);
    totalErrors++;
  }

  // ==================== Index 文件检查 ====================
  console.log(`\n  📦 Index 文件检查:`);

  const indexFile = join(pkgDir, 'src/index.ts');
  try {
    const indexContent = readFileSync(indexFile, 'utf-8');

    // 移除 'feature-' 前缀，然后转换为驼峰命名
    const baseName = featureName.replace('feature-', '');
    const featureVar = baseName.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + 'Feature';
    const examplesVar = baseName.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + 'Examples';

    // 检查 Feature 导出
    if (indexContent.includes(featureVar)) {
      console.log(`  ✅ 导出 ${featureVar}`);
    } else {
      console.error(`  ❌ 错误: 未导出 ${featureVar}`);
      totalErrors++;
    }

    // 检查 Examples 导出
    if (indexContent.includes(examplesVar)) {
      console.log(`  ✅ 导出 ${examplesVar}`);
    } else {
      console.error(`  ❌ 错误: 未导出 ${examplesVar}`);
      totalErrors++;
    }

    // 检查类型导出（增强）
    if (indexContent.includes('export type')) {
      console.log(`  ✅ 导出了类型定义`);

      // 检查是否导出了 Options 接口（仅当 feature.ts 中定义了 Options 时才检查）
      const optionsType = baseName.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^(.)/, (c) => c.toUpperCase()) + 'FeatureOptions';
      const hasOptionsDefinition = featureContent.includes(`interface ${optionsType}`) || featureContent.includes(`export interface ${optionsType}`);

      if (hasOptionsDefinition) {
        if (indexContent.includes(optionsType)) {
          console.log(`  ✅ 导出了 ${optionsType} 类型`);
        } else {
          console.warn(`  ⚠️  警告: 未导出 ${optionsType} 类型（但 feature.ts 中定义了）`);
          totalWarnings++;
        }
      }
    } else {
      console.error(`  ❌ 质量问题: 未导出任何类型定义`);
      qualityIssues++;
    }

  } catch (err) {
    console.error(`  ❌ 错误: 无法读取 index.ts - ${err.message}`);
    totalErrors++;
  }
}

// 总结
console.log('\n' + '='.repeat(60));
console.log('📊 验证总结');
console.log('='.repeat(60));
console.log(`总错误: ${totalErrors}`);
console.log(`总警告: ${totalWarnings}`);
console.log(`内容质量问题: ${qualityIssues}`);

if (totalErrors === 0 && totalWarnings === 0 && qualityIssues === 0) {
  console.log('\n✅ 所有 Feature 都符合规范且质量优秀！');
  process.exit(0);
} else if (totalErrors === 0 && qualityIssues === 0) {
  console.log(`\n⚠️  存在 ${totalWarnings} 个警告，但没有错误或质量问题`);
  process.exit(0);
} else if (totalErrors === 0) {
  console.log(`\n⚠️  存在 ${qualityIssues} 个质量问题和 ${totalWarnings} 个警告，但没有致命错误`);
  console.log(`建议修复质量问题以达到 "100% real, no fake, no mock" 标准`);
  process.exit(0);
} else {
  console.log(`\n❌ 存在 ${totalErrors} 个错误，请修复后重试`);
  process.exit(1);
}
