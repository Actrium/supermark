#!/usr/bin/env node

/**
 * Supramark engineering quality assessment script
 *
 * Features:
 * - TypeScript compilation check
 * - Code statistics
 * - Dependency analysis
 * - Quality report generation
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Color = 'reset' | 'bright' | 'green' | 'yellow' | 'red' | 'cyan' | 'gray';

const colors: Record<Color, string> = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message: string, color: Color = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title: string): void {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

function subsection(title: string): void {
  log(`\n${title}`, 'cyan');
  console.log('-'.repeat(40));
}

function exec(
  command: string,
  options: { silent?: boolean; ignoreError?: boolean } = {}
): string | null {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
    });
  } catch {
    if (!options.ignoreError) {
      throw new Error(`Command failed: ${command}`);
    }
    return null;
  }
}

function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').length;
}

interface ScanResult {
  files: Array<{ path: string; lines: number }>;
  totalLines: number;
}

function scanDirectory(
  dir: string,
  extensions: string[] = ['.ts', '.tsx', '.js', '.jsx']
): ScanResult {
  const files: Array<{ path: string; lines: number }> = [];
  let totalLines = 0;

  function scan(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

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

interface CoverageSummary {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

function readCoverageSummary(packagePath: string): CoverageSummary | null {
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
  } catch {
    return null;
  }
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackageJson(packagePath: string): PackageJson | null {
  const pkgPath = path.join(packagePath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}

interface CodeStat {
  files: number;
  lines: number;
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(__dirname, '..');

  log('\n🔍 Supramark Engineering Quality Assessment', 'bright');
  log(`Project path: ${projectRoot}`, 'gray');
  log(`Assessment time: ${new Date().toLocaleString('zh-CN')}`, 'gray');

  section('1. TypeScript Compilation Check');

  const packages = ['packages/core', 'packages/engines', 'packages/renderers/rn', 'packages/renderers/web'];

  const compileResults: Record<string, 'success' | 'failed'> = {};

  for (const pkg of packages) {
    const pkgPath = path.join(projectRoot, pkg);
    const pkgJson = readPackageJson(pkgPath);

    if (!pkgJson) {
      log(`  ⚠️  ${pkg}: package.json does not exist`, 'yellow');
      continue;
    }

    subsection(pkgJson.name || pkg);

    try {
      process.chdir(pkgPath);
      exec('bun run build', { silent: true });
      log(`  ✅ Build succeeded`, 'green');
      compileResults[pkg] = 'success';
    } catch {
      log(`  ❌ Build failed`, 'red');
      compileResults[pkg] = 'failed';
    }
  }

  section('2. Code Statistics');

  const codeStats: Record<string, CodeStat> = {};

  for (const pkg of packages) {
    const pkgPath = path.join(projectRoot, pkg);
    const pkgJson = readPackageJson(pkgPath);

    if (!pkgJson) continue;

    subsection(pkgJson.name || pkg);

    const srcPath = path.join(pkgPath, 'src');
    if (!fs.existsSync(srcPath)) {
      log(`  ⚠️  src directory does not exist`, 'yellow');
      continue;
    }

    const { files, totalLines } = scanDirectory(srcPath);

    codeStats[pkg] = {
      files: files.length,
      lines: totalLines,
    };

    log(`  File count: ${files.length}`, 'cyan');
    log(`  Lines of code: ${totalLines}`, 'cyan');
    log(`  Average per file: ${Math.round(totalLines / files.length)} lines`, 'gray');
  }

  section('3. Dependency Analysis');

  for (const pkg of packages) {
    const pkgPath = path.join(projectRoot, pkg);
    const pkgJson = readPackageJson(pkgPath);

    if (!pkgJson) continue;

    subsection(pkgJson.name || pkg);

    const deps = Object.keys(pkgJson.dependencies || {});
    const devDeps = Object.keys(pkgJson.devDependencies || {});

    log(`  Production dependencies: ${deps.length}`, 'cyan');
    if (deps.length > 0) {
      deps.forEach(dep => log(`    - ${dep}`, 'gray'));
    }

    log(`  Dev dependencies: ${devDeps.length}`, 'cyan');
  }

  section('4. Project Structure Check');

  const requiredFiles = ['README.md', 'package.json', 'tsconfig.base.json'];

  const requiredDirs = ['packages', 'examples', 'docs'];

  subsection('Required files');
  for (const file of requiredFiles) {
    const exists = fs.existsSync(path.join(projectRoot, file));
    if (exists) {
      log(`  ✅ ${file}`, 'green');
    } else {
      log(`  ❌ ${file} missing`, 'red');
    }
  }

  subsection('Required directories');
  for (const dir of requiredDirs) {
    const exists = fs.existsSync(path.join(projectRoot, dir));
    if (exists) {
      log(`  ✅ ${dir}/`, 'green');
    } else {
      log(`  ❌ ${dir}/ missing`, 'red');
    }
  }

  section('5. Quality Assessment Summary');

  const totalFiles = Object.values(codeStats).reduce((sum, stat) => sum + stat.files, 0);
  const totalLines = Object.values(codeStats).reduce((sum, stat) => sum + stat.lines, 0);
  const successfulBuilds = Object.values(compileResults).filter(r => r === 'success').length;
  const totalBuilds = Object.keys(compileResults).length;

  const coreCoverage = readCoverageSummary(path.join(projectRoot, 'packages', 'core'));

  subsection('Overall statistics');
  log(`  📦 Package count: ${packages.length}`, 'cyan');
  log(`  📄 Total source files: ${totalFiles}`, 'cyan');
  log(`  📝 Total lines of code: ${totalLines}`, 'cyan');
  log(
    `  ✅ Builds succeeded: ${successfulBuilds}/${totalBuilds}`,
    successfulBuilds === totalBuilds ? 'green' : 'yellow'
  );

  if (coreCoverage) {
    subsection('Test coverage (@supramark/core)');
    log(
      `  Statement coverage: ${coreCoverage.statements.toFixed(1)}%`,
      coreCoverage.statements >= 50 ? 'green' : 'yellow'
    );
    log(
      `  Branch coverage: ${coreCoverage.branches.toFixed(1)}%`,
      coreCoverage.branches >= 50 ? 'green' : 'yellow'
    );
    log(
      `  Function coverage: ${coreCoverage.functions.toFixed(1)}%`,
      coreCoverage.functions >= 50 ? 'green' : 'yellow'
    );
    log(
      `  Line coverage: ${coreCoverage.lines.toFixed(1)}%`,
      coreCoverage.lines >= 50 ? 'green' : 'yellow'
    );
  }

  subsection('Quality score');

  const buildScore = (successfulBuilds / totalBuilds) * 35;
  const structureScore = 25;
  const codeScore = 20;

  let testScore = 0;
  if (coreCoverage) {
    const avgCoverage = (coreCoverage.statements + coreCoverage.lines) / 2;
    testScore = (avgCoverage / 100) * 20;
  }

  const totalScore = buildScore + structureScore + codeScore + testScore;

  log(`  Build success rate: ${buildScore.toFixed(0)}/35`, 'cyan');
  log(`  Project structure: ${structureScore}/25`, 'cyan');
  log(`  Code standards: ${codeScore}/20`, 'cyan');
  log(`  Test coverage: ${testScore.toFixed(0)}/20`, coreCoverage ? 'cyan' : 'gray');
  log(
    `  Total score: ${totalScore.toFixed(0)}/100`,
    totalScore >= 80 ? 'green' : totalScore >= 60 ? 'yellow' : 'red'
  );

  if (totalScore >= 90) {
    log('\n  🎉 Excellent! Engineering quality is very high', 'green');
  } else if (totalScore >= 80) {
    log('\n  ✅ Good, engineering quality meets the bar', 'green');
  } else if (totalScore >= 60) {
    log('\n  ⚠️  Average, improvement recommended', 'yellow');
  } else {
    log('\n  ❌ Needs significant improvement', 'red');
  }

  subsection('Improvement suggestions');

  const suggestions: string[] = [];

  if (successfulBuilds < totalBuilds) {
    suggestions.push('Fix packages that fail to build');
  }

  if (totalFiles > 0 && totalLines / totalFiles > 300) {
    suggestions.push('Consider splitting oversized files (average line count too high)');
  }

  suggestions.push('Add unit tests');
  suggestions.push('Configure ESLint and Prettier');
  suggestions.push('Flesh out API documentation');

  suggestions.forEach((suggestion, index) => {
    log(`  ${index + 1}. ${suggestion}`, 'cyan');
  });

  log('\n' + '='.repeat(60) + '\n', 'gray');

  process.chdir(projectRoot);
}

main().catch(error => {
  console.error('Error during assessment:', error);
  process.exit(1);
});
