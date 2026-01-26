#!/usr/bin/env node

/**
 * Supramark Feature 增量更新工具
 *
 * 用法：
 *   node scripts/update-feature.js
 *   npm run update-feature
 *   npm run update-feature -- <feature-name>
 *
 * 功能：
 * - 扫描现有 Feature 包，检测缺失的配置和文件
 * - 生成更新报告，标识需要改进的地方
 * - 可选地自动生成缺失的文件（带 TODO 标记）
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { discoverFeaturePackages } = require('./feature-layout');

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
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

// 检查项定义
const CHECKS = {
  jestConfig: {
    name: 'Jest 配置',
    file: 'jest.config.cjs',
    severity: 'high',
    description: '缺少 Jest 配置文件，测试无法运行',
  },
  tsConfig: {
    name: 'TypeScript 配置',
    file: 'tsconfig.json',
    severity: 'high',
    description: '缺少 TypeScript 配置文件',
  },
  srcIndex: {
    name: '导出入口',
    file: 'src/index.ts',
    severity: 'high',
    description: '缺少包导出入口文件',
  },
  packageJson: {
    name: 'package.json',
    file: 'package.json',
    severity: 'critical',
    description: '缺少 package.json 文件',
  },
  tsJestDep: {
    name: 'ts-jest 依赖',
    check: (pkgPath) => {
      const pkgJsonPath = path.join(pkgPath, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) return false;
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const devDeps = pkgJson.devDependencies || {};
      return 'ts-jest' in devDeps;
    },
    severity: 'medium',
    description: 'package.json 中缺少 ts-jest 依赖',
  },
  multiNodeTypeGuidance: {
    name: '多节点类型指导注释',
    check: (pkgPath) => {
      const featurePath = path.join(pkgPath, 'src/feature.ts');
      if (!fs.existsSync(featurePath)) return false;
      const content = fs.readFileSync(featurePath, 'utf-8');
      return content.includes('多节点类型处理') || content.includes('节点类型说明');
    },
    severity: 'low',
    description: 'Feature 定义文件缺少多节点类型处理指导',
  },
};

// 生成 Jest 配置
function generateJestConfig() {
  return `/** @type {import('jest').Config} */
