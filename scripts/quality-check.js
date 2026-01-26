#!/usr/bin/env node

/**
 * Supramark 工程质量评估脚本
 *
 * 功能：
 * - TypeScript 编译检查
 * - 代码统计
 * - 依赖分析
 * - 生成质量报告
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

function subsection(title) {
  log(`\n${title}`, 'cyan');
  console.log('-'.repeat(40));
}

// 执行命令并捕获输出
function exec(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    });
  } catch (error) {
    if (!options.ignoreError) {
      throw error;
    }
    return null;
  }
}

// 统计代码行数
function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').length;
}

// 递归扫描目录
function scanDirectory(dir, extensions = ['.ts', '.tsx', '.js', '.jsx']) {
  let files = [];
  let totalLines = 0;

  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      // 跳过 node_modules 和 dist
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          const lines = countLines(fullPath);
          files.push({ path: fullPath, lines });
          totalLines += lines;
        }
      }
    }
  }

  scan(dir);
  return { files, totalLines };
}

// 读取测试覆盖率
function readCoverageSummary(packagePath) {
  const coveragePath = path.join(packagePath, 'coverage', 'coverage-summary.json');

  if (!fs.existsSync(coveragePath)) {
    return null;
  }

  try {
    const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
    const total = coverageData.total;

    return {
      statements: total.statements.pct,
      branches: total.branches.pct,
      functions: total.functions.pct,
      lines: total.lines.pct,
    };
  } catch (error) {
    return null;
  }
}

// 读取 package.json
function readPackageJson(packagePath) {
  const pkgPath = path.join(packagePath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}

// 主函数
async function main() {
  const projectRoot = path.resolve(__dirname, '..');

  log('\n🔍 Supramark 工程质量评估', 'bright');
  log(`项目路径: ${projectRoot}`, 'gray');
  log(`评估时间: ${new Date().toLocaleString('zh-CN')}`, 'gray');

  // 1. TypeScript 编译检查
  section('1. TypeScript 编译检查');

  const packages = [
    'packages/core',
    'packages/rn',
    'packages/rn-diagram-worker',
    'packages/web',
  ];

  const compileResults = {};

  for (const pkg of packages) {
    const pkgPath = path.join(projectRoot, pkg);
    const pkgJson = readPackageJson(pkgPath);

    if (!pkgJson) {
      log(`  ⚠️  ${pkg}: package.json 不存在`, 'yellow');
      continue;
    }

    subsection(pkgJson.name);

    try {
      process.chdir(pkgPath);
      exec('bun run build', { silent: true });
      log(`  ✅ 编译成功`, 'green');
      compileResults[pkg] = 'success';
    } catch (error) {
      log(`  ❌ 编译失败`, 'red');
      compileResults[pkg] = 'failed';
    }
  }

  // 2. 代码统计
  section('2. 代码统计');

  const codeStats = {};

  for (const pkg of packages) {
    const pkgPath = path.join(projectRoot, pkg);
    const pkgJson = readPackageJson(pkgPath);

    if (!pkgJson) continue;

    subsection(pkgJson.name);

    const srcPath = path.join(pkgPath, 'src');
    if (!fs.existsSync(srcPath)) {
      log(`  ⚠️  src 目录不存在`, 'yellow');
      continue;
    }

    const { files, totalLines } = scanDirectory(srcPath);

    codeStats[pkg] = {
      files: files.length,
      lines: totalLines,
    };

    log(`  文件数量: ${files.length}`, 'cyan');
    log(`  代码行数: ${totalLines}`, 'cyan');
    log(`  平均每文件: ${Math.round(totalLines / files.length)} 行`, 'gray');
  }

  // 3. 依赖分析
  section('3. 依赖分析');

  for (const pkg of packages) {
    const pkgPath = path.join(projectRoot, pkg);
    const pkgJson = readPackageJson(pkgPath);

    if (!pkgJson) continue;

    subsection(pkgJson.name);

    const deps = Object.keys(pkgJson.dependencies || {});
    const devDeps = Object.keys(pkgJson.devDependencies || {});

    log(`  生产依赖: ${deps.length}`, 'cyan');
    if (deps.length > 0) {
      deps.forEach(dep => log(`    - ${dep}`, 'gray'));
    }

    log(`  开发依赖: ${devDeps.length}`, 'cyan');
  }

  // 4. 项目结构检查
  section('4. 项目结构检查');

  const requiredFiles = [
    'README.md',
    'package.json',
    'tsconfig.base.json',
    'TODO.md',
    'TODO2.md',
    'COLLABORATION.md',
  ];

  const requiredDirs = [
    'packages',
    'examples',
    'docs',
  ];

  subsection('必需文件');
  for (const file of requiredFiles) {
    const exists = fs.existsSync(path.join(projectRoot, file));
    if (exists) {
      log(`  ✅ ${file}`, 'green');
    } else {
      log(`  ❌ ${file} 缺失`, 'red');
    }
  }

  subsection('必需目录');
  for (const dir of requiredDirs) {
    const exists = fs.existsSync(path.join(projectRoot, dir));
    if (exists) {
      log(`  ✅ ${dir}/`, 'green');
    } else {
      log(`  ❌ ${dir}/ 缺失`, 'red');
    }
  }

  // 5. 生成总结报告
  section('5. 质量评估总结');

  const totalFiles = Object.values(codeStats).reduce((sum, stat) => sum + stat.files, 0);
  const totalLines = Object.values(codeStats).reduce((sum, stat) => sum + stat.lines, 0);
  const successfulBuilds = Object.values(compileResults).filter(r => r === 'success').length;
  const totalBuilds = Object.keys(compileResults).length;

  // 读取测试覆盖率
  const coreCoverage = readCoverageSummary(path.join(projectRoot, 'packages', 'core'));

  subsection('整体统计');
  log(`  📦 包数量: ${packages.length}`, 'cyan');
  log(`  📄 源文件总数: ${totalFiles}`, 'cyan');
  log(`  📝 代码总行数: ${totalLines}`, 'cyan');
  log(`  ✅ 编译成功: ${successfulBuilds}/${totalBuilds}`, successfulBuilds === totalBuilds ? 'green' : 'yellow');

  if (coreCoverage) {
    subsection('测试覆盖率 (@supramark/core)');
    log(`  语句覆盖率: ${coreCoverage.statements.toFixed(1)}%`, coreCoverage.statements >= 50 ? 'green' : 'yellow');
    log(`  分支覆盖率: ${coreCoverage.branches.toFixed(1)}%`, coreCoverage.branches >= 50 ? 'green' : 'yellow');
    log(`  函数覆盖率: ${coreCoverage.functions.toFixed(1)}%`, coreCoverage.functions >= 50 ? 'green' : 'yellow');
    log(`  行覆盖率: ${coreCoverage.lines.toFixed(1)}%`, coreCoverage.lines >= 50 ? 'green' : 'yellow');
  }

  subsection('质量评分');

  const buildScore = (successfulBuilds / totalBuilds) * 35; // 编译成功率 35%
  const structureScore = 25; // 项目结构 25%（简化评估）
  const codeScore = 20; // 代码规范 20%（简化评估）

  // 测试覆盖率评分（20%）
  let testScore = 0;
  if (coreCoverage) {
    const avgCoverage = (coreCoverage.statements + coreCoverage.lines) / 2;
    testScore = (avgCoverage / 100) * 20;
  }

  const totalScore = buildScore + structureScore + codeScore + testScore;

  log(`  编译成功率: ${buildScore.toFixed(0)}/35`, 'cyan');
  log(`  项目结构: ${structureScore}/25`, 'cyan');
  log(`  代码规范: ${codeScore}/20`, 'cyan');
  log(`  测试覆盖: ${testScore.toFixed(0)}/20`, coreCoverage ? 'cyan' : 'gray');
  log(`  总分: ${totalScore.toFixed(0)}/100`, totalScore >= 80 ? 'green' : totalScore >= 60 ? 'yellow' : 'red');

  if (totalScore >= 90) {
    log('\n  🎉 优秀！工程质量非常高', 'green');
  } else if (totalScore >= 80) {
    log('\n  ✅ 良好，工程质量达标', 'green');
  } else if (totalScore >= 60) {
    log('\n  ⚠️  一般，建议改进', 'yellow');
  } else {
    log('\n  ❌ 需要重点改进', 'red');
  }

  subsection('改进建议');

  const suggestions = [];

  if (successfulBuilds < totalBuilds) {
    suggestions.push('修复编译失败的包');
  }

  if (totalLines / totalFiles > 300) {
    suggestions.push('考虑拆分过大的文件（平均行数过多）');
  }

  suggestions.push('添加单元测试');
  suggestions.push('配置 ESLint 和 Prettier');
  suggestions.push('设置 CI/CD 流程');
  suggestions.push('完善 API 文档');

  suggestions.forEach((suggestion, index) => {
    log(`  ${index + 1}. ${suggestion}`, 'cyan');
  });

  log('\n' + '='.repeat(60) + '\n', 'gray');

  // 切换回原始目录
  process.chdir(projectRoot);
}

// 运行
main().catch(error => {
  console.error('评估过程出错:', error);
  process.exit(1);
});