module.exports = {
  // 使用 Supramark 共享的 Jest preset
  // 与 @supramark/core 的测试配置保持一致
  ...require('../../jest.preset.cjs'),

  // Feature 包特定的配置可以在这里覆盖
  // 例如：
  // testEnvironment: 'jsdom', // 如果需要 DOM 环境
  // collectCoverage: true,     // 启用覆盖率收集
};
`;
}

// 生成 TypeScript 配置
function generateTsConfig() {
  return `{
  "extends": "../../tsconfig.base.json",
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

// 扫描 Feature 包
function scanFeaturePackages(specificFeature = null) {
  const all = discoverFeaturePackages();

  if (specificFeature) {
    const target = all.filter(
      (item) =>
        item.shortName === specificFeature ||
        item.name === specificFeature ||
        item.name.endsWith(`/feature-${specificFeature}`)
    );

    return target.map((item) => ({
      name: item.shortName,
      path: item.dir,
    }));
  }

  return all.map((item) => ({
    name: item.shortName,
    path: item.dir,
  }));
}

// 检查单个 Feature 包
function checkFeaturePackage(featurePkg) {
  const issues = [];
  const warnings = [];
  const suggestions = [];

  Object.entries(CHECKS).forEach(([key, check]) => {
    let hasProblem = false;

    if (check.file) {
      // 文件检查
      const filePath = path.join(featurePkg.path, check.file);
      hasProblem = !fs.existsSync(filePath);
    } else if (check.check) {
      // 自定义检查函数
      hasProblem = !check.check(featurePkg.path);
    }

    if (hasProblem) {
      const item = {
        name: check.name,
        description: check.description,
        severity: check.severity,
        key,
      };

      if (check.severity === 'critical' || check.severity === 'high') {
        issues.push(item);
      } else if (check.severity === 'medium') {
        warnings.push(item);
      } else {
        suggestions.push(item);
      }
    }
  });

  return { issues, warnings, suggestions };
}

// 生成报告
function generateReport(results) {
  log('\n📊 Feature 包检查报告\n', 'bright');
  log('=' .repeat(60), 'gray');

  let totalIssues = 0;
  let totalWarnings = 0;
  let totalSuggestions = 0;

  results.forEach(({ feature, result }) => {
    const { issues, warnings, suggestions } = result;
    const hasProblems = issues.length > 0 || warnings.length > 0 || suggestions.length > 0;

    if (!hasProblems) {
      log(`\n✅ ${feature.name}`, 'green');
      log('   无需更新，所有检查通过', 'gray');
      return;
    }

    log(`\n${issues.length > 0 ? '❌' : warnings.length > 0 ? '⚠️' : '💡'} ${feature.name}`,
      issues.length > 0 ? 'red' : warnings.length > 0 ? 'yellow' : 'blue');
    log(`   路径: ${path.relative(process.cwd(), feature.path)}`, 'gray');

    if (issues.length > 0) {
      log('\n   🚨 关键问题：', 'red');
      issues.forEach((issue) => {
        log(`      • ${issue.name}: ${issue.description}`, 'reset');
      });
      totalIssues += issues.length;
    }

    if (warnings.length > 0) {
      log('\n   ⚠️  警告：', 'yellow');
      warnings.forEach((warning) => {
        log(`      • ${warning.name}: ${warning.description}`, 'reset');
      });
      totalWarnings += warnings.length;
    }

    if (suggestions.length > 0) {
      log('\n   💡 建议：', 'blue');
      suggestions.forEach((suggestion) => {
        log(`      • ${suggestion.name}: ${suggestion.description}`, 'reset');
      });
      totalSuggestions += suggestions.length;
    }
  });

  log('\n' + '='.repeat(60), 'gray');
  log('\n📈 统计汇总：', 'bright');
  log(`   总包数: ${results.length}`, 'reset');
  log(`   关键问题: ${totalIssues}`, totalIssues > 0 ? 'red' : 'green');
  log(`   警告: ${totalWarnings}`, totalWarnings > 0 ? 'yellow' : 'green');
  log(`   建议: ${totalSuggestions}`, totalSuggestions > 0 ? 'blue' : 'green');

  return { totalIssues, totalWarnings, totalSuggestions };
}

// 自动修复问题
async function autoFix(results, options = {}) {
  const { dryRun = false } = options;

  log('\n🔧 开始自动修复...\n', 'bright');

  let fixedCount = 0;

  for (const { feature, result } of results) {
    const { issues, warnings } = result;
    const allProblems = [...issues, ...warnings];

    if (allProblems.length === 0) continue;

    log(`\n📦 ${feature.name}`, 'blue');

    for (const problem of allProblems) {
      const filePath = CHECKS[problem.key]?.file;

      if (!filePath) {
        // 非文件类问题，需要手动处理
        log(`   ⏭  跳过: ${problem.name} (需要手动处理)`, 'gray');
        continue;
      }

      const fullPath = path.join(feature.path, filePath);

      if (dryRun) {
        log(`   [DRY-RUN] 将创建: ${filePath}`, 'yellow');
        continue;
      }

      try {
        let content = '';

        if (problem.key === 'jestConfig') {
          content = generateJestConfig();
        } else if (problem.key === 'tsConfig') {
          content = generateTsConfig();
        } else if (problem.key === 'srcIndex') {
          // 尝试从现有 feature.ts 推断导出
          const featurePath = path.join(feature.path, 'src/feature.ts');
          if (fs.existsSync(featurePath)) {
            const featureContent = fs.readFileSync(featurePath, 'utf-8');
            const exportMatch = featureContent.match(/export\s+const\s+(\w+Feature)/);
            const featureName = exportMatch ? exportMatch[1] : 'feature';

            content = `/**
 * ${feature.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Feature
 *
 * @packageDocumentation
 */

// TODO: 确认导出的 Feature 名称是否正确
export { ${featureName} } from './feature.js';
`;
          } else {
            content = `// TODO: 添加 Feature 导出\nexport { feature } from './feature.js';\n`;
          }
        }

        if (content) {
          // 确保目录存在
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(fullPath, content, 'utf-8');
          log(`   ✅ 已创建: ${filePath}`, 'green');
          fixedCount++;
        }
      } catch (error) {
        log(`   ❌ 创建失败: ${filePath} (${error.message})`, 'red');
      }
    }
  }

  if (dryRun) {
    log(`\n[DRY-RUN] 预计可修复 ${fixedCount} 个问题`, 'yellow');
  } else {
    log(`\n✨ 自动修复完成！已修复 ${fixedCount} 个问题`, 'green');
  }

  return fixedCount;
}

// 主函数
async function main() {
  log('\n🔍 Supramark Feature 增量更新工具\n', 'bright');

  try {
    // 解析命令行参数
    const args = process.argv.slice(2);
    const specificFeature = args.find((arg) => !arg.startsWith('--'));
    const autoFixFlag = args.includes('--fix');
    const dryRunFlag = args.includes('--dry-run');

    if (args.includes('--help') || args.includes('-h')) {
      log(`
${colors.bright}用法：${colors.reset}
  npm run update-feature              # 检查所有 Feature 包
  npm run update-feature <name>       # 检查特定 Feature 包
  npm run update-feature -- --fix     # 自动修复可修复的问题
  npm run update-feature -- --dry-run --fix  # 预览修复而不实际执行

${colors.blue}选项：${colors.reset}
  --fix       自动修复可修复的问题（生成缺失文件）
  --dry-run   预览模式，显示将要修复的内容但不实际执行
  --help, -h  显示此帮助信息

${colors.blue}示例：${colors.reset}
  ${colors.gray}# 检查所有 Feature${colors.reset}
  npm run update-feature

  ${colors.gray}# 检查特定 Feature${colors.reset}
  npm run update-feature vega-lite

  ${colors.gray}# 预览自动修复${colors.reset}
  npm run update-feature -- --dry-run --fix

  ${colors.gray}# 执行自动修复${colors.reset}
  npm run update-feature -- --fix
`);
      process.exit(0);
    }

    // 1. 扫描 Feature 包
    log('正在扫描 Feature 包...', 'gray');
    const features = scanFeaturePackages(specificFeature);

    if (features.length === 0) {
      if (specificFeature) {
        log(`\n❌ 未找到 Feature: ${specificFeature}`, 'red');
        log('提示: 请确认在 packages/** 目录下存在对应的 @supramark/feature-* 包', 'gray');
      } else {
        log('\n未找到任何 Feature 包', 'yellow');
      }
      process.exit(1);
    }

    log(`找到 ${features.length} 个 Feature 包\n`, 'gray');

    // 2. 检查每个 Feature
    const results = features.map((feature) => ({
      feature,
      result: checkFeaturePackage(feature),
    }));

    // 3. 生成报告
    const stats = generateReport(results);

    // 4. 询问是否自动修复（如果没有 --fix 标志）
    if (!autoFixFlag && !dryRunFlag && (stats.totalIssues > 0 || stats.totalWarnings > 0)) {
      log('\n', 'reset');
      const answer = await question('是否自动生成缺失的文件？(y/N): ');

      if (answer.toLowerCase() === 'y') {
        await autoFix(results, { dryRun: false });
      } else {
        log('\n💡 提示: 你可以使用 npm run update-feature -- --fix 自动修复', 'blue');
      }
    } else if (autoFixFlag || dryRunFlag) {
      await autoFix(results, { dryRun: dryRunFlag });
    }

    // 5. 后续建议
    if (stats.totalIssues > 0 || stats.totalWarnings > 0 || stats.totalSuggestions > 0) {
      log('\n📝 后续步骤：', 'yellow');

      if (stats.totalIssues > 0) {
        log('  1. 解决关键问题（🚨 标记）', 'reset');
      }
      if (stats.totalWarnings > 0) {
        log('  2. 处理警告项（⚠️ 标记）', 'reset');
      }
      if (stats.totalSuggestions > 0) {
        log('  3. 考虑改进建议（💡 标记）', 'reset');
      }

      log('  4. 运行 npm run build 验证编译', 'reset');
      log('  5. 运行 npm test 验证测试\n', 'reset');
    } else {
      log('\n✨ 所有 Feature 包都符合最新标准！', 'green');
    }

  } catch (error) {
    log(`\n❌ 错误: ${error.message}\n`, 'red');
    if (error.stack) {
      log(error.stack, 'gray');
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

// 运行
main();
